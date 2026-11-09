// ============================================
// SIPOP — Sequência de remarketing (Google Apps Script)
//
// Fica no MESMO projeto do apps-script.gs (crie um segundo arquivo
// "remarketing.gs" no editor do Apps Script e cole este código).
//
// O QUE FAZ
// Uma vez por dia, olha a aba "SIPOP Contacts" e, para cada lead com
// Status (coluna Q) = "Sem resposta", envia o próximo e-mail de uma
// sequência de 4, pelo Resend, respeitando 7 dias entre cada um:
//   E-mail 1 — 7 dias depois do contato (data da coluna A)
//   E-mail 2 — 7 dias depois do e-mail 1
//   E-mail 3 — 7 dias depois do e-mail 2
//   E-mail 4 — 7 dias depois do e-mail 3 (último)
//
// Se o Status mudar (ex.: "Em negociação", "Fechado"), a sequência para
// na hora. Se voltar para "Sem resposta", continua de onde parou.
// O idioma segue a coluna H (Preferred Language).
//
// COLUNAS
// Tudo é localizado pelo NOME do cabeçalho (como no apps-script-details.gs),
// então funciona mesmo que colunas sejam acrescentadas ou mudem de lugar.
// Lê: Date, Name, Email, Preferred Language, Status.
// Cria no FIM da planilha, se ainda não existirem:
//   "Remarketing (etapa)"        — etapa enviada (1 a 4) ou "Descadastrado"
//   "Remarketing (último envio)" — data do último envio
//
// CONFIGURAÇÃO (uma vez)
// 1. Projeto do Apps Script > Configurações do projeto (engrenagem) >
//    Propriedades do script > adicionar RESEND_API_KEY com a chave do Resend.
// 2. Rode a função setupRemarketingTrigger() uma vez (cria o gatilho diário
//    às 9h) e autorize as permissões pedidas.
// 3. Implante uma nova versão do Web App (o link de descadastro usa o doGet
//    deste arquivo). Veja o passo a passo no topo do apps-script.gs.
//
// FUNÇÕES ÚTEIS (rode pelo editor)
//   previewRemarketing()      — mostra no log quem receberia o quê hoje, sem enviar
//   sendRemarketingTest()     — envia os 4 e-mails (PT) para REMARKETING_TEST_EMAIL
//   sendRemarketing()         — o envio real (é o que o gatilho diário chama)
// ============================================

const REMARKETING = {
    STATUS_TRIGGER:  'sem resposta',      // comparado sem acento/maiúsculas
    INTERVAL_DAYS:   7,
    TOTAL_STEPS:     4,
    MAX_PER_RUN:     80,                  // trava de segurança por execução
    TRIGGER_HOUR:    9,                   // hora do disparo diário (fuso do projeto)

    // Nomes de cabeçalho aceitos para cada coluna (comparados sem acento/maiúsculas)
    HEADERS: {
        date:     ['Date', 'Data'],
        name:     ['Name', 'Nome'],
        email:    ['Email', 'E-mail'],
        language: ['Preferred Language', 'Idioma preferido', 'Idioma'],
        status:   ['Status'],
    },
    STEP_HEADER:      'Remarketing (etapa)',
    LAST_SENT_HEADER: 'Remarketing (último envio)',

    FROM:            'SIPOP <contact@sipopscience.com>',
    REPLY_TO:        'contact@sipopscience.com',
    SITE_URL:        'https://sipopscience.com',
    BRAND_COLOR:     '#2C7A7B',

    // URL do Web App (a mesma usada pela Netlify Function). O link de
    // descadastro aponta pra cá.
    WEB_APP_URL:     'https://script.google.com/macros/s/AKfycbyj_x-S65t3iPFqQ-eDgrqYvmMEGscp-Yk6wXAarIxcddTt9iyTsF_tZfe1I96T3gzH/exec',

    UNSUBSCRIBED:    'Descadastrado',
};

const REMARKETING_TEST_EMAIL = 'felipe.dgsgames@gmail.com';

