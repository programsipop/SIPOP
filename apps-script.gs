// ============================================
// SIPOP — Google Apps Script
// Recebe submissões do formulário de contato
// (site principal e landing page)
// e salva numa Google Sheet com identificação
// de origem + notificação por e-mail
//
// LAYOUT DE COLUNAS (A-S):
// A Date | B Time | C Source | D Name | E Email | F Phone |
// G Nationality | H Preferred Language | I Specialty |
// J Career Stage | K Objective Type | L Objective |
// M utm_source | N utm_medium | O utm_campaign | P utm_content |
// Q Status (manual) | R Objeção (manual) | S Observações (manual)
//
// O doPost grava cada campo pela coluna com o NOME do cabeçalho
// (LEAD_FIELDS), não pela posição: dá para inserir/mover colunas
// (ex.: "Instagram") sem deslocar os leads novos. As colunas manuais
// (Status, Objeção, Observações) nunca são tocadas.
// Para conferir o mapeamento: rode checkLeadColumns() pelo editor.
//
// A sequência de remarketing (remarketing.gs) cria no fim da planilha
// as colunas "Remarketing (etapa)" e "Remarketing (último envio)".
// O agendamento de calls (agenda.gs) cria "Agendamento (token)" e
// "Call agendada", e usa este doPost como porta de entrada ("agenda.*").
//
// COMO USAR:
// 1. Abra Google Sheets > Extensões > Apps Script
// 2. Cole este código, substituindo o existente
// 3. Salve (Ctrl+S)
// 4. Clique em "Implantar" > "Gerenciar implantações"
//    > editar (ícone de lápis) a implantação ativa
//    > Versão: "Nova versão" > Implantar
//    (só use "Nova implantação" se realmente quiser
//    gerar uma URL nova — não é o caso normalmente)
// 5. Tipo: Web App
//    Executar como: Eu (sua conta)
//    Quem tem acesso: Qualquer pessoa
// 6. Autorize o app quando solicitado
// 7. A URL permanece a mesma — não precisa atualizar o script.js
// ============================================

const SHEET_NAME = 'SIPOP Contacts';

// Destinatários das notificações por e-mail
const EMAIL_RECIPIENTS = [
    'program.sipop@gmail.com',
    'gaspar.chiappa@gmail.com',
    'victor-g@outlook.com.br'
];

// O timestamp já vem em UTC (ISO). Não precisa converter aqui, pois
// a planilha já está configurada com fuso de Brasília e faz essa
// conversão sozinha na hora de exibir.
function toBRDateTime(timestampInput) {
    return timestampInput ? new Date(timestampInput) : new Date();
}

// Reformata telefone BR pro padrão +55 (DDD) 9 XXXX-XXXX (celular)
// ou +55 (DDD) XXXX-XXXX (fixo). Se não conseguir reconhecer o formato,
// devolve só com o "+" na frente, sem quebrar o fluxo.
function formatPhoneBR(value) {
    if (!value) return '';

    const digits = String(value).replace(/\D/g, ''); // remove tudo que não for número
    let rest = digits;

    // número com código de outro país (ex.: "+1 5551234567") — não é BR,
    // mesmo que tenha 10 ou 11 dígitos. Sem isso ele virava "+55 (15) ..."
    // e o WhatsApp automático iria para um número brasileiro errado.
    if (String(value).trim().charAt(0) === '+' && !digits.startsWith('55')) {
        return '+' + digits;
    }

    // se já vem com "55" na frente (código do país) e tamanho compatível, remove
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
        rest = digits.slice(2);
    }

    // formato inesperado (não é 10 nem 11 dígitos de DDD+número) — devolve só com o +
    if (rest.length !== 10 && rest.length !== 11) {
        return '+' + digits;
    }

    const ddd = rest.slice(0, 2);
    const isMobile = rest.length === 11;

    if (isMobile) {
        const nine   = rest.slice(2, 3);
        const middle = rest.slice(3, 7);
        const last   = rest.slice(7);
        return '+55 (' + ddd + ') ' + nine + ' ' + middle + '-' + last;
    } else {
        const middle = rest.slice(2, 6);
        const last   = rest.slice(6);
        return '+55 (' + ddd + ') ' + middle + '-' + last;
    }
}

