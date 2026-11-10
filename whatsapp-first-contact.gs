// ============================================
// SIPOP — WhatsApp de primeiro contato (Google Apps Script + Evolution API)
//
// Mais um arquivo do MESMO projeto do apps-script.gs (crie
// "whatsapp-first-contact.gs" no editor do Apps Script e cole este código).
// Usa helpers do remarketing.gs: findRemarketingSheet_, ensureColumn_,
// normalizeText_, firstNameOf_, pickRemarketingLang_ — e do agenda.gs:
// agendaAssignLeadToken_, agendaBookUrl_, agendaHasActiveBooking_ (a mensagem
// leva o link de agendamento do lead).
//
// O QUE FAZ
// A cada 5 minutos olha a aba de contatos e manda, pelo número de WhatsApp
// conectado na Evolution API, uma mensagem de primeiro contato para cada
// lead novo, convidando para marcar uma reunião.
//
// QUANDO ENVIA
//   - 30 minutos depois do formulário (o e-mail de primeiro contato sai na hora);
//   - só de segunda a sexta, das 9h30 às 18h (horário de Brasília). Lead que
//     chega fora dessa janela recebe às 9h30 do próximo dia útil;
//   - no idioma da coluna "Preferred Language" (PT / EN / ES).
//
// QUANDO NÃO ENVIA
//   - lead sem telefone, ou com número que não tem WhatsApp ("Sem WhatsApp");
//   - lead cujo Status já foi preenchido pela equipe ("Ignorado (status)") —
//     alguém já está cuidando dele;
//   - telefone que já recebeu a mensagem em outra linha ("Duplicado");
//   - lead que já marcou a call pelo link do e-mail ("Já agendou");
//   - lead anterior à ativação (setupWhatsAppTrigger) ou parado há mais de
//     MAX_AGE_HOURS ("Expirado") — nada de mensagem "de primeiro contato"
//     dias depois.
//
// O resultado fica na coluna "WhatsApp (primeiro contato)", criada no fim
// da planilha: data/hora do envio ou um dos avisos acima. Linha com essa
// coluna preenchida nunca é processada de novo — para reenviar, apague a célula.
//
// CONFIGURAÇÃO (uma vez)
// 1. Evolution API (v2) no ar, com uma instância conectada ao WhatsApp do SIPOP.
// 2. Projeto do Apps Script > Configurações do projeto > Propriedades do script:
//      EVOLUTION_API_URL   — ex.: https://evolution.seudominio.com (sem barra no fim)
//      EVOLUTION_API_KEY   — API key da instância (ou a global)
//      EVOLUTION_INSTANCE  — nome da instância
//      WHATSAPP_TEST_NUMBER (opcional) — seu número com DDI, para sendWhatsAppTest()
// 3. Rode sendWhatsAppTest() e confira a mensagem no seu celular.
// 4. Rode setupWhatsAppTrigger() uma vez e autorize. A partir desse momento
//    os leads NOVOS passam a receber; os antigos não são tocados.
//
// FUNÇÕES ÚTEIS (rode pelo editor)
//   previewWhatsAppFirstContact() — mostra no log quem receberia agora, sem enviar
//   sendWhatsAppTest()            — manda a mensagem (PT) para WHATSAPP_TEST_NUMBER
//   sendWhatsAppFirstContact()    — o envio real (é o que o gatilho chama)
//   removeWhatsAppTrigger()       — desliga a automação
// ============================================

const WHATSAPP = {
    DELAY_MINUTES:    30,          // espera depois do formulário
    WINDOW_START_MIN: 9 * 60 + 30, // 9h30 — início da janela de envio (Brasília)
    WINDOW_END_MIN:   18 * 60,     // 18h  — fim da janela
    UTC_OFFSET_HOURS: -3,          // Brasília (sem horário de verão desde 2019)
    MAX_AGE_HOURS:    100,         // cobre sexta à noite -> segunda de manhã
    MAX_PER_RUN:      10,          // trava de segurança por execução
    TRIGGER_MINUTES:  5,
    TYPING_MS:        1500,        // "digitando..." antes da mensagem

    PHONE_HEADERS: ['Phone', 'Telefone', 'WhatsApp'],
    SENT_HEADER:   'WhatsApp (primeiro contato)',

    NO_WHATSAPP: 'Sem WhatsApp',
    DUPLICATE:   'Duplicado',
    SKIPPED:     'Ignorado (status)',
    EXPIRED:     'Expirado',
    BOOKED:      'Já agendou',
};

// ============================================
// TEXTO — edite aqui. "{firstName}" vira o primeiro nome do lead.
// ============================================