// Depoimento usado no e-mail 2 — mesmo texto, nome, cargo e instituição de
// src/_data/testimonials.json (id "suzana"). Se mudar no site, mude aqui.
const TESTIMONIAL_SUZANA = {
    name:   'Suzana Bleckmann Reis',
    org:    'Faculdade de Medicina — Universidade de São Paulo',
    avatar: 'https://sipopscience.com/email/suzana.png',
    pt: { role: 'Doutoranda em Ciências da Reabilitação',      quote: 'Antes do SIPOP, meu maior desafio era encontrar alguém que realmente entendesse de metanálise em rede. Eu não encontrava quem respondesse minhas dúvidas, nem um estatístico disposto a se comprometer com meu estudo. O SIPOP me trouxe tranquilidade, e para quem está na reta final do doutorado, isso vale muito.' },
    en: { role: 'PhD Candidate in Rehabilitation Sciences',    quote: 'Before SIPOP, my biggest challenge was finding someone who truly understood network meta-analysis. I couldn\'t find anyone to answer my questions, or a statistician willing to commit to my study. SIPOP gave me peace of mind. And for someone in the final stretch of a PhD, that\'s worth everything.' },
    es: { role: 'Doctoranda en Ciencias de la Rehabilitación', quote: 'Antes de SIPOP, mi mayor desafío era encontrar a alguien que realmente entendiera el metanálisis en red. No encontraba quién respondiera mis dudas, ni un estadístico dispuesto a comprometerse con mi estudio. SIPOP me dio tranquilidad, y para quien está en la recta final del doctorado, eso lo vale todo.' },
};

// ============================================
// TEXTOS — edite aqui
// Cada parágrafo pode ser uma string, { list: [...] } para uma lista ou
// { testimonial: TESTIMONIAL_X } para um depoimento no formato do site.
// "{firstName}" vira o primeiro nome do lead.
// cta (opcional): botão com link para uma página do site (sem o prefixo de idioma).
// ============================================

