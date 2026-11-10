// ============================================
// SIPOP — Agendamento de calls (Google Apps Script)
//
// Mais um arquivo do MESMO projeto do apps-script.gs (crie "agenda.gs" no
// editor do Apps Script e cole este código). Usa helpers dos outros arquivos:
//   remarketing.gs            — findRemarketingSheet_, ensureColumn_, normalizeText_,
//                               firstNameOf_, pickRemarketingLang_, escapeHtml_, REMARKETING
//   whatsapp-first-contact.gs — getEvolutionConfig_, sendEvolutionText_, findWhatsAppPhoneColumn_
//   apps-script.gs            — EMAIL_RECIPIENTS, e o doPost que encaminha as ações "agenda.*"
//
// O QUE FAZ
//   1. O pesquisador marca os horários livres no painel (sipopscience.com/agenda-admin).
//   2. O lead abre o link de agendamento (sipopscience.com/agendar/?t=TOKEN) que vai
//      no e-mail e no WhatsApp de primeiro contato e escolhe um horário.
//   3. O agendamento fica registrado na aba "Agenda" (e na coluna "Call agendada"
//      da aba de contatos).
//   4. Um evento com link do Google Meet é criado na agenda da conta do script.
//   5. Na hora, o lead recebe a confirmação por e-mail e WhatsApp, com o link.
//   6. 24h antes: lembrete no WhatsApp com link para CONFIRMAR ou REAGENDAR.
//   7. 2h antes: lembrete curto no WhatsApp com instruções e o link da reunião.
//
// ABAS CRIADAS NA PLANILHA
//   "Agenda"          — uma linha por agendamento (não edite as colunas ISO/Token)
//   "Disponibilidade" — uma linha por dia: data (aaaa-mm-dd) e horários de início
//                       de cada bloco de 30 min livres ("09:00, 09:30, 14:00").
//                       O painel escreve aqui; também dá para editar à mão.
//
// CONFIGURAÇÃO (uma vez)
// 1. Editor do Apps Script > Serviços (+) > adicione "Google Calendar API"
//    (identificador "Calendar"). É ele que gera o link do Meet.
// 2. Configurações do projeto > Propriedades do script:
//      AGENDA_ADMIN_KEY     — senha do painel /agenda-admin (invente uma longa)
//      AGENDA_FALLBACK_LINK — (opcional) link fixo de reunião usado se o Meet falhar
//    (RESEND_API_KEY e EVOLUTION_* já existem por causa dos outros arquivos.)
// 3. Rode setupAgendaTrigger() uma vez e autorize (inclui acesso ao Calendar).
// 4. Implantar > Gerenciar implantações > editar > "Nova versão" > Implantar.
// 5. Abra sipopscience.com/agenda-admin, entre com a AGENDA_ADMIN_KEY e marque
//    os horários disponíveis.
//
// FUNÇÕES ÚTEIS (rode pelo editor)
//   setupAgendaTrigger()   — liga os lembretes (a cada 5 min)
//   removeAgendaTrigger()  — desliga
//   runAgendaReminders()   — o que o gatilho chama
//   previewAgendaSlots()   — mostra no log os horários que o lead veria agora
//   testAgendaMeet()       — cria e apaga um evento de teste, para validar o Meet
// ============================================

const AGENDA = {
    SITE_URL:      'https://sipopscience.com',
    BOOK_PATH:     '/agendar/',
    CONFIRM_PATH:  '/confirmar/',

    SHEET:         'Agenda',
    AVAIL_SHEET:   'Disponibilidade',
    TOKEN_HEADER:  'Agendamento (token)',  // coluna criada na aba de contatos
    CALL_HEADER:   'Call agendada',        // idem

    BLOCK_MIN:        30,                  // tamanho do bloco de disponibilidade
    UTC_OFFSET_HOURS: -3,                  // Brasília
    TZ:               'America/Sao_Paulo',

    // Padrões — o painel grava as escolhas na propriedade AGENDA_CONFIG.
    DEFAULT_CONFIG: { window: '14', customEnd: '', duration: 30, minNoticeHours: 3 },
    WINDOW_OPTIONS: ['7', '14', '30', '60', 'custom'],
    DURATIONS:      [30, 60, 90],

    CALENDAR_ID:          'primary',
    SEND_CALENDAR_INVITE: true,            // o lead também recebe o convite do Google Agenda

    TRIGGER_MINUTES:      5,
    REMINDER_LONG_HOURS:  24,
    REMINDER_SHORT_HOURS: 2,
    RETRY_CONFIRMATION_HOURS: 2,           // até quando o gatilho insiste na confirmação
    TYPING_MS:            800,

    BOOKED:    'Agendado',
    CONFIRMED: 'Confirmado',
    CANCELED:  'Cancelado',

    WAIVED:      'Dispensado',
    NO_WHATSAPP: 'Sem WhatsApp',
    NO_PHONE:    'Sem telefone',
    NO_EMAIL:    'Sem e-mail',
};

// Colunas da aba "Agenda" (cabeçalho e chave usada no código, na mesma ordem).
const AGENDA_COLUMNS = [
    ['Token',                    'token'],
    ['Agendado em (ISO)',        'bookedAt'],
    ['Nome',                     'name'],
    ['Email',                    'email'],
    ['Telefone',                 'phone'],
    ['Idioma',                   'lang'],
    ['Início (Brasília)',        'startText'],
    ['Início (ISO)',             'start'],
    ['Duração (min)',            'duration'],
    ['Link da call',             'link'],
    ['Evento (ID)',              'eventId'],
    ['Status',                   'status'],
    ['Confirmação (e-mail)',     'confirmEmail'],
    ['Confirmação (WhatsApp)',   'confirmWhatsApp'],
    ['Lembrete 24h',             'reminder24'],
    ['Lembrete 2h',              'reminder2'],
    ['Confirmado em',            'confirmedAt'],
    ['Fuso do lead',             'tz'],
    ['Linha do lead',            'leadRow'],
    ['Reagendamentos',           'reschedules'],
];

// ============================================
// TEXTOS — edite aqui. Marcadores: {firstName} {when} {time} {link} {url}
// ============================================

