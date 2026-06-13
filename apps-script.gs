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
                'Specialty',
                'Objective'
            ]);

            // Formata cabeçalho
            const headerRange = sheet.getRange(1, 1, 1, 7);
            headerRange.setFontWeight('bold');
            headerRange.setBackground('#2C7A7B');
            headerRange.setFontColor('#FFFFFF');
            sheet.setColumnWidth(1, 180); // Timestamp
            sheet.setColumnWidth(2, 200); // Source
            sheet.setColumnWidth(7, 400); // Objective
        }

        // Parse dos dados recebidos
        const data = JSON.parse(e.postData.contents);

        // Identifica a origem — fallback para 'Main Website' se não enviado
        const source = data.source || 'Main Website';

        // Adiciona linha
        sheet.appendRow([
            data.timestamp || new Date().toISOString(),
            source,
            data.name      || '',
            data.email     || '',
            data.phone     || '',
            data.specialty || '',
            data.objective || ''
        ]);

        // Destaca visualmente leads da Landing Page
        if (source.includes('Landing Page')) {
            const lastRow   = sheet.getLastRow();
            const rowRange  = sheet.getRange(lastRow, 1, 1, 7);
            rowRange.setBackground('#EBF8FF'); // azul claro
        }

        // Notificação por e-mail para todos os destinatários
        const subject = '[SIPOP] New contact — ' + source + ': ' + (data.name || 'Unknown');
        const body    =
            'A new contact form was submitted on SIPOP.\n\n' +
            '─────────────────────────────\n' +
            'Source:    ' + source           + '\n' +
            'Name:      ' + (data.name      || '—') + '\n' +
            'Email:     ' + (data.email     || '—') + '\n' +
            'Phone:     ' + (data.phone     || '—') + '\n' +
            'Specialty: ' + (data.specialty || '—') + '\n' +
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
                source:    'Landing Page — Technical Review',
                name:      'Test User',
                email:     'test@example.com',
                phone:     '+55 11 99999-9999',
                specialty: 'Clinical Research',
                objective: 'Testing form submission from the Technical Review landing page.',
                timestamp: new Date().toISOString()
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
                name:      'Test User 2',
                email:     'test2@example.com',
                phone:     '',
                specialty: 'Epidemiology',
                objective: 'Testing form submission from the main website.',
                timestamp: new Date().toISOString()
            })
        }
    };
    const result = doPost(mockEvent);
    Logger.log(result.getContent());
}