const REMARKETING_COPY = {
    pt: {
        greeting:       'Olá, {firstName}!',
        greetingNoName: 'Olá!',
        signoff:        'Um abraço,',
        signature:      'Equipe SIPOP',
        footer:         'Você está recebendo este e-mail porque entrou em contato com o SIPOP pelo nosso site.',
        unsubscribe:    'Não quero mais receber estes e-mails',
        steps: [
            {
                subject: 'Sua pesquisa ainda está nos planos?',
                paragraphs: [
                    'Você entrou em contato com o SIPOP e ainda não conseguimos conversar. Sabemos como a rotina de pesquisa aperta, então quisemos retomar.',
                    'Se o seu objetivo continua de pé, seja concluir um trabalho acadêmico, fortalecer o currículo ou publicar em uma revista de alto impacto, podemos ajudar a definir o melhor caminho para o seu estudo.',
                    'É só responder este e-mail contando em que fase está a pesquisa e qual é o seu prazo. A partir daí indicamos os próximos passos, sem compromisso.',
                ],
            },
            {
                subject: 'O que outros pesquisadores dizem sobre o SIPOP',
                paragraphs: [
                    'Muitos pesquisadores chegam até nós com a mesma sensação: um estudo importante parado por dúvidas de metodologia ou de estatística, e ninguém disponível para ajudar.',
                    'Foi o caso da Suzana, doutoranda na Faculdade de Medicina da USP:',
                    { testimonial: TESTIMONIAL_SUZANA },
                    'No nosso site você encontra outros relatos e as publicações que apoiamos em revistas internacionais.',
                    'Se quiser conversar sobre o seu caso, é só responder este e-mail.',
                ],
                cta: { label: 'Ver depoimentos', path: '/testimonials' },
            },
            {
                subject: 'Por que bons manuscritos são rejeitados',
                paragraphs: [
                    'A maioria dos manuscritos não é rejeitada por falta de qualidade científica, e sim porque o trabalho não foi preparado para o escrutínio do avaliador.',
                    'Antes de submeter, vale conferir três pontos:',
                    { list: [
                        'Coerência entre a pergunta, o desenho do estudo e a análise, desde o primeiro parágrafo.',
                        'Conformidade com a diretriz de relato aplicável, como PRISMA, CONSORT ou STROBE.',
                        'Adequação à revista-alvo: escopo, formatação e relevância para os leitores dela.',
                    ] },
                    'Na Revisão Técnica do SIPOP, avaliamos o seu manuscrito nesses e em outros pontos antes que o editor o veja, e entregamos um relatório com recomendações práticas. Não escrevemos o trabalho por você: auditamos e orientamos para que ele chegue mais forte à submissão.',
                ],
                cta: { label: 'Conhecer a Revisão Técnica', path: '/technical-review' },
            },
            {
                subject: 'Devo encerrar seu contato?',
                paragraphs: [
                    'Como não tivemos retorno, este é o nosso último e-mail sobre o seu contato. Não queremos lotar a sua caixa de entrada.',
                    'Se agora não é o momento, tudo bem. Quando a sua pesquisa precisar de apoio em metodologia, estatística ou preparação para publicação, é só responder este e-mail, mesmo daqui a alguns meses, que retomamos de onde paramos.',
                    'Desejamos sucesso no seu trabalho.',
                ],
            },
        ],
    },

    en: {
        greeting:       'Hi {firstName},',
        greetingNoName: 'Hi,',
        signoff:        'Best regards,',
        signature:      'The SIPOP Team',
        footer:         'You are receiving this email because you contacted SIPOP through our website.',
        unsubscribe:    'Unsubscribe from these emails',
        steps: [
            {
                subject: 'Is your research still on the agenda?',
                paragraphs: [
                    'You reached out to SIPOP, and we haven\'t had the chance to talk yet. We know how busy research life gets, so we wanted to follow up.',
                    'If your goal still stands, whether it is completing an academic requirement, strengthening your CV or publishing in a high-impact journal, we can help you map out the best path for your study.',
                    'Just reply to this email and tell us what stage your research is at and what your timeline is. We will suggest the next steps, with no commitment.',
                ],
            },
            {
                subject: 'What other researchers say about SIPOP',
                paragraphs: [
                    'Many researchers come to us with the same feeling: an important study stalled by methodological or statistical doubts, and no one available to help.',
                    'That was the case for Suzana, a PhD candidate at the University of São Paulo Medical School:',
                    { testimonial: TESTIMONIAL_SUZANA },
                    'On our website you will find more stories and the publications we have supported in international journals.',
                    'If you would like to talk about your project, just reply to this email.',
                ],
                cta: { label: 'Read testimonials', path: '/testimonials' },
            },
            {
                subject: 'Why good manuscripts get rejected',
                paragraphs: [
                    'Most manuscripts are not rejected for lack of scientific quality, but because the work was not prepared for reviewer scrutiny.',
                    'Before submitting, it is worth checking three things:',
                    { list: [
                        'Coherence between your question, study design and analysis, from the very first paragraph.',
                        'Compliance with the applicable reporting guideline, such as PRISMA, CONSORT or STROBE.',
                        'Fit with the target journal: scope, formatting and relevance to its readers.',
                    ] },
                    'In SIPOP\'s Technical Review, we assess your manuscript on these and other points before the editor sees it, and deliver a report with practical recommendations. We don\'t write the work for you: we audit and guide it so it reaches submission stronger.',
                ],
                cta: { label: 'Learn about the Technical Review', path: '/technical-review' },
            },
            {
                subject: 'Should we close your request?',
                paragraphs: [
                    'Since we haven\'t heard back, this is our last email about your request. We don\'t want to crowd your inbox.',
                    'If now isn\'t the right time, that\'s fine. Whenever your research needs support with methodology, statistics or publication readiness, just reply to this email, even months from now, and we will pick up where we left off.',
                    'We wish you every success with your work.',
                ],
            },
        ],
    },

    es: {
        greeting:       '¡Hola, {firstName}!',
        greetingNoName: '¡Hola!',
        signoff:        'Un saludo,',
        signature:      'Equipo SIPOP',
        footer:         'Recibes este correo porque te pusiste en contacto con SIPOP a través de nuestro sitio web.',
        unsubscribe:    'No quiero recibir más estos correos',
        steps: [
            {
                subject: '¿Tu investigación sigue en los planes?',
                paragraphs: [
                    'Te pusiste en contacto con SIPOP y todavía no hemos podido conversar. Sabemos lo exigente que es la rutina de investigación, así que quisimos retomar.',
                    'Si tu objetivo sigue en pie, ya sea concluir un trabajo académico, fortalecer tu currículum o publicar en una revista de alto impacto, podemos ayudarte a definir el mejor camino para tu estudio.',
                    'Solo responde este correo contándonos en qué etapa está tu investigación y cuál es tu plazo. A partir de ahí te indicamos los próximos pasos, sin compromiso.',
                ],
            },
            {
                subject: 'Lo que otros investigadores dicen sobre SIPOP',
                paragraphs: [
                    'Muchos investigadores llegan a nosotros con la misma sensación: un estudio importante detenido por dudas de metodología o de estadística, y nadie disponible para ayudar.',
                    'Fue el caso de Suzana, doctoranda en la Facultad de Medicina de la Universidad de São Paulo:',
                    { testimonial: TESTIMONIAL_SUZANA },
                    'En nuestro sitio encontrarás otros testimonios y las publicaciones que hemos apoyado en revistas internacionales.',
                    'Si quieres conversar sobre tu caso, solo responde este correo.',
                ],
                cta: { label: 'Ver testimonios', path: '/testimonials' },
            },
            {
                subject: 'Por qué se rechazan buenos manuscritos',
                paragraphs: [
                    'La mayoría de los manuscritos no se rechaza por falta de calidad científica, sino porque el trabajo no fue preparado para el escrutinio del revisor.',
                    'Antes de enviar, conviene revisar tres puntos:',
                    { list: [
                        'Coherencia entre la pregunta, el diseño del estudio y el análisis, desde el primer párrafo.',
                        'Cumplimiento de la guía de reporte aplicable, como PRISMA, CONSORT o STROBE.',
                        'Adecuación a la revista objetivo: alcance, formato y relevancia para sus lectores.',
                    ] },
                    'En la Revisión Técnica de SIPOP evaluamos tu manuscrito en estos y otros puntos antes de que lo vea el editor, y entregamos un informe con recomendaciones prácticas. No escribimos el trabajo por ti: lo auditamos y orientamos para que llegue más sólido al envío.',
                ],
                cta: { label: 'Conocer la Revisión Técnica', path: '/technical-review' },
            },
            {
                subject: '¿Cerramos tu solicitud?',
                paragraphs: [
                    'Como no hemos tenido respuesta, este es nuestro último correo sobre tu solicitud. No queremos llenar tu bandeja de entrada.',
                    'Si ahora no es el momento, no hay problema. Cuando tu investigación necesite apoyo en metodología, estadística o preparación para publicar, solo responde este correo, incluso dentro de unos meses, y retomamos donde lo dejamos.',
                    'Te deseamos mucho éxito en tu trabajo.',
                ],
            },
        ],
    },
};