const AGENDA_COPY = {
    pt: {
        weekdays: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
        months:   ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
        brasilia: 'horário de Brasília',
        hello:       'Olá, {firstName}!',
        helloNoName: 'Olá!',
        confirmation: [
            '{hello} Sua call com o SIPOP está agendada.',
            'Data: {when}',
            'Link da reunião: {link}',
            'Se precisar mudar o horário, é só acessar: {url}',
        ],
        reminder24: [
            '{hello} Passando para lembrar da sua call com o SIPOP amanhã: {when}.',
            'Você confirma sua presença? Toque no link para confirmar ou reagendar:',
            '{url}',
        ],
        reminder2: [
            '{hello} Nossa call começa às {time}, daqui a pouco.',
            'Link da reunião: {link}',
            'Entre uns 2 minutos antes, de um lugar silencioso e com boa internet. Se tiver, deixe à mão o resumo ou a versão atual do seu estudo.',
        ],
        email: {
            subject:   'Sua call com o SIPOP está agendada',
            intro:     'Sua call com o SIPOP está agendada. Guarde este e-mail: o link da reunião está logo abaixo.',
            whenLabel: 'Data e horário',
            join:      'Entrar na reunião',
            linkSoon:  'Vamos enviar o link da reunião por aqui antes da call.',
            reschedule: 'Precisa mudar o horário? Reagende aqui',
            tips:      'Vamos lembrar você pelo WhatsApp 24 horas e 2 horas antes.',
            signoff:   'Um abraço,',
            signature: 'Equipe SIPOP',
        },
    },
    en: {
        weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        months:   ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        brasilia: 'Brasília time',
        hello:       'Hi {firstName}!',
        helloNoName: 'Hi!',
        confirmation: [
            '{hello} Your call with SIPOP is booked.',
            'Date: {when}',
            'Meeting link: {link}',
            'If you need to change the time, just open: {url}',
        ],
        reminder24: [
            '{hello} A quick reminder of your call with SIPOP tomorrow: {when}.',
            'Can you make it? Tap the link to confirm or reschedule:',
            '{url}',
        ],
        reminder2: [
            '{hello} Our call starts at {time}, in a little while.',
            'Meeting link: {link}',
            'Please join about 2 minutes early, from a quiet place with a good connection. If you have it, keep the abstract or current draft of your study at hand.',
        ],
        email: {
            subject:   'Your call with SIPOP is booked',
            intro:     'Your call with SIPOP is booked. Keep this email: the meeting link is right below.',
            whenLabel: 'Date and time',
            join:      'Join the meeting',
            linkSoon:  'We will send you the meeting link here before the call.',
            reschedule: 'Need to change the time? Reschedule here',
            tips:      'We will remind you on WhatsApp 24 hours and 2 hours before.',
            signoff:   'Best regards,',
            signature: 'The SIPOP Team',
        },
    },
    es: {
        weekdays: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
        months:   ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
        brasilia: 'hora de Brasilia',
        hello:       '¡Hola, {firstName}!',
        helloNoName: '¡Hola!',
        confirmation: [
            '{hello} Tu llamada con SIPOP está agendada.',
            'Fecha: {when}',
            'Enlace de la reunión: {link}',
            'Si necesitas cambiar el horario, entra aquí: {url}',
        ],
        reminder24: [
            '{hello} Te recordamos tu llamada con SIPOP mañana: {when}.',
            '¿Confirmas tu asistencia? Toca el enlace para confirmar o reagendar:',
            '{url}',
        ],
        reminder2: [
            '{hello} Nuestra llamada empieza a las {time}, dentro de poco.',
            'Enlace de la reunión: {link}',
            'Entra unos 2 minutos antes, desde un lugar silencioso y con buena conexión. Si lo tienes, ten a mano el resumen o la versión actual de tu estudio.',
        ],
        email: {
            subject:   'Tu llamada con SIPOP está agendada',
            intro:     'Tu llamada con SIPOP está agendada. Guarda este correo: el enlace de la reunión está justo abajo.',
            whenLabel: 'Fecha y hora',
            join:      'Entrar a la reunión',
            linkSoon:  'Te enviaremos el enlace de la reunión por aquí antes de la llamada.',
            reschedule: '¿Necesitas cambiar el horario? Reagenda aquí',
            tips:      'Te lo recordaremos por WhatsApp 24 horas y 2 horas antes.',
            signoff:   'Un saludo,',
            signature: 'Equipo SIPOP',
        },
    },
};

// ============================================
// Entrada: o doPost do apps-script.gs chama esta função para toda ação "agenda.*"
// ============================================

