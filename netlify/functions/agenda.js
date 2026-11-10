// ============================================
// SIPOP — Netlify Function: agenda
// Ponte entre as páginas de agendamento (/agendar, /confirmar, /agenda-admin)
// e o Google Apps Script (agenda.gs).
//
// Mesmo motivo da submit-form: chamada server-to-server, sem CORS, e o
// front recebe um JSON legível. Só repassa ações "agenda.*" — toda a regra
// (horários livres, senha do painel, envio das mensagens) fica no Apps Script.
// ============================================

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyj_x-S65t3iPFqQ-eDgrqYvmMEGscp-Yk6wXAarIxcddTt9iyTsF_tZfe1I96T3gzH/exec';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const MAX_BODY_BYTES = 200 * 1024;

function reply(statusCode, body) {
    return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return reply(405, { status: 'error', code: 'method_not_allowed' });
    }
    if ((event.body || '').length > MAX_BODY_BYTES) {
        return reply(413, { status: 'error', code: 'too_large' });
    }

    let payload;
    try {
        payload = JSON.parse(event.body || '{}');
    } catch (err) {
        return reply(400, { status: 'error', code: 'invalid_json' });
    }
    if (typeof payload.action !== 'string' || payload.action.indexOf('agenda.') !== 0) {
        return reply(400, { status: 'error', code: 'unknown_action' });
    }

    try {
        const gasResponse = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            redirect: 'follow', // Apps Script sempre responde com um 302 antes do conteúdo real
        });

        const rawText = await gasResponse.text();
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            // Implantação quebrada/sem permissão: o Google devolve HTML em vez de JSON.
            console.error('agenda: resposta inesperada do Apps Script', rawText.slice(0, 500));
            return reply(502, { status: 'error', code: 'bad_gateway' });
        }

        if (data.status !== 'success') console.warn('agenda:', payload.action, data.code, data.message);
        // Erros de regra (horário ocupado, senha errada…) voltam com 200: o front decide pelo "code".
        return reply(200, data);
    } catch (error) {
        console.error('agenda: falha ao alcançar o Apps Script', error);
        return reply(502, { status: 'error', code: 'bad_gateway' });
    }
};
