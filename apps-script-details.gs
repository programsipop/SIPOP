// ============================================
// SIPOP — Apps Script: separar a coluna "Details"
//
// A landing page /pt/publicar manda um resumo em várias linhas que
// cai numa célula só ("Details"): nota do lead, fase, prazo, UTMs,
// fbclid, URL completa da página etc. Isso deixa cada linha da
// planilha enorme.
//
// Este script lê esse texto e distribui cada item numa coluna
// própria, criada no FIM da planilha. Ele não insere nem move
// colunas no meio porque o doPost grava por posição (appendRow).
// Inserir uma coluna no meio deslocaria todos os leads novos.
//
// Encontra a aba e as colunas pelo NOME do cabeçalho, então funciona
// mesmo que o layout da planilha mude. Pode rodar quantas vezes
// quiser: só preenche as linhas que ainda não foram separadas.
//
// COMO USAR:
// 1. Na planilha: Extensões > Apps Script
// 2. No painel esquerdo: "+" > Script > nomeie "details"
// 3. Cole este arquivo inteiro e salve (Ctrl+S)
// 4. No seletor de função (topo), escolha splitDetails > Executar
//    (autorize quando pedir). Isso separa todos os leads antigos.
// 5. Escolha installSplitTrigger > Executar. A partir daí, os leads
//    novos são separados automaticamente a cada 5 minutos.
// Não precisa reimplantar o Web App: o doPost não muda.
// ============================================

const DETAILS_HEADER = 'Details';
// Nomes aceitos para a coluna de Details (na planilha ela foi renomeada para "Nota").
const DETAILS_HEADERS = ['Details', 'Nota'];

// Ordem das colunas novas (da esquerda pra direita, no fim da planilha).
// key = rótulo usado no texto de Details; header = nome da coluna nova.
const DETAIL_COLUMNS = [
    { header: 'Nota do lead',   width: 90  },
    { header: 'Qualificado',    width: 95  },
    { header: 'Fase',           width: 200, key: 'Fase' },
    { header: 'Tipo de estudo', width: 230, key: 'Tipo de estudo' },
    { header: 'Prazo',          width: 120, key: 'Prazo' },
    { header: 'Instagram',      width: 150, key: 'Instagram' },
    { header: 'Detalhes',       width: 320, key: 'Detalhes' },
    { header: 'utm_term',       width: 170, key: 'utm_term' },
    { header: 'Página',         width: 260, key: 'Página' },
    { header: 'gclid',          width: 120, key: 'gclid' },
    { header: 'fbclid',         width: 120, key: 'fbclid' },
    { header: 'event_id',       width: 120, key: 'event_id' },
];

// Todos os rótulos que podem começar uma linha do texto de Details
const KNOWN_KEYS = ['Nota do lead'].concat(
    DETAIL_COLUMNS.filter(function (c) { return c.key; }).map(function (c) { return c.key; })
);

// Lê "Chave: valor" linha a linha. Uma linha que não começa com um rótulo
// conhecido continua o valor anterior (ex.: "Detalhes" com quebra de linha).
function parseDetails_(text) {
    const result = {};
    let current = null;

    String(text).split(/\r?\n/).forEach(function (line) {
        const key = KNOWN_KEYS.find(function (k) { return line.indexOf(k + ':') === 0; });
        if (key) {
            current = key;
            result[key] = line.slice(key.length + 1).trim();
        } else if (current) {
            result[current] += '\n' + line;
        }
    });

    Object.keys(result).forEach(function (k) {
        const value = result[k].trim();
        result[k] = value === '—' ? '' : value;
    });
    return result;
}

function rowValues_(details) {
    const parsed = parseDetails_(details);
    const values = {};

    // "7 (qualificado: sim)" vira 7 e "sim"
    const nota = (parsed['Nota do lead'] || '').match(/^(-?\d+)\s*(?:\(qualificado:\s*(\S+?)\))?/);
    values['Nota do lead'] = nota ? Number(nota[1]) : '';
    values['Qualificado']  = nota && nota[2] ? nota[2] : '';

    DETAIL_COLUMNS.forEach(function (c) {
        if (c.key) values[c.header] = parsed[c.key] || '';
    });

    // Os UTMs já têm colunas próprias: fica só o endereço da página
    values['Página'] = values['Página'].split(/[?#]/)[0];

    return values;
}

// Acha a aba e a linha de cabeçalho da coluna do resumo ("Details"/"Nota").
// Se ela tiver outro nome, acha pela coluna que contém "Nota do lead:".
function findDetailsSheet_() {
    const sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
    for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i];
        const lastCol = sheet.getLastColumn();
        if (!lastCol) continue;
        const rows = Math.min(5, sheet.getLastRow());
        if (!rows) continue;
        const top = sheet.getRange(1, 1, rows, lastCol).getDisplayValues();
        for (let r = 0; r < top.length; r++) {
            const col = top[r].map(function (h) { return h.trim(); }).findIndex(function (h) { return DETAILS_HEADERS.indexOf(h) !== -1; });
            if (col !== -1) return { sheet: sheet, headerRow: r + 1, detailsCol: col + 1 };
        }
    }

    // Plano B: a coluna foi renomeada de novo. Procura, na aba que tem
    // cabeçalho "Email", a coluna cujas células têm o texto "Nota do lead:".
    for (let i = 0; i < sheets.length; i++) {
        const sheet = sheets[i];
        const lastCol = sheet.getLastColumn();
        const lastRow = sheet.getLastRow();
        if (!lastCol || lastRow < 2) continue;
        const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
        const headerRow = values.slice(0, 5).findIndex(function (row) {
            return row.some(function (h) { return /^e-?mail$/i.test(h.trim()); });
        });
        if (headerRow === -1) continue;
        for (let c = 0; c < lastCol; c++) {
            const hit = values.slice(headerRow + 1).some(function (row) { return row[c].indexOf('Nota do lead:') === 0; });
            if (hit) return { sheet: sheet, headerRow: headerRow + 1, detailsCol: c + 1 };
        }
    }

    throw new Error('Nenhuma aba tem uma coluna "' + DETAILS_HEADERS.join('" ou "') + '" nas 5 primeiras linhas.');
}