function agendaHandleRequest_(data) {
    let result;
    try {
        switch (String(data.action)) {
            case 'agenda.slots':        result = agendaActionSlots_(data); break;
            case 'agenda.book':         result = agendaActionBook_(data); break;
            case 'agenda.notify':       result = agendaActionNotify_(data); break;
            case 'agenda.get':          result = agendaActionGet_(data); break;
            case 'agenda.confirm':      result = agendaActionConfirm_(data); break;
            case 'agenda.admin.load':   result = agendaAdminLoad_(data); break;
            case 'agenda.admin.save':   result = agendaAdminSave_(data); break;
            case 'agenda.admin.cancel': result = agendaAdminCancel_(data); break;
            default: result = agendaError_('unknown_action');
        }
    } catch (error) {
        Logger.log('agenda: erro em ' + data.action + ': ' + (error && error.stack || error));
        result = agendaError_('server_error', String(error));
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function agendaError_(code, message) {
    return { status: 'error', code: code, message: message || code };
}

// ============================================
// Datas (funções puras)
// ============================================

// "2026-11-12" + "14:30" (relógio de Brasília) -> instante
function agendaBrInstant_(dateStr, timeStr) {
    const d = dateStr.split('-').map(Number);
    const t = timeStr.split(':').map(Number);
    return new Date(Date.UTC(d[0], d[1] - 1, d[2], t[0] - AGENDA.UTC_OFFSET_HOURS, t[1]));
}

// Instante -> data de Brasília "aaaa-mm-dd"
function agendaBrDate_(date) {
    return new Date(date.getTime() + AGENDA.UTC_OFFSET_HOURS * 3600000).toISOString().slice(0, 10);
}

function agendaAddDays_(dateStr, days) {
    const d = dateStr.split('-').map(Number);
    return new Date(Date.UTC(d[0], d[1] - 1, d[2] + days)).toISOString().slice(0, 10);
}

function agendaMinutes_(timeStr) {
    const t = timeStr.split(':').map(Number);
    return t[0] * 60 + t[1];
}

function agendaTimeOf_(minutes) {
    return ('0' + Math.floor(minutes / 60)).slice(-2) + ':' + ('0' + (minutes % 60)).slice(-2);
}

// Última data (inclusive) que aparece para o lead.
function agendaWindowEnd_(config, now) {
    const today = agendaBrDate_(now);
    if (config.window === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(config.customEnd || '')) return config.customEnd;
    const days = parseInt(config.window, 10);
    return agendaAddDays_(today, days > 0 ? days : parseInt(AGENDA.DEFAULT_CONFIG.window, 10));
}

function agendaIsActive_(booking, now) {
    if (booking.status !== AGENDA.BOOKED && booking.status !== AGENDA.CONFIRMED) return false;
    const start = new Date(booking.start).getTime();
    return !isNaN(start) && start + Number(booking.duration || 0) * 60000 > now.getTime();
}

// Horários (ISO) que o lead pode escolher agora.
//   availability: { 'aaaa-mm-dd': ['09:00', '09:30', ...] } — blocos de 30 min livres
//   bookings:     linhas da aba Agenda
//   ownToken:     agendamento que está sendo remarcado (não bloqueia a si mesmo)
function agendaComputeSlots_(availability, bookings, config, now, ownToken) {
    const today    = agendaBrDate_(now);
    const lastDate = agendaWindowEnd_(config, now);
    const earliest = now.getTime() + Number(config.minNoticeHours || 0) * 3600000;
    const duration = Number(config.duration) || AGENDA.DEFAULT_CONFIG.duration;
    const blocks   = Math.ceil(duration / AGENDA.BLOCK_MIN);

    const busy = bookings
        .filter(function (b) { return agendaIsActive_(b, now) && !(ownToken && b.token === ownToken); })
        .map(function (b) {
            const start = new Date(b.start).getTime();
            return [start, start + Number(b.duration) * 60000];
        });

    const slots = [];
    Object.keys(availability).sort().forEach(function (date) {
        if (date < today || date > lastDate) return;
        const free = {};
        availability[date].forEach(function (t) { free[t] = true; });

        availability[date].slice().sort().forEach(function (time) {
            const startMin = agendaMinutes_(time);
            for (let k = 0; k < blocks; k++) {
                const m = startMin + k * AGENDA.BLOCK_MIN;
                if (m >= 1440 || !free[agendaTimeOf_(m)]) return;   // precisa de blocos seguidos
            }
            const start = agendaBrInstant_(date, time).getTime();
            const end   = start + duration * 60000;
            if (start < earliest) return;
            if (busy.some(function (b) { return start < b[1] && end > b[0]; })) return;
            slots.push(new Date(start).toISOString());
        });
    });
    return slots;
}

// Data por extenso no idioma e fuso do lead.
// Devolve { when: 'quinta-feira, 12 de novembro às 14:00 (horário de Brasília)', time: '14:00' }
function agendaFormatWhen_(date, lang, tz) {
    const copy = AGENDA_COPY[lang] || AGENDA_COPY.pt;
    const zone = /^[A-Za-z_]+\/[A-Za-z0-9_+\-\/]+$/.test(String(tz || '')) ? String(tz) : AGENDA.TZ;
    const p    = Utilities.formatDate(date, zone, 'yyyy|MM|dd|HH|mm|Z').split('|');
    const y = Number(p[0]), mo = Number(p[1]), d = Number(p[2]), h = Number(p[3]), mi = p[4], off = p[5];

    const weekday = copy.weekdays[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
    const month   = copy.months[mo - 1];
    const zoneLabel = (off === '-0300' && zone === AGENDA.TZ)
        ? copy.brasilia
        : 'GMT' + off.slice(0, 3) + ':' + off.slice(3);

    let time, when;
    if (lang === 'en') {
        time = (h % 12 === 0 ? 12 : h % 12) + ':' + mi + (h < 12 ? ' AM' : ' PM');
        when = weekday + ', ' + month + ' ' + d + ' at ' + time;
    } else {
        time = ('0' + h).slice(-2) + ':' + mi;
        when = weekday + ', ' + d + ' de ' + month + (lang === 'es' ? ' a las ' : ' às ') + time;
    }
    return { when: when + ' (' + zoneLabel + ')', time: time + ' (' + zoneLabel + ')' };
}

// ============================================
// Planilha
// ============================================

function agendaCell_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]') return isNaN(value.getTime()) ? '' : value.toISOString();
    return String(value === null || value === undefined ? '' : value).trim();
}

function agendaStamp_(date) {
    return Utilities.formatDate(date || new Date(), AGENDA.TZ, 'dd/MM/yyyy HH:mm');
}

// Abre (ou cria) uma aba com as colunas todas em texto puro — sem isso o
// Sheets converteria "09:00" e "2026-11-12" em hora/data por conta própria.
function agendaSheet_(name, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).setNumberFormat('@');
        sheet.getRange(1, 1, 1, headers.length).setValues([headers])
            .setFontWeight('bold').setBackground('#2C7A7B').setFontColor('#FFFFFF');
        sheet.setFrozenRows(1);
    }
    return sheet;
}

function agendaBookingsSheet_() {
    return agendaSheet_(AGENDA.SHEET, AGENDA_COLUMNS.map(function (c) { return c[0]; }));
}

function agendaReadBookings_(sheet) {
    const last = sheet.getLastRow();
    if (last < 2) return [];
    return sheet.getRange(2, 1, last - 1, AGENDA_COLUMNS.length).getValues().map(function (values, i) {
        const booking = { row: i + 2 };
        AGENDA_COLUMNS.forEach(function (c, j) { booking[c[1]] = agendaCell_(values[j]); });
        return booking;
    });
}

function agendaWriteBooking_(sheet, booking) {
    const values = AGENDA_COLUMNS.map(function (c) {
        const v = booking[c[1]];
        return v === null || v === undefined ? '' : String(v);
    });
    if (!booking.row) booking.row = Math.max(sheet.getLastRow(), 1) + 1;
    sheet.getRange(booking.row, 1, 1, values.length).setNumberFormat('@').setValues([values]);
}

function agendaSetField_(sheet, booking, key, value) {
    booking[key] = value;
    const col = AGENDA_COLUMNS.findIndex(function (c) { return c[1] === key; }) + 1;
    sheet.getRange(booking.row, col).setNumberFormat('@').setValue(String(value));
}

