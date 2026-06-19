// ============================================
// SIPOP — Google Apps Script
// Recebe submissões do formulário de contato
// (site principal e landing page)
// e salva numa Google Sheet com identificação
// de origem + notificação por e-mail
//
// COMO USAR:
// 1. Abra Google Sheets > Extensões > Apps Script
// 2. Cole este código, substituindo o existente
// 3. Salve (Ctrl+S)
// 4. Clique em "Implantar" > "Nova implantação"
//    (ou "Gerenciar implantações" > editar versão existente)
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

function doPost(e) {
    try {
        const ss    = SpreadsheetApp.getActiveSpreadsheet();
        let   sheet = ss.getSheetByName(SHEET_NAME);

        // Cria a aba se não existir, com cabeçalhos
        if (!sheet) {
            sheet = ss.insertSheet(SHEET_NAME);
            sheet.appendRow([
                'Timestamp',
                'Source',
                'Name',
                'Email',
                'Phone',
                'Nationality',
                'Preferred Language',
                'Specialty',
                'Objective',
                'UTM Source',
                'UTM Medium',
                'UTM Campaign',
                'UTM Content'
            ]);

            // Formata cabeçalho
            const headerRange = sheet.getRange(1, 1, 1, 13);
            headerRange.setFontWeight('bold');
            headerRange.setBackground('#2C7A7B');
            headerRange.setFontColor('#FFFFFF');
            sheet.setColumnWidth(1, 180); // Timestamp
            sheet.setColumnWidth(2, 200); // Source
            sheet.setColumnWidth(9, 400); // Objective
            sheet.setColumnWidth(12, 130); // UTM Campaign
        }

        // Parse dos dados recebidos
        const data = JSON.parse(e.postData.contents);

        // Identifica a origem — fallback para 'Main Website' se não enviado
        const source = data.source || 'Main Website';

        // Adiciona linha
        sheet.appendRow([
            data.timestamp          || new Date().toISOString(),
            source,
            data.name               || '',
            data.email              || '',
            data.phone              || '',
            data.nationality        || '',
            data.preferredLanguage  || '',
            data.specialty          || '',
            data.objective          || '',
            data.utm_source         || '',
            data.utm_medium         || '',
            data.utm_campaign       || '',
            data.utm_content        || ''
        ]);

        // Destaca visualmente leads da Landing Page
        if (source.includes('Landing Page')) {
            const lastRow   = sheet.getLastRow();
            const rowRange  = sheet.getRange(lastRow, 1, 1, 13);
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
            'Phone:       ' + (data.phone             || '—') + '\n' +
            'Nationality: ' + (data.nationality       || '—') + '\n' +
            'Language:    ' + (data.preferredLanguage || '—') + '\n' +
            'Specialty:   ' + (data.specialty         || '—') + '\n' +
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
                phone:              '+55 11 99999-9999',
                nationality:        'Brazilian',
                preferredLanguage:  'Portuguese',
                specialty:          'Clinical Research',
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
                objective:          'Testing form submission from the main website.',
                timestamp:          new Date().toISOString()
            })
        }
    };
    const result = doPost(mockEvent);
    Logger.log(result.getContent());
}