const WHATSAPP_COPY = {
    pt: {
        greeting:       'Olá, {firstName}! Tudo bem?',
        greetingNoName: 'Olá! Tudo bem?',
        body: [
            'Aqui é da equipe do SIPOP. Recebemos o contato que você enviou pelo nosso site.',
            'Para indicar o melhor caminho para o seu estudo, gostaríamos de marcar uma conversa rápida e entender melhor o seu projeto.',
            'Você pode escolher o melhor dia e horário neste link:',
            '{scheduleUrl}',
        ],
    },
    en: {
        greeting:       'Hi {firstName}, how are you?',
        greetingNoName: 'Hi, how are you?',
        body: [
            'This is the SIPOP team. We received the message you sent through our website.',
            'To point you to the best path for your study, we would like to schedule a short call and learn more about your project.',
            'You can pick the day and time that suit you best here:',
            '{scheduleUrl}',
        ],
    },
    es: {
        greeting:       '¡Hola, {firstName}! ¿Cómo estás?',
        greetingNoName: '¡Hola! ¿Cómo estás?',
        body: [
            'Te escribe el equipo de SIPOP. Recibimos el mensaje que enviaste a través de nuestro sitio web.',
            'Para indicarte el mejor camino para tu estudio, nos gustaría agendar una conversación breve y conocer mejor tu proyecto.',
            'Puedes elegir el día y el horario que prefieras aquí:',
            '{scheduleUrl}',
        ],
    },
};

function buildWhatsAppMessage_(lead) {
    const copy      = WHATSAPP_COPY[pickRemarketingLang_(lead.language)];
    const firstName = firstNameOf_(lead.name);
    const greeting  = firstName ? copy.greeting.replace('{firstName}', firstName) : copy.greetingNoName;
    // Link de agendamento (agenda.gs): pessoal quando a linha tem token.
    const scheduleUrl = agendaBookUrl_(lead.token || '', pickRemarketingLang_(lead.language));
    return [greeting].concat(copy.body).join('\n\n').replace('{scheduleUrl}', scheduleUrl);
}

// ============================================
// Gatilho
// ============================================

function setupWhatsAppTrigger() {
    getEvolutionConfig_(); // falha cedo se faltar alguma propriedade
    removeWhatsAppTrigger();

    // Marco zero: só leads que chegarem a partir de agora recebem a mensagem.
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty('WHATSAPP_START')) {
        props.setProperty('WHATSAPP_START', new Date().toISOString());
    }

    ScriptApp.newTrigger('sendWhatsAppFirstContact')
        .timeBased()
        .everyMinutes(WHATSAPP.TRIGGER_MINUTES)
        .create();

    Logger.log('Gatilho criado: sendWhatsAppFirstContact a cada ' + WHATSAPP.TRIGGER_MINUTES +
        ' min. Leads a partir de ' + props.getProperty('WHATSAPP_START') + '.');
}