// { 'aaaa-mm-dd': ['09:00', ...] } a partir da aba "Disponibilidade".
function agendaReadAvailability_() {
    const sheet = agendaSheet_(AGENDA.AVAIL_SHEET, ['Data', 'Horários (início de cada bloco de 30 min)']);
    const last  = sheet.getLastRow();
    const availability = {};
    if (last < 2) return availability;

    sheet.getRange(2, 1, last - 1, 2).getValues().forEach(function (row) {
        const date = agendaParseDate_(row[0]);
        if (!date) return;
        const times = agendaParseTimes_(row[1]);
        if (times.length) availability[date] = (availability[date] || []).concat(times);
    });
    return availability;
}

function agendaParseDate_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]') {
        return isNaN(value.getTime()) ? '' : Utilities.formatDate(value, AGENDA.TZ, 'yyyy-MM-dd');
    }
    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);   // 12/11/2026 digitado à mão
    return br ? br[3] + '-' + ('0' + br[2]).slice(-2) + '-' + ('0' + br[1]).slice(-2) : '';
}

function agendaParseTimes_(value) {
    if (Object.prototype.toString.call(value) === '[object Date]') {
        return isNaN(value.getTime()) ? [] : [Utilities.formatDate(value, AGENDA.TZ, 'HH:mm')];
    }
    const seen = {};
    return String(value || '').split(/[,;\s]+/).map(function (t) {
        const m = t.match(/^(\d{1,2})[:h](\d{2})$/);
        if (!m || Number(m[1]) > 23 || Number(m[2]) % AGENDA.BLOCK_MIN !== 0 || Number(m[2]) > 59) return '';
        return ('0' + m[1]).slice(-2) + ':' + m[2];
    }).filter(function (t) {
        if (!t || seen[t]) return false;
        seen[t] = true;
        return true;
    }).sort();
}

