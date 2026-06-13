// ============================================
// SIPOP — Google Apps Script
// Recebe submissões do formulário de contato
// e salva numa Google Sheet
//
// COMO USAR:
// 1. Abra Google Sheets > Extensões > Apps Script
// 2. Cole este código, substituindo o existente
// 3. Salve (Ctrl+S)
// 4. Clique em "Implantar" > "Nova implantação"
// 5. Tipo: Web App
//    Executar como: Eu (sua conta)
//    Quem tem acesso: Qualquer pessoa
// 6. Autorize o app quando solicitado
// 7. Copie a URL gerada e cole em script.js (APPS_SCRIPT_URL)
// ============================================

const SHEET_NAME = 'SIPOP Contacts';

function doPost(e) {
    try {
        const ss    = SpreadsheetApp.getActiveSpreadsheet();
        let   sheet = ss.getSheetByName(SHEET_NAME);

        // Cria a aba se não existir, com cabeçalhos
        if (!sheet) {
            sheet = ss.insertSheet(SHEET_NAME);
            sheet.appendRow([
                'Timestamp',
                'Name',
                'Email',
                'Phone',
                'Specialty',
                'Objective'
            ]);

            // Formata cabeçalho
            const headerRange = sheet.getRange(1, 1, 1, 6);
            headerRange.setFontWeight('bold');
            headerRange.setBackground('#2C7A7B');
            headerRange.setFontColor('#FFFFFF');
        }

        // Parse dos dados recebidos
        const data = JSON.parse(e.postData.contents);

        // Adiciona linha
        sheet.appendRow([
            data.timestamp || new Date().toISOString(),
            data.name      || '',
            data.email     || '',
            data.phone     || '',
            data.specialty || '',
            data.objective || ''
        ]);

        // Notificação por e-mail (opcional — descomente para ativar)
        MailApp.sendEmail({
             to:      'contact@sipopscience.com',
             subject: 'New SIPOP Contact: ' + (data.name || 'Unknown'),
             body:    'Name: '      + data.name      + '\n' +
                      'Email: '     + data.email     + '\n' +
                      'Phone: '     + data.phone     + '\n' +
                      'Specialty: ' + data.specialty + '\n' +
                      'Objective: ' + data.objective
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

// Função de teste — rode manualmente para verificar
function testPost() {
    const mockEvent = {
        postData: {
            contents: JSON.stringify({
                name:      'Test User',
                email:     'test@example.com',
                phone:     '+55 11 99999-9999',
                specialty: 'Clinical Research',
                objective: 'Testing the form submission',
                timestamp: new Date().toISOString()
            })
        }
    };
    const result = doPost(mockEvent);
    Logger.log(result.getContent());
}