// Escreve valores como fórmula que retorna string, evitando que o Sheets
// tente interpretar "+55 (11) 9 9999-9999" como fórmula/número inválido
function asTextFormula(value) {
    if (!value) return '';
    const escaped = String(value).replace(/"/g, '""'); // escapa aspas internas, por segurança
    return '="' + escaped + '"';
}

// Campos do lead -> nomes aceitos para o cabeçalho da coluna (sem diferenciar
// maiúsculas/acentos). O primeiro nome é o usado se a coluna precisar ser criada.
const LEAD_FIELDS = {
    date:          ['Date', 'Data'],
    time:          ['Time', 'Hora', 'Horário'],
    source:        ['Source', 'Origem'],
    name:          ['Name', 'Nome'],
    email:         ['Email', 'E-mail'],
    phone:         ['Phone', 'Telefone', 'WhatsApp'],
    instagram:     ['Instagram'],
    nationality:   ['Nationality', 'Nacionalidade'],
    language:      ['Preferred Language', 'Idioma preferido', 'Idioma'],
    specialty:     ['Specialty', 'Especialidade', 'Área'],
    careerStage:   ['Career Stage', 'Fase da carreira', 'Estágio'],
    objectiveType: ['Objective Type', 'Main Objective', 'Objetivo principal'],
    objective:     ['Objective', 'Details', 'Nota', 'Message', 'Mensagem', 'Objetivo'],
    utm_source:    ['UTM Source', 'utm_source'],
    utm_medium:    ['UTM Medium', 'utm_medium'],
    utm_campaign:  ['UTM Campaign', 'utm_campaign'],
    utm_content:   ['UTM Content', 'utm_content'],
};

function leadNorm_(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

// Linha de cabeçalho: a primeira (das 5 do topo) que tem uma coluna "Email".
function findLeadHeaderRow_(sheet) {
    const lastCol = sheet.getLastColumn();
    const rows    = Math.min(5, sheet.getLastRow());
    if (!lastCol || !rows) return { row: 1, headers: [] };
    const top    = sheet.getRange(1, 1, rows, lastCol).getDisplayValues();
    const emails = LEAD_FIELDS.email.map(leadNorm_);
    for (let r = 0; r < top.length; r++) {
        const headers = top[r].map(leadNorm_);
        if (headers.some(function (h) { return emails.indexOf(h) !== -1; })) return { row: r + 1, headers: headers };
    }
    return { row: 1, headers: top[0].map(leadNorm_) };
}

// { campo: número da coluna }. Campo sem coluna na planilha: se tiver valor,
// ganha uma coluna nova no FIM (nunca no meio); se estiver vazio, é ignorado.
function resolveLeadColumns_(sheet, values) {
    const header = findLeadHeaderRow_(sheet);
    const cols   = {};
    Object.keys(LEAD_FIELDS).forEach(function (key) {
        const names = LEAD_FIELDS[key].map(leadNorm_);
        const idx   = header.headers.findIndex(function (h) { return names.indexOf(h) !== -1; });
        if (idx !== -1) { cols[key] = idx + 1; return; }
        if (!values || values[key] === '' || values[key] == null) return;

        const col = sheet.getLastColumn() + 1;
        if (col > sheet.getMaxColumns()) sheet.insertColumnAfter(sheet.getMaxColumns());
        sheet.getRange(header.row, col).setValue(LEAD_FIELDS[key][0]);
        header.headers[col - 1] = leadNorm_(LEAD_FIELDS[key][0]);
        cols[key] = col;
        Logger.log('doPost: coluna "' + LEAD_FIELDS[key][0] + '" não existia e foi criada no fim (col ' + col + ').');
    });
    return cols;
}

// Rode pelo editor: mostra no log em qual coluna cada campo vai ser gravado.
function checkLeadColumns() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const header = findLeadHeaderRow_(sheet);
    const raw = sheet.getRange(header.row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    Logger.log('Cabeçalho na linha ' + header.row);
    Object.keys(LEAD_FIELDS).forEach(function (key) {
        const names = LEAD_FIELDS[key].map(leadNorm_);
        const idx   = header.headers.findIndex(function (h) { return names.indexOf(h) !== -1; });
        Logger.log(key + ' -> ' + (idx === -1
            ? 'NÃO ENCONTRADA (seria criada no fim se vier preenchida)'
            : 'coluna ' + sheet.getRange(header.row, idx + 1).getA1Notation().replace(/\d+/, '') + ' "' + raw[idx] + '"'));
    });
}

function doPost(e) {
    try {
        // Parse dos dados recebidos
        const data = JSON.parse(e.postData.contents);

        // Agendamento de calls (agenda.gs): o site manda { action: 'agenda.*', ... }
        if (data.action && String(data.action).indexOf('agenda.') === 0) {
            return agendaHandleRequest_(data);
        }

        const ss    = SpreadsheetApp.getActiveSpreadsheet();
        let   sheet = ss.getSheetByName(SHEET_NAME);

        // Cria a aba se não existir, com cabeçalhos
        if (!sheet) {
            sheet = ss.insertSheet(SHEET_NAME);
            sheet.appendRow([
                'Date',
                'Time',
                'Source',
                'Name',
                'Email',
                'Phone',
                'Nationality',
                'Preferred Language',
                'Specialty',
                'Career Stage',
                'Objective Type',
                'Objective',
                'UTM Source',
                'UTM Medium',
                'UTM Campaign',
                'UTM Content'
            ]);

            // Formata cabeçalho
            const headerRange = sheet.getRange(1, 1, 1, 16);
            headerRange.setFontWeight('bold');
            headerRange.setBackground('#2C7A7B');
            headerRange.setFontColor('#FFFFFF');
            sheet.setColumnWidth(1, 100);  // Date
            sheet.setColumnWidth(2, 90);   // Time
            sheet.setColumnWidth(3, 200);  // Source
            sheet.setColumnWidth(10, 220); // Career Stage
            sheet.setColumnWidth(11, 220); // Objective Type
            sheet.setColumnWidth(12, 400); // Objective
            sheet.setColumnWidth(15, 130); // UTM Campaign
        }

        // Identifica a origem — fallback para 'Main Website' se não enviado
        const source = data.source || 'Main Website';

        // Formata o telefone antes de gravar (ex.: "+55 (31) 9 9990-2411")
        const phoneFormatted = formatPhoneBR(data.phone);

        // Data/hora em horário de Brasília — mesmo valor real usado nas
        // duas colunas, o formato de cada célula decide o que aparece
        const brDateTime = toBRDateTime(data.timestamp);

        // Grava cada campo na coluna pelo NOME do cabeçalho (LEAD_FIELDS),
        // não pela posição. Assim inserir/mover colunas na planilha não
        // desloca mais os leads novos.
        const values = {
            date:          brDateTime,
            time:          brDateTime,
            source:        source,
            name:          data.name              || '',
            email:         data.email             || '',
            phone:         asTextFormula(phoneFormatted),
            instagram:     data.instagram         || '',
            nationality:   data.nationality       || '',
            language:      data.preferredLanguage || '',
            specialty:     data.specialty         || '',
            careerStage:   data.careerStage       || '',
            objectiveType: data.objectiveType     || '',
            objective:     data.objective         || '',
            utm_source:    data.utm_source        || '',
            utm_medium:    data.utm_medium        || '',
            utm_campaign:  data.utm_campaign      || '',
            utm_content:   data.utm_content       || ''
        };
        const leadCols = resolveLeadColumns_(sheet, values);
        const width    = Math.max(sheet.getLastColumn(), Math.max.apply(null, Object.keys(leadCols).map(function (k) { return leadCols[k]; })));
        const row      = new Array(width).fill('');
        Object.keys(leadCols).forEach(function (key) { row[leadCols[key] - 1] = values[key]; });
        sheet.appendRow(row);

        // Formata as células recém-criadas de Date e Time
        const lastRow = sheet.getLastRow();
        sheet.getRange(lastRow, leadCols.date).setNumberFormat('yyyy-mm-dd');
        sheet.getRange(lastRow, leadCols.time).setNumberFormat('hh:mm:ss');

        // Destaca visualmente leads da Landing Page (linha inteira)
        if (source.includes('Landing Page')) {
            sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).setBackground('#EBF8FF'); // azul claro
        }

        // Token do link de agendamento (agenda.gs). Volta na resposta para a
        // Netlify Function colocar o link no e-mail de primeiro contato.
        // Falha aqui nunca derruba o formulário.
        let agendaToken = '';
        try {
            agendaToken = agendaAssignLeadToken_(sheet, lastRow);
        } catch (tokenError) {
            Logger.log('doPost: não consegui gerar o token de agendamento: ' + tokenError);
        }

        // Separa na hora o resumo da LP em colunas (details.gs), sem esperar
        // o gatilho de 5 minutos. Falha aqui nunca derruba o formulário.
        try {
            splitDetails();
        } catch (splitError) {
            Logger.log('doPost: não consegui separar o resumo: ' + splitError);
        }

        // Notificação por e-mail para todos os destinatários
        const subject  = '[SIPOP] New contact — ' + source + ': ' + (data.name || 'Unknown');
        const utmLine  = data.utm_campaign
            ? '\nCampaign:  ' + data.utm_campaign + ' (' + (data.utm_source || '—') + ' / ' + (data.utm_content || '—') + ')\n'
            : '';
        const body    =
            'A new contact form was submitted on SIPOP.\n\n' +
            '─────────────────────────────\n' +
            'Source:      ' + source           + '\n' +
            'Name:        ' + (data.name              || '—') + '\n' +
            'Email:       ' + (data.email             || '—') + '\n' +
            'Phone:       ' + (phoneFormatted         || '—') + '\n' +
            'Nationality: ' + (data.nationality       || '—') + '\n' +
            'Language:    ' + (data.preferredLanguage || '—') + '\n' +
            'Specialty:   ' + (data.specialty         || '—') + '\n' +
            'Stage:       ' + (data.careerStage       || '—') + '\n' +
            'Objective:   ' + (data.objectiveType     || '—') + '\n' +
            utmLine +
            '─────────────────────────────\n' +
            'Message:\n' + (data.objective  || '—') + '\n\n' +
            'Timestamp: ' + (data.timestamp || new Date().toISOString());

        EMAIL_RECIPIENTS.forEach(function(recipient) {
            MailApp.sendEmail({
                to:      recipient,
                subject: subject,
                body:    body
            });
        });

        return ContentService
            .createTextOutput(JSON.stringify({ status: 'success', agendaToken: agendaToken }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

// ============================================
// Função de teste — rode manualmente
// ============================================
function testPost() {
    const mockEvent = {
        postData: {
            contents: JSON.stringify({
                source:             'Landing Page — Technical Review',
                name:               'Test User',
                email:              'test@example.com',
                phone:              '+55 31 999902411',
                nationality:        'Brazilian',
                preferredLanguage:  'Portuguese',
                specialty:          'Clinical Research',
                careerStage:        'faculty_progressing',
                objectiveType:      'q1',
                objective:          'Testing form submission from the Technical Review landing page.',
                utm_source:         'instagram',
                utm_medium:         'paid_social',
                utm_campaign:       'technical_review',
                utm_content:        'ad1_rejection',
                timestamp:          new Date().toISOString()
            })
        }
    };
    const result = doPost(mockEvent);
    Logger.log(result.getContent());
}

function testPostMainSite() {
    const mockEvent = {
        postData: {
            contents: JSON.stringify({
                name:               'Test User 2',
                email:              'test2@example.com',
                phone:              '',
                nationality:        'American',
                preferredLanguage:  'English',
                specialty:          'Epidemiology',
                careerStage:        'postgrad',
                objectiveType:      'career',
                objective:          'Testing form submission from the main website.',
                timestamp:          new Date().toISOString()
            })
        }
    };
    const result = doPost(mockEvent);
    Logger.log(result.getContent());
}