function agendaWriteAvailability_(availability) {
    const sheet = agendaSheet_(AGENDA.AVAIL_SHEET, ['Data', 'Horários (início de cada bloco de 30 min)']);
    const rows = Object.keys(availability).sort()
        .filter(function (date) { return availability[date].length; })
        .map(function (date) { return [date, availability[date].join(', ')]; });

    const last = sheet.getLastRow();
    if (last > 1) sheet.getRange(2, 1, last - 1, 2).clearContent();
    if (rows.length) sheet.getRange(2, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
}

function agendaConfig_() {
    const config = {};
    Object.keys(AGENDA.DEFAULT_CONFIG).forEach(function (k) { config[k] = AGENDA.DEFAULT_CONFIG[k]; });
    try {
        const saved = JSON.parse(PropertiesService.getScriptProperties().getProperty('AGENDA_CONFIG') || '{}');
        Object.keys(config).forEach(function (k) { if (saved[k] !== undefined) config[k] = saved[k]; });
    } catch (error) { /* propriedade corrompida: fica nos padrões */ }
    return config;
}

// ============================================
// Lead (aba de contatos)
// ============================================

function agendaNewToken_() {
    // Começa com letra para o Sheets nunca tratar como número.
    return 's' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function agendaCleanToken_(value) {
    const token = String(value || '').trim();
    return /^s[0-9a-f]{16}$/.test(token) ? token : '';
}

function agendaBookUrl_(token, lang) {
    return AGENDA.SITE_URL + AGENDA.BOOK_PATH + (token ? '?t=' + token : (lang && lang !== 'pt' ? '?lang=' + lang : ''));
}

// Linha de cabeçalho de uma aba de contatos: a primeira das 5 primeiras com "Email".
function agendaHeaderRow_(sheet) {
    const lastCol = sheet.getLastColumn();
    const rows    = Math.min(5, sheet.getLastRow());
    if (!lastCol || !rows) return 1;
    const top = sheet.getRange(1, 1, rows, lastCol).getDisplayValues();
    for (let r = 0; r < top.length; r++) {
        if (top[r].map(normalizeText_).some(function (h) { return h === 'email' || h === 'e-mail'; })) return r + 1;
    }
    return 1;
}

// Garante um token de agendamento na linha do lead e o devolve.
// Chamado pelo doPost (lead novo) e pelo WhatsApp de primeiro contato.
function agendaAssignLeadToken_(sheet, row, headerRow) {
    const header = headerRow || agendaHeaderRow_(sheet);
    const col    = ensureColumn_(sheet, header, AGENDA.TOKEN_HEADER, 1);
    const cell   = sheet.getRange(row, col);
    const existing = agendaCleanToken_(cell.getValue());
    if (existing) return existing;
    const token = agendaNewToken_();
    cell.setValue(token);
    return token;
}

// Lead dono do token: { row, name, email, phone (só dígitos), lang } ou null.
function agendaFindLead_(token) {
    if (!token) return null;
    let found;
    try { found = findRemarketingSheet_(); } catch (error) { return null; }

    const sheet    = found.sheet;
    const tokenCol = ensureColumn_(sheet, found.headerRow, AGENDA.TOKEN_HEADER, found.cols.status);
    const firstRow = found.headerRow + 1;
    const lastRow  = sheet.getLastRow();
    if (lastRow < firstRow) return null;

    const tokens = sheet.getRange(firstRow, tokenCol, lastRow - firstRow + 1, 1).getValues();
    const idx = tokens.findIndex(function (r) { return String(r[0]).trim() === token; });
    if (idx === -1) return null;

    const row    = firstRow + idx;
    const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    let phone = '';
    try { phone = String(values[findWhatsAppPhoneColumn_(sheet, found.headerRow) - 1] || '').replace(/\D/g, ''); } catch (error) { /* sem coluna de telefone */ }

    return {
        row:   row,
        name:  String(values[found.cols.name - 1] || '').trim(),
        email: String(values[found.cols.email - 1] || '').trim(),
        phone: phone,
        lang:  pickRemarketingLang_(values[found.cols.language - 1]),
    };
}

// Reflete o agendamento na aba de contatos (coluna "Call agendada").
function agendaMarkLead_(booking, text) {
    if (!booking.leadRow) return;
    try {
        const found = findRemarketingSheet_();
        const col = ensureColumn_(found.sheet, found.headerRow, AGENDA.CALL_HEADER, found.cols.status);
        found.sheet.getRange(Number(booking.leadRow), col).setNumberFormat('@').setValue(text);
    } catch (error) {
        Logger.log('agenda: não consegui marcar a aba de contatos: ' + error);
    }
}

// Usado pelo WhatsApp de primeiro contato: o lead já marcou a call pelo e-mail?
function agendaHasActiveBooking_(token) {
    if (!token) return false;
    const now = new Date();
    return agendaReadBookings_(agendaBookingsSheet_()).some(function (b) {
        return b.token === token && agendaIsActive_(b, now);
    });
}

function agendaNormalizePhone_(value) {
    const raw = String(value || '').trim();
    let digits = raw.replace(/\D/g, '');
    // Número brasileiro digitado sem o 55 (DDD + número)
    if (raw.charAt(0) !== '+' && (digits.length === 10 || digits.length === 11)) digits = '55' + digits;
    return digits;
}

// O que o site pode saber sobre um agendamento.
function agendaPublic_(booking) {
    if (!booking) return null;
    return {
        token:     booking.token,
        start:     booking.start,
        duration:  Number(booking.duration),
        link:      booking.link,
        status:    booking.status,
        firstName: firstNameOf_(booking.name),
        lang:      booking.lang,
    };
}

// ============================================
// Ações públicas (lead)
// ============================================

function agendaActionSlots_(data) {
    const now      = new Date();
    const token    = agendaCleanToken_(data.token);
    const config   = agendaConfig_();
    const bookings = agendaReadBookings_(agendaBookingsSheet_());
    const lead     = agendaFindLead_(token);

    const mine    = bookings.filter(function (b) { return token && b.token === token; });
    const current = mine.filter(function (b) { return agendaIsActive_(b, now); })[0] || null;
    const known   = lead || mine[mine.length - 1] || null;

    return {
        status:   'success',
        slots:    agendaComputeSlots_(agendaReadAvailability_(), bookings, config, now, token),
        duration: Number(config.duration),
        lead:     known ? { firstName: firstNameOf_(known.name), lang: known.lang } : null,
        booking:  agendaPublic_(current),
    };
}

function agendaActionGet_(data) {
    const token = agendaCleanToken_(data.token);
    if (!token) return agendaError_('not_found');
    const now  = new Date();
    const mine = agendaReadBookings_(agendaBookingsSheet_()).filter(function (b) { return b.token === token; });
    const current = mine.filter(function (b) { return agendaIsActive_(b, now); })[0];
    if (!current) return { status: 'success', booking: null, lang: mine.length ? mine[mine.length - 1].lang : '' };
    return { status: 'success', booking: agendaPublic_(current), lang: current.lang };
}

function agendaActionBook_(data) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return agendaError_('busy');

    try {
        const now      = new Date();
        const config   = agendaConfig_();
        const sheet    = agendaBookingsSheet_();
        const bookings = agendaReadBookings_(sheet);

        let token   = agendaCleanToken_(data.token);
        const lead  = agendaFindLead_(token);
        const mine  = bookings.filter(function (b) { return token && b.token === token; });
        const known = lead || mine[mine.length - 1] || null;
        if (!known) token = '';   // token desconhecido: trata como agendamento avulso

        const who = known ? {
            name: known.name, email: known.email, phone: known.phone, lang: known.lang,
        } : {
            name:  String(data.name || '').trim().slice(0, 120),
            email: String(data.email || '').trim().slice(0, 160),
            phone: agendaNormalizePhone_(data.phone),
            lang:  pickRemarketingLang_(data.lang),
        };
        if (!who.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(who.email)) return agendaError_('missing_contact');
        if (!known && (who.phone.length < 10 || who.phone.length > 15)) return agendaError_('missing_contact');

        const start = new Date(String(data.start || ''));
        if (isNaN(start.getTime())) return agendaError_('invalid_slot');
        const startIso = start.toISOString();
        if (agendaComputeSlots_(agendaReadAvailability_(), bookings, config, now, token).indexOf(startIso) === -1) {
            return agendaError_('slot_taken');
        }

        const current = mine.filter(function (b) { return agendaIsActive_(b, now); })[0];
        const booking = current || {
            token: token || agendaNewToken_(), link: '', eventId: '', reschedules: '0',
            leadRow: lead ? String(lead.row) : '',
        };
        const rescheduled = !!current;
        if (rescheduled && booking.start === startIso) return { status: 'success', booking: agendaPublic_(booking), unchanged: true };

        booking.name      = who.name;
        booking.email     = who.email;
        booking.phone     = who.phone;
        booking.lang      = who.lang;
        booking.tz        = String(data.tz || '').slice(0, 60);
        booking.start     = startIso;
        booking.startText = agendaStamp_(start);
        booking.duration  = String(config.duration);
        booking.bookedAt  = now.toISOString();
        booking.status    = AGENDA.BOOKED;
        booking.confirmEmail = booking.confirmWhatsApp = booking.reminder24 = booking.reminder2 = booking.confirmedAt = '';
        if (rescheduled) booking.reschedules = String((parseInt(booking.reschedules, 10) || 0) + 1);

        const meeting = agendaUpsertMeeting_(booking);
        booking.eventId = meeting.id;
        booking.link    = meeting.link;

        agendaWriteBooking_(sheet, booking);
        agendaMarkLead_(booking, booking.startText);
        SpreadsheetApp.flush();
        agendaNotifyTeam_(booking, rescheduled, meeting.error);

        return { status: 'success', booking: agendaPublic_(booking), rescheduled: rescheduled };
    } finally {
        lock.releaseLock();
    }
}

// Confirmação imediata. O site chama logo depois do agendamento; se o lead
// fechar a página antes, o gatilho (runAgendaReminders) manda no lugar.
function agendaActionNotify_(data) {
    const token = agendaCleanToken_(data.token);
    if (!token) return agendaError_('not_found');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return agendaError_('busy');
    try {
        const sheet = agendaBookingsSheet_();
        const now   = new Date();
        const booking = agendaReadBookings_(sheet).filter(function (b) { return b.token === token && agendaIsActive_(b, now); })[0];
        if (!booking) return agendaError_('not_found');
        agendaSendConfirmation_(sheet, booking);
        return { status: 'success' };
    } finally {
        lock.releaseLock();
    }
}

function agendaActionConfirm_(data) {
    const token = agendaCleanToken_(data.token);
    if (!token) return agendaError_('not_found');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return agendaError_('busy');
    try {
        const sheet = agendaBookingsSheet_();
        const now   = new Date();
        const booking = agendaReadBookings_(sheet).filter(function (b) { return b.token === token && agendaIsActive_(b, now); })[0];
        if (!booking) return agendaError_('not_found');
        if (booking.status !== AGENDA.CONFIRMED) {
            agendaSetField_(sheet, booking, 'status', AGENDA.CONFIRMED);
            agendaSetField_(sheet, booking, 'confirmedAt', agendaStamp_(now));
            agendaMarkLead_(booking, booking.startText + ' (confirmada)');
        }
        return { status: 'success', booking: agendaPublic_(booking) };
    } finally {
        lock.releaseLock();
    }
}

// ============================================
// Painel do pesquisador
// ============================================

function agendaCheckAdmin_(data) {
    const expected = String(PropertiesService.getScriptProperties().getProperty('AGENDA_ADMIN_KEY') || '').trim();
    if (!expected) return agendaError_('admin_not_configured');
    if (String(data.key || '').trim() !== expected) {
        Utilities.sleep(800);   // desestimula tentativa e erro
        return agendaError_('unauthorized');
    }
    return null;
}

function agendaAdminLoad_(data) {
    const denied = agendaCheckAdmin_(data);
    if (denied) return denied;

    const now      = new Date();
    const today    = agendaBrDate_(now);
    const config   = agendaConfig_();
    const all      = agendaReadAvailability_();
    const availability = {};
    Object.keys(all).forEach(function (date) { if (date >= today) availability[date] = all[date]; });

    const bookings = agendaReadBookings_(agendaBookingsSheet_())
        .filter(function (b) { return new Date(b.start).getTime() > now.getTime() - 86400000; })
        .sort(function (a, b) { return a.start < b.start ? -1 : 1; })
        .map(function (b) {
            return {
                token: b.token, name: b.name, email: b.email, phone: b.phone, start: b.start,
                duration: Number(b.duration), link: b.link, status: b.status,
                confirmedAt: b.confirmedAt, reminder24: b.reminder24, reminder2: b.reminder2,
            };
        });

    return {
        status: 'success', today: today, config: config, availability: availability, bookings: bookings,
        windowEnd: agendaWindowEnd_(config, now),
    };
}

function agendaAdminSave_(data) {
    const denied = agendaCheckAdmin_(data);
    if (denied) return denied;

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return agendaError_('busy');
    try {
        const incoming = data.config || {};
        const config = agendaConfig_();
        if (AGENDA.WINDOW_OPTIONS.indexOf(String(incoming.window)) !== -1) config.window = String(incoming.window);
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(incoming.customEnd || ''))) config.customEnd = String(incoming.customEnd);
        if (AGENDA.DURATIONS.indexOf(Number(incoming.duration)) !== -1) config.duration = Number(incoming.duration);
        const notice = Number(incoming.minNoticeHours);
        if (notice >= 0 && notice <= 168) config.minNoticeHours = notice;
        if (config.window === 'custom' && !config.customEnd) return agendaError_('invalid_config');
        PropertiesService.getScriptProperties().setProperty('AGENDA_CONFIG', JSON.stringify(config));

        if (data.availability && typeof data.availability === 'object') {
            const today = agendaBrDate_(new Date());
            const clean = {};
            Object.keys(data.availability).forEach(function (date) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) return;
                const times = agendaParseTimes_((data.availability[date] || []).join(','));
                if (times.length) clean[date] = times;
            });
            agendaWriteAvailability_(clean);
        }
        return agendaAdminLoad_(data);
    } finally {
        lock.releaseLock();
    }
}

