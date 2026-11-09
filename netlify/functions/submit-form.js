// ============================================
// SIPOP — Netlify Function: submit-form
// Ponte entre o formulário do site e o Google Apps Script.
//
// Por que isso existe:
// O Apps Script só aceita POST em modo 'no-cors' quando chamado direto
// do browser — e no-cors impede o JS de ler status ou corpo da resposta,
// então o front nunca sabia se o lead realmente foi salvo.
//
// Esta function roda no servidor (Netlify), então a chamada pro Apps
// Script é server-to-server: sem restrição de CORS, resposta legível.
// O front passa a chamar só esta function (mesma origem, sem no-cors)
// e recebe um status real de volta.
// ============================================

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyj_x-S65t3iPFqQ-eDgrqYvmMEGscp-Yk6wXAarIxcddTt9iyTsF_tZfe1I96T3gzH/exec';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ============================================
// E-mail de primeiro contato (Resend)
//
// Assim que o lead é salvo, o próprio lead recebe um e-mail de boas-vindas.
// Variáveis de ambiente (Netlify > Site configuration > Environment variables):
//   RESEND_API_KEY   — obrigatória; sem ela o envio é pulado (o lead segue salvo)
//   RESEND_FROM      — remetente, num domínio verificado no Resend
//                      (padrão: "SIPOP <contact@sipopscience.com>")
//   RESEND_REPLY_TO  — para onde vão as respostas do lead
//                      (padrão: contact@sipopscience.com)
//
// Falha no e-mail NUNCA derruba o formulário: só fica registrada no log
// da function. O lead já está na planilha e a equipe já foi notificada.
// ============================================

const { buildFirstContactEmail } = require('../emails/first-contact');

const RESEND_ENDPOINT   = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 5000;

async function sendFirstContactEmail(payload) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn('submit-form: RESEND_API_KEY não configurada — e-mail de primeiro contato não enviado');
        return;
    }

    const { subject, html, text } = buildFirstContactEmail(payload);

    // Mesmo envio repetido (ex.: duplo clique, retry do front) não gera
    // dois e-mails: o Resend descarta chamadas com a mesma Idempotency-Key.
    const idempotencyKey = 'first-contact/' + String(payload.event_id || (payload.email + '/' + payload.timestamp)).slice(0, 200);

    try {
        const response = await fetch(RESEND_ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization':   'Bearer ' + apiKey,
                'Content-Type':    'application/json',
                'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify({
                from:     process.env.RESEND_FROM     || 'SIPOP <contact@sipopscience.com>',
                to:       [String(payload.email).trim()],
                reply_to: process.env.RESEND_REPLY_TO || 'contact@sipopscience.com',
                subject,
                html,
                text,
                tags: [{ name: 'type', value: 'first_contact' }],
            }),
            signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
        });

        if (!response.ok) {
            const detail = await response.text();
            console.error('submit-form: Resend recusou o e-mail de primeiro contato', response.status, detail.slice(0, 500));
        }
    } catch (error) {
        console.error('submit-form: falha ao chamar o Resend', error);
    }
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: JSON_HEADERS,
            body: JSON.stringify({ status: 'error', message: 'Method not allowed' }),
        };
    }

    let payload;
    try {
        payload = JSON.parse(event.body || '{}');
    } catch (err) {
        return {
            statusCode: 400,
            headers: JSON_HEADERS,
            body: JSON.stringify({ status: 'error', message: 'Invalid JSON body' }),
        };
    }

    // Validação mínima — evita repassar lixo pro Apps Script
    if (!payload.name || !payload.email) {
        return {
            statusCode: 400,
            headers: JSON_HEADERS,
            body: JSON.stringify({ status: 'error', message: 'Missing required fields (name, email)' }),
        };
    }

    try {
        const gasResponse = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
            redirect: 'follow', // Apps Script sempre responde com um 302 antes do conteúdo real
        });

        const rawText = await gasResponse.text();

        let gasData;
        try {
            gasData = JSON.parse(rawText);
        } catch (parseErr) {
            // Acontece, por exemplo, quando a implantação expirou/perdeu
            // permissão e o Apps Script devolve uma página HTML de erro
            // do Google em vez do JSON esperado.
            console.error('submit-form: resposta inesperada do Apps Script', rawText.slice(0, 500));
            return {
                statusCode: 502,
                headers: JSON_HEADERS,
                body: JSON.stringify({
                    status: 'error',
                    message: 'Unexpected response from Apps Script (deployment may be broken)',
                }),
            };
        }

        if (!gasResponse.ok || gasData.status !== 'success') {
            console.error('submit-form: Apps Script reportou falha', gasData);
            return {
                statusCode: 502,
                headers: JSON_HEADERS,
                body: JSON.stringify({
                    status: 'error',
                    message: gasData.message || 'Apps Script reported failure',
                }),
            };
        }

        // Precisa ser aguardado: a Netlify congela a function assim que
        // ela responde, e um envio "solto" poderia nunca sair.
        await sendFirstContactEmail(payload);

        return {
            statusCode: 200,
            headers: JSON_HEADERS,
            body: JSON.stringify({ status: 'success' }),
        };

    } catch (error) {
        console.error('submit-form: falha ao alcançar o Apps Script', error);
        return {
            statusCode: 502,
            headers: JSON_HEADERS,
            body: JSON.stringify({ status: 'error', message: 'Failed to reach Apps Script: ' + error.message }),
        };
    }
};