function removeWhatsAppTrigger() {
    ScriptApp.getProjectTriggers()
        .filter(function (t) { return t.getHandlerFunction() === 'sendWhatsAppFirstContact'; })
        .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

// ============================================
// Horário de envio (funções puras)
// ============================================

// Relógio de Brasília de um instante: dia da semana (0 = domingo) e minutos desde 0h.
function brClock_(date) {
    const shifted = new Date(date.getTime() + WHATSAPP.UTC_OFFSET_HOURS * 3600000);
    return { weekday: shifted.getUTCDay(), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

function isInsideWindow_(date) {
    const c = brClock_(date);
    return c.weekday >= 1 && c.weekday <= 5 &&
        c.minutes >= WHATSAPP.WINDOW_START_MIN && c.minutes < WHATSAPP.WINDOW_END_MIN;
}

// Instante em que a mensagem de um lead deve sair: formulário + 30 min,
// empurrado para as 9h30 do próximo dia útil se cair fora da janela.
function whatsAppDueTime_(leadDate) {
    let due = new Date(leadDate.getTime() + WHATSAPP.DELAY_MINUTES * 60000);

    for (let guard = 0; guard < 8 && !isInsideWindow_(due); guard++) {
        const c = brClock_(due);
        const beforeWindow = c.weekday >= 1 && c.weekday <= 5 && c.minutes < WHATSAPP.WINDOW_START_MIN;
        // 9h30 de hoje (se ainda não abriu) ou de amanhã; o laço cuida do fim de semana.
        const minutesAhead = (beforeWindow ? 0 : 1440) + WHATSAPP.WINDOW_START_MIN - c.minutes;
        due = new Date(Math.floor(due.getTime() / 60000) * 60000 + minutesAhead * 60000);
    }
    return due;
}

// O que fazer com uma linha agora: { action: 'send' | 'wait' | 'mark' | 'skip', mark? }
function whatsAppDecision_(lead, now, startDate, sentPhones) {
    if (lead.sent) return { action: 'skip' };
    if (Object.prototype.toString.call(lead.date) !== '[object Date]' || isNaN(lead.date.getTime())) return { action: 'skip' };
    if (!startDate || lead.date < startDate) return { action: 'skip' };          // anterior à ativação
    if (!lead.phone) return { action: 'skip' };

    if (normalizeText_(lead.status)) return { action: 'mark', mark: WHATSAPP.SKIPPED };
    if (lead.phone.length < 10 || lead.phone.length > 15) return { action: 'mark', mark: WHATSAPP.NO_WHATSAPP };
    if (sentPhones[lead.phone]) return { action: 'mark', mark: WHATSAPP.DUPLICATE };
    if (now.getTime() - lead.date.getTime() > WHATSAPP.MAX_AGE_HOURS * 3600000) return { action: 'mark', mark: WHATSAPP.EXPIRED };

    if (now < whatsAppDueTime_(lead.date) || !isInsideWindow_(now)) return { action: 'wait' };
    return { action: 'send' };
}

// ============================================
// Envio
// ============================================

function sendWhatsAppFirstContact() {
    runWhatsAppFirstContact_(false);
}

function previewWhatsAppFirstContact() {
    runWhatsAppFirstContact_(true);
}

function runWhatsAppFirstContact_(dryRun) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
        Logger.log('Outra execução está em andamento. Saindo.');
        return;
    }

    try {
        const now = new Date();
        const startIso  = PropertiesService.getScriptProperties().getProperty('WHATSAPP_START');
        const startDate = startIso ? new Date(startIso) : null;
        if (!startDate) {
            Logger.log('WHATSAPP_START não definido — rode setupWhatsAppTrigger() primeiro.');
            return;
        }
        // Fora da janela não há nada a enviar: sai sem nem ler a planilha.
        if (!dryRun && !isInsideWindow_(now)) return;

        const config   = dryRun ? null : getEvolutionConfig_();
        const found    = findRemarketingSheet_();
        const sheet    = found.sheet;
        const cols     = found.cols;
        const firstRow = found.headerRow + 1;
        const phoneCol = findWhatsAppPhoneColumn_(sheet, found.headerRow);
        const sentCol  = ensureColumn_(sheet, found.headerRow, WHATSAPP.SENT_HEADER, cols.status);

        const lastRow = sheet.getLastRow();
        if (lastRow < firstRow) return;

        const rows  = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, sheet.getLastColumn()).getValues();
        const leads = rows.map(function (values, i) {
            return {
                row:      firstRow + i,
                date:     values[cols.date - 1],
                name:     values[cols.name - 1],
                language: values[cols.language - 1],
                status:   values[cols.status - 1],
                phone:    String(values[phoneCol - 1] || '').replace(/\D/g, ''),
                sent:     values[sentCol - 1],
            };
        });

        // Telefones que já receberam (em qualquer linha) — não recebem de novo.
        const sentPhones = {};
        leads.forEach(function (lead) {
            if (lead.phone && Object.prototype.toString.call(lead.sent) === '[object Date]') sentPhones[lead.phone] = true;
        });

        let sent = 0;
        for (let i = 0; i < leads.length; i++) {
            const lead = leads[i];
            const decision = whatsAppDecision_(lead, now, startDate, sentPhones);
            if (decision.action === 'skip') continue;

            if (decision.action === 'wait') {
                if (dryRun) Logger.log('[prévia] linha ' + lead.row + ' — aguardando até ' + formatBR_(whatsAppDueTime_(lead.date)));
                continue;
            }

            if (decision.action === 'mark') {
                if (dryRun) Logger.log('[prévia] linha ' + lead.row + ' — seria marcada como "' + decision.mark + '"');
                else sheet.getRange(lead.row, sentCol).setValue(decision.mark);
                continue;
            }

            if (sent >= WHATSAPP.MAX_PER_RUN) {
                Logger.log('Limite de ' + WHATSAPP.MAX_PER_RUN + ' envios por execução atingido; o restante sai na próxima.');
                break;
            }

            if (dryRun) {
                Logger.log('[prévia] linha ' + lead.row + ' — enviaria para +' + lead.phone + ' (' + pickRemarketingLang_(lead.language) + ')');
                sentPhones[lead.phone] = true;
                sent++;
                continue;
            }

            // Link de agendamento do lead. Se ele já marcou a call pelo link do
            // e-mail, não faz sentido convidar de novo.
            lead.token = agendaAssignLeadToken_(sheet, lead.row, found.headerRow);
            if (agendaHasActiveBooking_(lead.token)) {
                sheet.getRange(lead.row, sentCol).setValue(WHATSAPP.BOOKED);
                continue;
            }

            if (sent > 0) Utilities.sleep(4000 + Math.floor(Math.random() * 4000)); // espaça os envios

            const result = sendEvolutionText_(config, lead.phone, buildWhatsAppMessage_(lead));
            if (result === 'sent') {
                sheet.getRange(lead.row, sentCol).setNumberFormat('yyyy-mm-dd hh:mm').setValue(new Date());
                sentPhones[lead.phone] = true;
                sent++;
            } else if (result === 'no_whatsapp') {
                sheet.getRange(lead.row, sentCol).setValue(WHATSAPP.NO_WHATSAPP);
            }
            // 'error': a célula fica vazia e a próxima execução tenta de novo
            // (até o lead passar de MAX_AGE_HOURS).
            SpreadsheetApp.flush();
        }

        if (sent || dryRun) Logger.log((dryRun ? 'Prévia: ' : 'Enviadas: ') + sent + ' mensagem(ns).');
    } finally {
        lock.releaseLock();
    }
}