// Cancela pelo painel. Não avisa o lead por WhatsApp/e-mail — só o Google
// Agenda manda o aviso de evento cancelado, se o convite estiver ligado.
function agendaAdminCancel_(data) {
    const denied = agendaCheckAdmin_(data);
    if (denied) return denied;

    const token = agendaCleanToken_(data.token);
    const lock  = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return agendaError_('busy');
    try {
        const sheet = agendaBookingsSheet_();
        const now   = new Date();
        const booking = agendaReadBookings_(sheet).filter(function (b) { return b.token === token && agendaIsActive_(b, now); })[0];
        if (!booking) return agendaError_('not_found');

        agendaSetField_(sheet, booking, 'status', AGENDA.CANCELED);
        agendaMarkLead_(booking, booking.startText + ' (cancelada)');
        if (booking.eventId) {
            try {
                Calendar.Events.remove(AGENDA.CALENDAR_ID, booking.eventId, { sendUpdates: AGENDA.SEND_CALENDAR_INVITE ? 'all' : 'none' });
            } catch (error) {
                Logger.log('agenda: não consegui apagar o evento ' + booking.eventId + ': ' + error);
            }
        }
        return agendaAdminLoad_(data);
    } finally {
        lock.releaseLock();
    }
}

// ============================================
// Reunião (Google Agenda + Meet)
// ============================================

// Cria o evento (com Meet) ou, num reagendamento, só muda o horário — o link
// continua o mesmo. Devolve { id, link, error }. Nunca lança: se o Meet falhar,
// o agendamento segue com o AGENDA_FALLBACK_LINK (ou sem link) e a equipe é avisada.
function agendaUpsertMeeting_(booking) {
    const start = new Date(booking.start);
    const end   = new Date(start.getTime() + Number(booking.duration) * 60000);
    const times = { start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } };
    const sendUpdates = AGENDA.SEND_CALENDAR_INVITE ? 'all' : 'none';

    try {
        if (booking.eventId) {
            Calendar.Events.patch(times, AGENDA.CALENDAR_ID, booking.eventId, { sendUpdates: sendUpdates });
            return { id: booking.eventId, link: booking.link };
        }

        const event = Calendar.Events.insert({
            summary:     'SIPOP — Call com ' + booking.name,
            description: 'Call agendada pelo site.\n\nNome: ' + booking.name + '\nE-mail: ' + booking.email +
                         '\nWhatsApp: +' + booking.phone + '\n\nReagendar: ' + agendaBookUrl_(booking.token),
            start:       times.start,
            end:         times.end,
            attendees:   booking.email ? [{ email: booking.email, displayName: booking.name }] : [],
            conferenceData: {
                createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
            },
        }, AGENDA.CALENDAR_ID, { conferenceDataVersion: 1, sendUpdates: sendUpdates });

        let link = event.hangoutLink || '';
        if (!link && event.conferenceData && event.conferenceData.entryPoints) {
            const video = event.conferenceData.entryPoints.filter(function (p) { return p.entryPointType === 'video'; })[0];
            link = video ? video.uri : '';
        }
        if (!link) throw new Error('evento criado sem link do Meet');
        return { id: event.id, link: link };
    } catch (error) {
        Logger.log('agenda: falha no Google Agenda/Meet: ' + error);
        const fallback = String(PropertiesService.getScriptProperties().getProperty('AGENDA_FALLBACK_LINK') || '').trim();
        return { id: booking.eventId || '', link: booking.link || fallback, error: String(error) };
    }
}

