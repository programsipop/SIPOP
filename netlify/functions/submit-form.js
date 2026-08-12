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
