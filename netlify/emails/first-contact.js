// ============================================
// SIPOP — E-mail de primeiro contato (enviado ao lead)
//
// Disparado pela function submit-form logo depois que o lead é salvo
// na planilha. O idioma segue o campo "preferredLanguage" do formulário
// (English / Spanish / Portuguese); sem ele, cai em português.
//
// Para mudar o texto, edite só os blocos COPY abaixo. Cada idioma tem
// assunto, saudação, parágrafos e assinatura. "{firstName}" é trocado
// pelo primeiro nome do lead.
// ============================================

const COPY = {
    pt: {
        subject:   'Recebemos seu contato — SIPOP',
        greeting:  'Olá, {firstName}!',
        greetingNoName: 'Olá!',
        paragraphs: [
            'Obrigado por entrar em contato com o SIPOP. Recebemos suas informações e nossa equipe já está analisando o seu caso.',
            'Em breve um dos nossos especialistas vai falar com você para entender melhor o seu projeto e explicar os próximos passos.',
            'Se quiser adiantar a conversa, é só responder este e-mail contando em que fase está o seu estudo, o prazo que você tem em mente e, se já tiver, a revista em que pretende publicar.',
        ],
        signoff:   'Um abraço,',
        signature: 'Equipe SIPOP',
    },
    en: {
        subject:   'We received your message — SIPOP',
        greeting:  'Hi {firstName},',
        greetingNoName: 'Hi,',
        paragraphs: [
            'Thank you for reaching out to SIPOP. We have received your information and our team is already reviewing it.',
            'One of our specialists will contact you shortly to learn more about your project and walk you through the next steps.',
            'If you would like to get a head start, simply reply to this email and tell us what stage your study is at, your target timeline and, if you already have one, the journal you are aiming for.',
        ],
        signoff:   'Best regards,',
        signature: 'The SIPOP Team',
    },
    es: {
        subject:   'Recibimos tu mensaje — SIPOP',
        greeting:  '¡Hola, {firstName}!',
        greetingNoName: '¡Hola!',
        paragraphs: [
            'Gracias por contactar a SIPOP. Recibimos tu información y nuestro equipo ya la está analizando.',
            'En breve uno de nuestros especialistas se comunicará contigo para conocer mejor tu proyecto y explicarte los próximos pasos.',
            'Si quieres adelantar la conversación, responde este correo contándonos en qué etapa está tu estudio, el plazo que tienes en mente y, si ya la tienes, la revista en la que piensas publicar.',
        ],
        signoff:   'Un saludo,',
        signature: 'Equipo SIPOP',
    },
};

const SITE_URL = 'https://sipopscience.com';
const BRAND_COLOR = '#2C7A7B';

function pickLang(preferredLanguage) {
    const value = String(preferredLanguage || '').toLowerCase();
    if (value.startsWith('en')) return 'en';
    if (value.startsWith('es') || value.startsWith('sp')) return 'es';
    return 'pt';
}

function firstNameOf(name) {
    const first = String(name || '').trim().split(/\s+/)[0] || '';
    // "MARIA" / "maria" -> "Maria"
    return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : '';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildFirstContactEmail(lead) {
    const lang = pickLang(lead.preferredLanguage);
    const copy = COPY[lang];
    const firstName = firstNameOf(lead.name);

    const greeting = firstName
        ? copy.greeting.replace('{firstName}', firstName)
        : copy.greetingNoName;

    const text = [
        greeting,
        '',
        ...copy.paragraphs.flatMap((p) => [p, '']),
        copy.signoff,
        copy.signature,
        SITE_URL,
    ].join('\n');

    const paragraphsHtml = copy.paragraphs
        .map((p) => `<p style="margin:0 0 16px;">${escapeHtml(p)}</p>`)
        .join('\n');

    const html = `<!doctype html>
<html lang="${lang === 'pt' ? 'pt-BR' : lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;border-top:4px solid ${BRAND_COLOR};">
        <tr><td style="padding:32px 28px;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1a202c;">
          <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
          ${paragraphsHtml}
          <p style="margin:24px 0 0;">${escapeHtml(copy.signoff)}<br><strong>${escapeHtml(copy.signature)}</strong></p>
          <p style="margin:24px 0 0;font-size:13px;"><a href="${SITE_URL}" style="color:${BRAND_COLOR};text-decoration:none;">sipopscience.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return { subject: copy.subject, html, text, lang };
}

module.exports = { buildFirstContactEmail };