// ============================================
// Mensagens
// ============================================

function agendaFill_(lines, booking, extra) {
    const copy  = AGENDA_COPY[booking.lang] || AGENDA_COPY.pt;
    const first = firstNameOf_(booking.name);
    const when  = agendaFormatWhen_(new Date(booking.start), booking.lang, booking.tz);
    const values = {
        hello: first ? copy.hello.replace('{firstName}', first) : copy.helloNoName,
        when:  when.when,
        time:  when.time,
        link:  booking.link,
        url:   (extra && extra.url) || agendaBookUrl_(booking.token),
    };
    return lines
        .filter(function (line) { return booking.link || line.indexOf('{link}') === -1; })   // sem link, some a linha
        .map(function (line) {
            return line.replace(/\{(\w+)\}/g, function (m, key) { return values[key] !== undefined ? values[key] : m; });
        })
        .join('\n\n');
}

function agendaSendWhatsApp_(booking, text) {
    if (booking.phone.length < 10 || booking.phone.length > 15) return 'no_phone';
    let config;
    try { config = getEvolutionConfig_(); } catch (error) { Logger.log('agenda: ' + error); return 'error'; }
    return sendEvolutionText_(config, booking.phone, text);
}

// Grava o resultado de um envio de WhatsApp na coluna `key`.
// Devolve true se a coluna foi resolvida (enviado ou impossível); false = tentar de novo.
function agendaRecordWhatsApp_(sheet, booking, key, result) {
    if (result === 'sent')        agendaSetField_(sheet, booking, key, agendaStamp_());
    else if (result === 'no_whatsapp') agendaSetField_(sheet, booking, key, AGENDA.NO_WHATSAPP);
    else if (result === 'no_phone')    agendaSetField_(sheet, booking, key, AGENDA.NO_PHONE);
    else return false;
    return true;
}

function agendaSendConfirmation_(sheet, booking) {
    const copy = AGENDA_COPY[booking.lang] || AGENDA_COPY.pt;

    if (!booking.confirmWhatsApp) {
        agendaRecordWhatsApp_(sheet, booking, 'confirmWhatsApp', agendaSendWhatsApp_(booking, agendaFill_(copy.confirmation, booking)));
    }
    if (!booking.confirmEmail) {
        if (!booking.email) agendaSetField_(sheet, booking, 'confirmEmail', AGENDA.NO_EMAIL);
        else if (agendaSendConfirmationEmail_(booking)) agendaSetField_(sheet, booking, 'confirmEmail', agendaStamp_());
    }
    SpreadsheetApp.flush();
}

function agendaSendConfirmationEmail_(booking) {
    const apiKey = PropertiesService.getScriptProperties().getProperty('RESEND_API_KEY');
    if (!apiKey) { Logger.log('agenda: RESEND_API_KEY não configurada — e-mail de confirmação não enviado'); return false; }

    const copy   = AGENDA_COPY[booking.lang] || AGENDA_COPY.pt;
    const e      = copy.email;
    const first  = firstNameOf_(booking.name);
    const hello  = first ? copy.hello.replace('{firstName}', first) : copy.helloNoName;
    const when   = agendaFormatWhen_(new Date(booking.start), booking.lang, booking.tz).when;
    const url    = agendaBookUrl_(booking.token);
    const color  = REMARKETING.BRAND_COLOR;

    const text = [hello, '', e.intro, '', e.whenLabel + ': ' + when,
        booking.link ? e.join + ': ' + booking.link : e.linkSoon, '', e.tips, e.reschedule + ': ' + url, '',
        e.signoff, e.signature, AGENDA.SITE_URL].join('\n');

    const linkHtml = booking.link
        ? '<p style="margin:8px 0 8px;"><a href="' + escapeHtml_(booking.link) + '" style="display:inline-block;background:' + color + ';color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">' + escapeHtml_(e.join) + '</a></p>' +
          '<p style="margin:0 0 20px;font-size:13px;color:#718096;word-break:break-all;">' + escapeHtml_(booking.link) + '</p>'
        : '<p style="margin:0 0 16px;">' + escapeHtml_(e.linkSoon) + '</p>';

    const html =
        '<!doctype html><html lang="' + (booking.lang === 'pt' ? 'pt-BR' : booking.lang) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
        '<body style="margin:0;padding:0;background:#f4f6f6;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f6;padding:24px 12px;"><tr><td align="center">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;border-top:4px solid ' + color + ';">' +
        '<tr><td style="padding:32px 28px;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1a202c;">' +
        '<p style="margin:0 0 16px;">' + escapeHtml_(hello) + '</p>' +
        '<p style="margin:0 0 16px;">' + escapeHtml_(e.intro) + '</p>' +
        '<p style="margin:0 0 16px;padding:14px 16px;background:#f4f6f6;border-left:4px solid #81C7B7;border-radius:0 6px 6px 0;">' +
        '<span style="font-size:13px;color:#718096;">' + escapeHtml_(e.whenLabel) + '</span><br><strong>' + escapeHtml_(when) + '</strong></p>' +
        linkHtml +
        '<p style="margin:0 0 16px;">' + escapeHtml_(e.tips) + '</p>' +
        '<p style="margin:0 0 16px;font-size:14px;"><a href="' + url + '" style="color:' + color + ';">' + escapeHtml_(e.reschedule) + '</a></p>' +
        '<p style="margin:24px 0 0;">' + escapeHtml_(e.signoff) + '<br><strong>' + escapeHtml_(e.signature) + '</strong></p>' +
        '</td></tr></table></td></tr></table></body></html>';

    try {
        const response = UrlFetchApp.fetch('https://api.resend.com/emails', {
            method:      'post',
            contentType: 'application/json',
            headers: {
                'Authorization':   'Bearer ' + apiKey,
                'Idempotency-Key': 'agenda-confirm/' + booking.token + '/' + booking.start,
            },
            payload: JSON.stringify({
                from:     REMARKETING.FROM,
                to:       [booking.email],
                reply_to: REMARKETING.REPLY_TO,
                subject:  e.subject,
                html:     html,
                text:     text,
                tags:     [{ name: 'type', value: 'call_confirmation' }],
            }),
            muteHttpExceptions: true,
        });
        const code = response.getResponseCode();
        if (code >= 200 && code < 300) return true;
        Logger.log('agenda: Resend recusou a confirmação para ' + booking.email + ': ' + code + ' ' + response.getContentText().slice(0, 300));
    } catch (error) {
        Logger.log('agenda: falha ao chamar o Resend: ' + error);
    }
    return false;
}

