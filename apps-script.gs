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
// O script SEMPRE escreve só A-P (16 colunas). Q-S nunca são
// tocadas por aqui — são preenchidas manualmente.
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

function doPost(e) {
    try {
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

        // Parse dos dados recebidos
        const data = JSON.parse(e.postData.contents);

        // Identifica a origem — fallback para 'Main Website' se não enviado
        const source = data.source || 'Main Website';

        // Formata o telefone antes de gravar (ex.: "+55 (31) 9 9990-2411")
        const phoneFormatted = formatPhoneBR(data.phone);

        // Data/hora em horário de Brasília — mesmo valor real usado nas
        // duas colunas, o formato de cada célula decide o que aparece
        const brDateTime = toBRDateTime(data.timestamp);

        // Adiciona linha (A-P — Q, R, S nunca são tocadas aqui)
        sheet.appendRow([
            brDateTime,                    // A — Date
            brDateTime,                    // B — Time
            source,                        // C
            data.name             || '',   // D
            data.email             || '',  // E
            asTextFormula(phoneFormatted), // F
            data.nationality        || '', // G
            data.preferredLanguage   || '',// H
            data.specialty            || '',// I
            data.careerStage           || '',// J
            data.objectiveType          || '',// K
            data.objective                || '',// L
            data.utm_source                 || '',// M
            data.utm_medium                   || '',// N
            data.utm_campaign                   || '',// O
            data.utm_content                     || '' // P
        ]);

        // Formata as células recém-criadas de Date e Time
        const lastRow = sheet.getLastRow();
        sheet.getRange(lastRow, 1).setNumberFormat('yyyy-mm-dd');
        sheet.getRange(lastRow, 2).setNumberFormat('hh:mm:ss');

        // Destaca visualmente leads da Landing Page
          if (source.includes('Landing Page')) {
              const rowRange = sheet.getRange(lastRow, 1, 1, 19); // A até S — inclui Status/Objeção/Observações
              rowRange.setBackground('#EBF8FF'); // azul claro
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
            .createTextOutput(JSON.stringify({ status: 'success' }))
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