const REMARKETING_URL_PREFIX = { pt: '/pt', en: '', es: '/es' };

// ============================================
// Gatilho diário
// ============================================

function setupRemarketingTrigger() {
    ScriptApp.getProjectTriggers()
        .filter(function (t) { return t.getHandlerFunction() === 'sendRemarketing'; })
        .forEach(function (t) { ScriptApp.deleteTrigger(t); });

    ScriptApp.newTrigger('sendRemarketing')
        .timeBased()
        .everyDays(1)
        .atHour(REMARKETING.TRIGGER_HOUR)
        .create();

    getUnsubscribeSecret_(); // garante o segredo do link de descadastro
    Logger.log('Gatilho diário criado: sendRemarketing às ' + REMARKETING.TRIGGER_HOUR + 'h.');
}

// ============================================
// Envio
// ============================================

function sendRemarketing() {
    runRemarketing_(false);
}

function previewRemarketing() {
    runRemarketing_(true);
}

function runRemarketing_(dryRun) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
        Logger.log('Outra execução do remarketing está em andamento. Saindo.');
        return;
    }

    try {
        const apiKey = PropertiesService.getScriptProperties().getProperty('RESEND_API_KEY');
        if (!apiKey && !dryRun) {
            throw new Error('RESEND_API_KEY não configurada nas Propriedades do script.');
        }

        const found    = findRemarketingSheet_();
        const sheet    = found.sheet;
        const cols     = found.cols;
        const firstRow = found.headerRow + 1;

        const lastRow = sheet.getLastRow();
        if (lastRow < firstRow) return;

        const rows  = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, sheet.getLastColumn()).getValues();
        const today = new Date();
        let sent = 0;

        for (let i = 0; i < rows.length; i++) {
            if (sent >= REMARKETING.MAX_PER_RUN) {
                Logger.log('Limite de ' + REMARKETING.MAX_PER_RUN + ' envios por execução atingido; o restante sai amanhã.');
                break;
            }

            const lead = readLead_(rows[i], firstRow + i, cols);
            const nextStep = nextRemarketingStep_(lead, today);
            if (!nextStep) continue;

            if (dryRun) {
                Logger.log('[prévia] linha ' + lead.row + ' — ' + lead.email + ' — e-mail ' + nextStep + ' (' + pickRemarketingLang_(lead.language) + ')');
                sent++;
                continue;
            }

            const ok = sendRemarketingEmail_(apiKey, lead, nextStep);
            if (ok) {
                sheet.getRange(lead.row, cols.step).setNumberFormat('0').setValue(nextStep);
                sheet.getRange(lead.row, cols.lastSent).setNumberFormat('yyyy-mm-dd').setValue(today);
                sent++;
            }
        }

        Logger.log((dryRun ? 'Prévia: ' : 'Enviados: ') + sent + ' e-mail(s).');
    } finally {
        lock.releaseLock();
    }
}