// Aviso interno para a equipe a cada agendamento/reagendamento.
function agendaNotifyTeam_(booking, rescheduled, meetingError) {
    try {
        MailApp.sendEmail({
            to:      EMAIL_RECIPIENTS.join(','),
            subject: '[SIPOP] Call ' + (rescheduled ? 'reagendada' : 'agendada') + ' — ' + booking.name + ' — ' + booking.startText,
            body:
                'Call ' + (rescheduled ? 'REAGENDADA' : 'agendada') + ' pelo site.\n\n' +
                'Quando:   ' + booking.startText + ' (Brasília), ' + booking.duration + ' min\n' +
                'Nome:     ' + booking.name + '\n' +
                'E-mail:   ' + booking.email + '\n' +
                'WhatsApp: +' + booking.phone + '\n' +
                'Link:     ' + (booking.link || '— (não gerado)') + '\n' +
                (meetingError ? '\nATENÇÃO: o link do Meet não foi gerado automaticamente (' + meetingError + ').\n' +
                    'Confira se o serviço "Google Calendar API" está ativado no projeto do Apps Script.\n' : ''),
        });
    } catch (error) {
        Logger.log('agenda: falha ao avisar a equipe: ' + error);
    }
}

// ============================================
// Lembretes (gatilho a cada 5 min)
// ============================================

function setupAgendaTrigger() {
    removeAgendaTrigger();
    agendaBookingsSheet_();
    agendaReadAvailability_();
    ScriptApp.newTrigger('runAgendaReminders').timeBased().everyMinutes(AGENDA.TRIGGER_MINUTES).create();
    Logger.log('Gatilho criado: runAgendaReminders a cada ' + AGENDA.TRIGGER_MINUTES + ' min.');
}

function removeAgendaTrigger() {
    ScriptApp.getProjectTriggers()
        .filter(function (t) { return t.getHandlerFunction() === 'runAgendaReminders'; })
        .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

// O que falta mandar para um agendamento agora (função pura).
// Devolve uma lista de { key, action: 'send' | 'waive' }.
function agendaDueReminders_(booking, now) {
    const due = [];
    if (booking.status !== AGENDA.BOOKED && booking.status !== AGENDA.CONFIRMED) return due;

    const start    = new Date(booking.start).getTime();
    const bookedAt = new Date(booking.bookedAt).getTime();
    if (isNaN(start) || isNaN(bookedAt)) return due;

    const toStart = start - now.getTime();
    const lead    = start - bookedAt;                       // antecedência com que foi marcado
    const long    = AGENDA.REMINDER_LONG_HOURS * 3600000;
    const short   = AGENDA.REMINDER_SHORT_HOURS * 3600000;

    // Confirmação que o site não conseguiu mandar (lead fechou a página, falha da API…)
    const age = now.getTime() - bookedAt;
    if ((!booking.confirmEmail || !booking.confirmWhatsApp) && toStart > 0 &&
        age > 2 * 60000 && age < AGENDA.RETRY_CONFIRMATION_HOURS * 3600000) {
        due.push({ key: 'confirmation', action: 'send' });
    }

    if (!booking.reminder24) {
        if (lead < long || toStart <= short) due.push({ key: 'reminder24', action: 'waive' });   // marcado em cima da hora, ou já passou
        else if (toStart <= long) due.push({ key: 'reminder24', action: 'send' });
    }
    if (!booking.reminder2) {
        if (lead < short || toStart <= 0) due.push({ key: 'reminder2', action: 'waive' });
        else if (toStart <= short) due.push({ key: 'reminder2', action: 'send' });
    }
    return due;
}

function runAgendaReminders() {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) return;

    try {
        const sheet = agendaBookingsSheet_();
        const now   = new Date();
        let sent = 0;

        agendaReadBookings_(sheet).forEach(function (booking) {
            agendaDueReminders_(booking, now).forEach(function (item) {
                if (item.action === 'waive') { agendaSetField_(sheet, booking, item.key, AGENDA.WAIVED); return; }
                if (item.key === 'confirmation') { agendaSendConfirmation_(sheet, booking); return; }

                const copy = AGENDA_COPY[booking.lang] || AGENDA_COPY.pt;
                const text = item.key === 'reminder24'
                    ? agendaFill_(copy.reminder24, booking, { url: AGENDA.SITE_URL + AGENDA.CONFIRM_PATH + '?t=' + booking.token })
                    : agendaFill_(copy.reminder2, booking);

                if (sent > 0) Utilities.sleep(3000 + Math.floor(Math.random() * 3000));   // espaça os envios
                if (agendaRecordWhatsApp_(sheet, booking, item.key, agendaSendWhatsApp_(booking, text))) sent++;
                // 'error': a célula fica vazia e a próxima execução tenta de novo.
            });
        });
        SpreadsheetApp.flush();
    } finally {
        lock.releaseLock();
    }
}

// ============================================
// Testes manuais
// ============================================

function previewAgendaSlots() {
    const now   = new Date();
    const slots = agendaComputeSlots_(agendaReadAvailability_(), agendaReadBookings_(agendaBookingsSheet_()), agendaConfig_(), now, '');
    Logger.log('Config: ' + JSON.stringify(agendaConfig_()) + ' — até ' + agendaWindowEnd_(agendaConfig_(), now));
    Logger.log(slots.length + ' horário(s) visível(is) para o lead:');
    slots.forEach(function (iso) { Logger.log('  ' + agendaStamp_(new Date(iso))); });
}

function testAgendaMeet() {
    const start = new Date(Date.now() + 7 * 86400000);
    const meeting = agendaUpsertMeeting_({
        token: agendaNewToken_(), name: 'Teste', email: '', phone: '', duration: '30', start: start.toISOString(), eventId: '', link: '',
    });
    Logger.log(meeting.error ? 'FALHOU: ' + meeting.error : 'OK — link do Meet: ' + meeting.link);
    if (meeting.id && !meeting.error) Calendar.Events.remove(AGENDA.CALENDAR_ID, meeting.id, { sendUpdates: 'none' });
}