// Garante que cada coluna nova exista, criando as que faltam no fim.
// Devolve { header: número da coluna }.
function ensureColumns_(sheet, headerRow, detailsCol) {
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(headerRow, 1, 1, lastCol).getDisplayValues()[0]
        .map(function (h) { return h.trim(); });

    const map = {};
    let next = lastCol + 1;
    const headerStyle = sheet.getRange(headerRow, detailsCol);

    DETAIL_COLUMNS.forEach(function (c) {
        const existing = headers.indexOf(c.header);
        if (existing !== -1) {
            map[c.header] = existing + 1;
            return;
        }
        if (next > sheet.getMaxColumns()) sheet.insertColumnAfter(sheet.getMaxColumns());
        const cell = sheet.getRange(headerRow, next);
        headerStyle.copyFormatToRange(sheet, next, next, headerRow, headerRow);
        cell.setValue(c.header);
        sheet.setColumnWidth(next, c.width);

        // Texto puro: impede que utm_term (18 dígitos) vire 1,2E+17
        const body = sheet.getRange(headerRow + 1, next, sheet.getMaxRows() - headerRow, 1);
        body.setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
        if (c.header !== 'Nota do lead') body.setNumberFormat('@');

        map[c.header] = next;
        next++;
    });
    return map;
}

function splitDetails() {
    const found = findDetailsSheet_();
    const sheet = found.sheet;
    const firstRow = found.headerRow + 1;
    const lastRow = sheet.getLastRow();
    if (lastRow < firstRow) return;

    const map = ensureColumns_(sheet, found.headerRow, found.detailsCol);
    const numRows = lastRow - firstRow + 1;

    const details = sheet.getRange(firstRow, found.detailsCol, numRows, 1).getValues();

    // Lê cada coluna nova inteira, preenche só as linhas ainda vazias
    // e grava de volta coluna por coluna (poucas chamadas à planilha)
    const columns = {};
    DETAIL_COLUMNS.forEach(function (c) {
        columns[c.header] = sheet.getRange(firstRow, map[c.header], numRows, 1).getValues();
    });

    let changed = 0;
    for (let i = 0; i < numRows; i++) {
        const text = String(details[i][0] || '');
        if (text.indexOf('Nota do lead:') === -1) continue;   // lead do site principal: não tem resumo
        if (columns['event_id'][i][0] !== '' || columns['Nota do lead'][i][0] !== '') continue; // já separado

        const values = rowValues_(text);
        DETAIL_COLUMNS.forEach(function (c) { columns[c.header][i][0] = values[c.header]; });
        changed++;
    }

    if (!changed) return;

    DETAIL_COLUMNS.forEach(function (c) {
        sheet.getRange(firstRow, map[c.header], numRows, 1).setValues(columns[c.header]);
    });

    // A célula de Details continua com o texto original (backup), mas sem
    // quebrar linha, e as linhas voltam à altura normal
    sheet.getRange(firstRow, found.detailsCol, numRows, 1)
        .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    sheet.setRowHeightsForced(firstRow, numRows, 21);

    Logger.log(changed + ' linha(s) separada(s).');
}

// Roda splitDetails a cada 5 minutos (para os leads novos).
// Executar uma vez só; rodar de novo não duplica o gatilho.
function installSplitTrigger() {
    const exists = ScriptApp.getProjectTriggers().some(function (t) {
        return t.getHandlerFunction() === 'splitDetails';
    });
    if (!exists) {
        ScriptApp.newTrigger('splitDetails').timeBased().everyMinutes(5).create();
    }
    Logger.log(exists ? 'Gatilho já existia.' : 'Gatilho criado: splitDetails a cada 5 minutos.');
}

// Teste rápido do parser: rode e veja o resultado em "Execuções"
function testParseDetails() {
    const sample = [
        'Nota do lead: 7 (qualificado: sim)',
        'Instagram: —',
        'Fase: Só a ideia',
        'Tipo de estudo: Revisão sistemática ou meta-análise',
        'Prazo: Até 3 meses',
        'Detalhes: linha 1',
        'linha 2',
        'utm_term: 120250024531820470',
        'gclid: —',
        'fbclid: PAZXh0bg',
        'Página: https://sipopscience.com/pt/publicar/?fbclid=PAZ&utm_source=ig',
        'event_id: 6c3cd34a-8f87-4e70-b2d1-58f96bc93ed6',
    ].join('\n');
    Logger.log(JSON.stringify(rowValues_(sample), null, 2));
}