function readLead_(values, rowNumber, cols) {
    const at = function (col) { return values[col - 1]; };
    return {
        row:      rowNumber,
        date:     at(cols.date),
        name:     at(cols.name),
        email:    String(at(cols.email) || '').trim(),
        language: at(cols.language),
        status:   at(cols.status),
        step:     at(cols.step),
        lastSent: at(cols.lastSent),
    };
}

// Devolve o número do próximo e-mail (1-4) se ele deve sair hoje, ou 0.
function nextRemarketingStep_(lead, today) {
    if (normalizeText_(lead.status) !== REMARKETING.STATUS_TRIGGER) return 0;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return 0;
    if (normalizeText_(lead.step) === normalizeText_(REMARKETING.UNSUBSCRIBED)) return 0;

    const done = Number(lead.step) || 0;
    if (done >= REMARKETING.TOTAL_STEPS) return 0;

    const reference = done === 0 ? lead.date : lead.lastSent;
    if (Object.prototype.toString.call(reference) !== '[object Date]' || isNaN(reference.getTime())) return 0;

    return daysBetween_(reference, today) >= REMARKETING.INTERVAL_DAYS ? done + 1 : 0;
}

// Diferença em dias de calendário (ignora a hora), pra que um lead que
// entrou às 18h receba o e-mail no disparo das 9h do sétimo dia.
function daysBetween_(from, to) {
    const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / 86400000);
}