function findWhatsAppPhoneColumn_(sheet, headerRow) {
    const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(normalizeText_);
    const names   = WHATSAPP.PHONE_HEADERS.map(normalizeText_);
    const idx     = headers.findIndex(function (h) { return names.indexOf(h) !== -1; });
    if (idx === -1) throw new Error('Coluna de telefone não encontrada (esperado: ' + WHATSAPP.PHONE_HEADERS.join(' / ') + ').');
    return idx + 1;
}

function formatBR_(date) {
    return Utilities.formatDate(date, 'America/Sao_Paulo', 'dd/MM HH:mm');
}

// ============================================
// Evolution API
// ============================================

function getEvolutionConfig_() {
    const props = PropertiesService.getScriptProperties();
    const config = {
        url:      String(props.getProperty('EVOLUTION_API_URL') || '').trim().replace(/\/+$/, ''),
        apiKey:   String(props.getProperty('EVOLUTION_API_KEY') || '').trim(),
        instance: String(props.getProperty('EVOLUTION_INSTANCE') || '').trim(),
    };
    const missing = [];
    if (!config.url)      missing.push('EVOLUTION_API_URL');
    if (!config.apiKey)   missing.push('EVOLUTION_API_KEY');
    if (!config.instance) missing.push('EVOLUTION_INSTANCE');
    if (missing.length) throw new Error('Propriedades do script não configuradas: ' + missing.join(', '));
    return config;
}

// Devolve 'sent', 'no_whatsapp' (número não existe no WhatsApp) ou 'error'.
function sendEvolutionText_(config, phoneDigits, text) {
    let response;
    try {
        response = UrlFetchApp.fetch(config.url + '/message/sendText/' + encodeURIComponent(config.instance), {
            method:      'post',
            contentType: 'application/json',
            headers:     { apikey: config.apiKey },
            payload: JSON.stringify({
                number:      phoneDigits,
                text:        text,
                delay:       WHATSAPP.TYPING_MS,
                linkPreview: false,
            }),
            muteHttpExceptions: true,
        });
    } catch (error) {
        Logger.log('Falha ao chamar a Evolution API para +' + phoneDigits + ': ' + error);
        return 'error';
    }

    const code = response.getResponseCode();
    const body = response.getContentText();
    if (code >= 200 && code < 300) {
        Logger.log('WhatsApp enviado para +' + phoneDigits);
        return 'sent';
    }
    if (code === 400 && /"exists"\s*:\s*false/.test(body)) {
        Logger.log('+' + phoneDigits + ' não tem WhatsApp.');
        return 'no_whatsapp';
    }
    Logger.log('Evolution API recusou o envio para +' + phoneDigits + ': ' + code + ' ' + body.slice(0, 300));
    return 'error';
}

// ============================================
// Teste: manda a mensagem (PT) para WHATSAPP_TEST_NUMBER, sem tocar na planilha
// ============================================

function sendWhatsAppTest() {
    const number = String(PropertiesService.getScriptProperties().getProperty('WHATSAPP_TEST_NUMBER') || '').replace(/\D/g, '');
    if (!number) throw new Error('Defina WHATSAPP_TEST_NUMBER nas Propriedades do script (com DDI, ex.: 5511999998888).');
    const result = sendEvolutionText_(getEvolutionConfig_(), number, buildWhatsAppMessage_({ name: 'Teste', language: 'Portuguese' }));
    Logger.log('Resultado do teste: ' + result);
}