function normalizeText_(value) {
    return String(value || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .trim().toLowerCase();
}

// Acha a aba com as colunas "Email" e "Status" nas 5 primeiras linhas e
// devolve { sheet, headerRow, cols: { date, name, email, language, status, step, lastSent } }
// (números de coluna, a partir de 1). Cria as colunas de controle no fim se faltarem.
function findRemarketingSheet_() {
    const sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
    for (let i = 0; i < sheets.length; i++) {
        const sheet   = sheets[i];
        const lastCol = sheet.getLastColumn();
        const rows    = Math.min(5, sheet.getLastRow());
        if (!lastCol || !rows) continue;

        const top = sheet.getRange(1, 1, rows, lastCol).getDisplayValues();
        for (let r = 0; r < top.length; r++) {
            const cols = matchHeaders_(top[r]);
            if (!cols.email || !cols.status) continue;

            const missing = Object.keys(REMARKETING.HEADERS).filter(function (k) { return !cols[k]; });
            if (missing.length) throw new Error('Colunas não encontradas no cabeçalho: ' + missing.join(', '));

            const headerRow = r + 1;
            cols.step     = ensureColumn_(sheet, headerRow, REMARKETING.STEP_HEADER, cols.status);
            cols.lastSent = ensureColumn_(sheet, headerRow, REMARKETING.LAST_SENT_HEADER, cols.status);
            return { sheet: sheet, headerRow: headerRow, cols: cols };
        }
    }
    throw new Error('Nenhuma aba tem as colunas "Email" e "Status" nas 5 primeiras linhas.');
}

function matchHeaders_(headerValues) {
    const headers = headerValues.map(normalizeText_);
    const cols = {};
    Object.keys(REMARKETING.HEADERS).forEach(function (key) {
        const names = REMARKETING.HEADERS[key].map(normalizeText_);
        const idx = headers.findIndex(function (h) { return names.indexOf(h) !== -1; });
        if (idx !== -1) cols[key] = idx + 1;
    });
    return cols;
}

// Devolve o número da coluna com esse cabeçalho, criando-a no fim se não existir.
function ensureColumn_(sheet, headerRow, header, styleFromCol) {
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(headerRow, 1, 1, lastCol).getDisplayValues()[0].map(normalizeText_);
    const idx = headers.indexOf(normalizeText_(header));
    if (idx !== -1) return idx + 1;

    const col = lastCol + 1;
    if (col > sheet.getMaxColumns()) sheet.insertColumnAfter(sheet.getMaxColumns());
    sheet.getRange(headerRow, styleFromCol).copyFormatToRange(sheet, col, col, headerRow, headerRow);
    sheet.getRange(headerRow, col).setValue(header);
    sheet.setColumnWidth(col, 190);
    return col;
}

function sendRemarketingEmail_(apiKey, lead, step) {
    const email = buildRemarketingEmail_(lead, step);

    const response = UrlFetchApp.fetch('https://api.resend.com/emails', {
        method:      'post',
        contentType: 'application/json',
        headers: {
            'Authorization':   'Bearer ' + apiKey,
            // Evita e-mail duplicado se a mesma etapa for tentada duas vezes
            'Idempotency-Key': 'remarketing/' + lead.email.toLowerCase() + '/' + step,
        },
        payload: JSON.stringify({
            from:     REMARKETING.FROM,
            to:       [lead.email],
            reply_to: REMARKETING.REPLY_TO,
            subject:  email.subject,
            html:     email.html,
            text:     email.text,
            headers:  { 'List-Unsubscribe': '<' + email.unsubscribeUrl + '>' },
            tags:     [{ name: 'type', value: 'remarketing_' + step }],
        }),
        muteHttpExceptions: true,
    });

    const code = response.getResponseCode();
    if (code >= 200 && code < 300) {
        Logger.log('Enviado e-mail ' + step + ' para ' + lead.email + ' (linha ' + lead.row + ')');
        return true;
    }
    Logger.log('Falha ao enviar e-mail ' + step + ' para ' + lead.email + ': ' + code + ' ' + response.getContentText().slice(0, 300));
    return false;
}

// ============================================
// Montagem do e-mail
// ============================================

function pickRemarketingLang_(language) {
    const value = normalizeText_(language);
    if (value.indexOf('en') === 0 || value.indexOf('ing') === 0) return 'en';
    if (value.indexOf('es') === 0 || value.indexOf('sp') === 0) return 'es';
    return 'pt';
}

function firstNameOf_(name) {
    const first = String(name || '').trim().split(/\s+/)[0] || '';
    return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : '';
}

function escapeHtml_(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildRemarketingEmail_(lead, step) {
    const lang      = pickRemarketingLang_(lead.language);
    const copy      = REMARKETING_COPY[lang];
    const content   = copy.steps[step - 1];
    const firstName = firstNameOf_(lead.name);
    const greeting  = firstName ? copy.greeting.replace('{firstName}', firstName) : copy.greetingNoName;
    const unsubscribeUrl = buildUnsubscribeUrl_(lead.email);
    const color     = REMARKETING.BRAND_COLOR;
    const ctaUrl    = content.cta ? REMARKETING.SITE_URL + REMARKETING_URL_PREFIX[lang] + content.cta.path : '';

    // Texto puro
    const textParts = [greeting, ''];
    content.paragraphs.forEach(function (p) {
        if (typeof p === 'string') textParts.push(p, '');
        else if (p.list) { p.list.forEach(function (item) { textParts.push('- ' + item); }); textParts.push(''); }
        else if (p.testimonial) {
            const t = p.testimonial;
            textParts.push('"' + t[lang].quote + '"', '— ' + t.name + ', ' + t[lang].role + ', ' + t.org, '');
        }
    });
    if (content.cta) textParts.push(content.cta.label + ': ' + ctaUrl, '');
    textParts.push(copy.signoff, copy.signature, REMARKETING.SITE_URL, '', '---', copy.footer, copy.unsubscribe + ': ' + unsubscribeUrl);

    // HTML
    const bodyHtml = content.paragraphs.map(function (p) {
        if (typeof p === 'string') return '<p style="margin:0 0 16px;">' + escapeHtml_(p) + '</p>';
        if (p.testimonial) return testimonialHtml_(p.testimonial, lang);
        return '<ul style="margin:0 0 16px;padding-left:20px;">' +
            p.list.map(function (item) { return '<li style="margin:0 0 8px;">' + escapeHtml_(item) + '</li>'; }).join('') +
            '</ul>';
    }).join('\n');

    const ctaHtml = content.cta
        ? '<p style="margin:8px 0 24px;"><a href="' + ctaUrl + '" style="display:inline-block;background:' + color + ';color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">' + escapeHtml_(content.cta.label) + '</a></p>'
        : '';

    const html =
        '<!doctype html><html lang="' + (lang === 'pt' ? 'pt-BR' : lang) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
        '<body style="margin:0;padding:0;background:#f4f6f6;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f6;padding:24px 12px;"><tr><td align="center">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;border-top:4px solid ' + color + ';">' +
        '<tr><td style="padding:32px 28px;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1a202c;">' +
        '<p style="margin:0 0 16px;">' + escapeHtml_(greeting) + '</p>' +
        bodyHtml + ctaHtml +
        '<p style="margin:24px 0 0;">' + escapeHtml_(copy.signoff) + '<br><strong>' + escapeHtml_(copy.signature) + '</strong></p>' +
        '<p style="margin:24px 0 0;font-size:13px;"><a href="' + REMARKETING.SITE_URL + '" style="color:' + color + ';text-decoration:none;">sipopscience.com</a></p>' +
        '</td></tr></table>' +
        '<p style="max-width:560px;margin:16px auto 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#718096;text-align:center;">' +
        escapeHtml_(copy.footer) + '<br><a href="' + unsubscribeUrl + '" style="color:#718096;">' + escapeHtml_(copy.unsubscribe) + '</a></p>' +
        '</td></tr></table></body></html>';

    return { subject: content.subject, html: html, text: textParts.join('\n'), unsubscribeUrl: unsubscribeUrl };
}

// Card de depoimento no mesmo visual do site (.test-card): borda lateral
// verde-água, citação em itálico entre aspas, foto redonda + nome, cargo e
// instituição. Feito com tabelas para funcionar também no Outlook.
function testimonialHtml_(t, lang) {
    const c = t[lang];
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border-collapse:separate;">' +
        '<tr><td style="background:#ffffff;border:1px solid #CBD5E0;border-left:4px solid #81C7B7;border-radius:0 12px 12px 0;padding:24px;">' +
        '<p style="margin:0 0 20px;font-size:15px;font-style:italic;line-height:1.7;color:#4A5568;">&ldquo;' + escapeHtml_(c.quote) + '&rdquo;</p>' +
        '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
        '<td style="vertical-align:middle;padding-right:14px;"><img src="' + t.avatar + '" width="52" height="52" alt="' + escapeHtml_(t.name) + '" style="display:block;width:52px;height:52px;border:0;"></td>' +
        '<td style="vertical-align:middle;font-size:13px;line-height:1.5;color:#718096;">' +
        '<strong style="display:block;color:#2C7A7B;font-size:15px;margin-bottom:2px;">' + escapeHtml_(t.name) + '</strong>' +
        escapeHtml_(c.role) + '<br>' + escapeHtml_(t.org) +
        '</td></tr></table>' +
        '</td></tr></table>';
}

// ============================================
// Descadastro
// O link leva o e-mail + uma assinatura (HMAC) para ninguém conseguir
// descadastrar outra pessoa trocando o e-mail na URL.
// ============================================

function getUnsubscribeSecret_() {
    const props = PropertiesService.getScriptProperties();
    let secret = props.getProperty('UNSUBSCRIBE_SECRET');
    if (!secret) {
        secret = Utilities.getUuid() + Utilities.getUuid();
        props.setProperty('UNSUBSCRIBE_SECRET', secret);
    }
    return secret;
}

function unsubscribeToken_(email) {
    const bytes = Utilities.computeHmacSha256Signature(String(email).trim().toLowerCase(), getUnsubscribeSecret_());
    return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').slice(0, 32);
}

function buildUnsubscribeUrl_(email) {
    return REMARKETING.WEB_APP_URL +
        '?action=unsubscribe&email=' + encodeURIComponent(email) +
        '&token=' + unsubscribeToken_(email);
}

function doGet(e) {
    const params = (e && e.parameter) || {};
    if (params.action !== 'unsubscribe') {
        return HtmlService.createHtmlOutput('SIPOP');
    }

    const email = String(params.email || '').trim().toLowerCase();
    const valid = email && params.token === unsubscribeToken_(email);

    if (valid) {
        const found    = findRemarketingSheet_();
        const firstRow = found.headerRow + 1;
        const lastRow  = found.sheet.getLastRow();
        if (lastRow >= firstRow) {
            const emails = found.sheet.getRange(firstRow, found.cols.email, lastRow - firstRow + 1, 1).getValues();
            emails.forEach(function (r, i) {
                if (String(r[0]).trim().toLowerCase() === email) {
                    found.sheet.getRange(firstRow + i, found.cols.step).setValue(REMARKETING.UNSUBSCRIBED);
                }
            });
        }
    }

    const message = valid
        ? 'Pronto! Você não vai mais receber estes e-mails do SIPOP.<br><span style="color:#718096;">Done. You will no longer receive these emails from SIPOP. / Listo. Ya no recibirás estos correos de SIPOP.</span>'
        : 'Link inválido. Se quiser deixar de receber nossos e-mails, responda qualquer mensagem com "SAIR".<br><span style="color:#718096;">Invalid link. To stop receiving our emails, reply to any message with "UNSUBSCRIBE".</span>';

    return HtmlService.createHtmlOutput(
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;line-height:1.6;color:#1a202c;">' +
        '<h2 style="color:' + REMARKETING.BRAND_COLOR + ';">SIPOP</h2><p>' + message + '</p></div>'
    ).setTitle('SIPOP');
}

// ============================================
// Teste: envia os 4 e-mails (PT) para REMARKETING_TEST_EMAIL
// ============================================

function sendRemarketingTest() {
    const apiKey = PropertiesService.getScriptProperties().getProperty('RESEND_API_KEY');
    if (!apiKey) throw new Error('RESEND_API_KEY não configurada nas Propriedades do script.');

    for (let step = 1; step <= REMARKETING.TOTAL_STEPS; step++) {
        const email = buildRemarketingEmail_({ name: 'Teste', email: REMARKETING_TEST_EMAIL, language: 'Portuguese' }, step);
        const response = UrlFetchApp.fetch('https://api.resend.com/emails', {
            method:      'post',
            contentType: 'application/json',
            headers:     { 'Authorization': 'Bearer ' + apiKey },
            payload: JSON.stringify({
                from:     REMARKETING.FROM,
                to:       [REMARKETING_TEST_EMAIL],
                reply_to: REMARKETING.REPLY_TO,
                subject:  '[TESTE ' + step + '/4] ' + email.subject,
                html:     email.html,
                text:     email.text,
            }),
            muteHttpExceptions: true,
        });
        Logger.log('Teste ' + step + ': ' + response.getResponseCode() + ' ' + response.getContentText());
    }
}
