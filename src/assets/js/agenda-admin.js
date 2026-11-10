// ============================================
// SIPOP — agenda-admin.js
// Painel do pesquisador (/agenda-admin): marca os blocos de 30 min livres,
// escolhe quantos dias aparecem para o lead e acompanha as calls marcadas.
//
// Tudo em horário de Brasília. A senha (AGENDA_ADMIN_KEY) é conferida pelo
// Apps Script a cada chamada; aqui ela só fica guardada neste navegador.
// ============================================

(function () {
    'use strict';

    var API       = '/.netlify/functions/agenda';
    var KEY_STORE = 'sipop-agenda-key';
    var TZ        = 'America/Sao_Paulo';
    var BLOCK     = 30;
    var DAY_START = 7 * 60;    // primeira linha da grade: 07:00
    var DAY_END   = 22 * 60;   // última linha termina às 22:00
    var WEEKDAYS  = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

    var root = document.getElementById('adm');
    if (!root) return;

    var key   = '';
    var state = { today: '', config: {}, availability: {}, bookings: [], dirty: false };
    var paint = null;   // true/false enquanto arrasta marcando/desmarcando

    function $(id) { return document.getElementById(id); }
    function show(view) { root.setAttribute('data-view', view); }

    function api(action, body) {
        return fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ action: action, key: key }, body || {})),
        }).then(function (response) { return response.json(); });
    }

    // ---------- datas (sempre Brasília, UTC-3) ----------

    function addDays(dateStr, days) {
        var p = dateStr.split('-').map(Number);
        return new Date(Date.UTC(p[0], p[1] - 1, p[2] + days)).toISOString().slice(0, 10);
    }

    function weekdayOf(dateStr) {
        var p = dateStr.split('-').map(Number);
        return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
    }

    function instantOf(dateStr, minutes) {
        var p = dateStr.split('-').map(Number);
        return Date.UTC(p[0], p[1] - 1, p[2], 3, minutes);
    }

    function timeOf(minutes) {
        return ('0' + Math.floor(minutes / 60)).slice(-2) + ':' + ('0' + (minutes % 60)).slice(-2);
    }

    function fmtBR(iso) {
        return new Intl.DateTimeFormat('pt-BR', {
            timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        }).format(new Date(iso));
    }

    // Último dia mostrado na grade, pela janela escolhida no formulário.
    function windowEnd() {
        var value = $('adm-window').value;
        if (value === 'custom') {
            var custom = $('adm-custom').value;
            return custom && custom >= state.today ? custom : state.today;
        }
        return addDays(state.today, Number(value));
    }

    function gridDates() {
        var dates = [];
        var end = windowEnd();
        for (var d = state.today; d <= end && dates.length < 400; d = addDays(d, 1)) dates.push(d);
        return dates;
    }

    // ---------- login ----------

    function login(candidate, silent) {
        key = candidate;
        show('loading');
        api('agenda.admin.load').then(function (data) {
            if (data.status !== 'success') {
                key = '';
                try { localStorage.removeItem(KEY_STORE); } catch (e) {}
                show('login');
                if (!silent) {
                    var error = $('adm-login-error');
                    error.hidden = false;
                    error.textContent = data.code === 'admin_not_configured'
                        ? 'A senha do painel ainda não foi configurada. Crie a propriedade AGENDA_ADMIN_KEY no projeto do Apps Script.'
                        : data.code === 'unauthorized' ? 'Senha incorreta.' : 'Não foi possível entrar. Tente de novo.';
                }
                return;
            }
            try { localStorage.setItem(KEY_STORE, key); } catch (e) {}
            receive(data);
            show('panel');
        }).catch(function () {
            show('login');
            var error = $('adm-login-error');
            error.hidden = false;
            error.textContent = 'Sem conexão com o servidor. Tente de novo.';
        });
    }

    function receive(data) {
        state.today        = data.today;
        state.config       = data.config;
        state.availability = data.availability || {};
        state.bookings     = data.bookings || [];

        $('adm-window').value   = String(data.config.window);
        $('adm-custom').value   = data.config.customEnd || '';
        $('adm-custom').min     = data.today;
        $('adm-duration').value = String(data.config.duration);
        $('adm-notice').value   = String(data.config.minNoticeHours);
        $('adm-custom-wrap').hidden = data.config.window !== 'custom';

        setDirty(false);
        renderGrid();
        renderBookings();
    }

    function setDirty(dirty, message) {
        state.dirty = dirty;
        $('adm-savebar').classList.toggle('is-dirty', dirty);
        $('adm-save').disabled = !dirty;
        $('adm-save-status').textContent = message || (dirty ? 'Há alterações não salvas.' : 'Tudo salvo.');
    }

    // ---------- grade ----------

    function isOn(date, time) {
        return (state.availability[date] || []).indexOf(time) !== -1;
    }

    function setOn(date, time, on) {
        var list = (state.availability[date] || []).filter(function (t) { return t !== time; });
        if (on) list.push(time);
        list.sort();
        if (list.length) state.availability[date] = list; else delete state.availability[date];
    }

    // Blocos ocupados por calls ativas: { 'aaaa-mm-dd|HH:mm': 'Nome' }
    function bookedBlocks() {
        var map = {};
        state.bookings.forEach(function (b) {
            if (b.status === 'Cancelado') return;
            var start = new Date(b.start).getTime();
            for (var m = 0; m < b.duration; m += BLOCK) {
                var br = new Date(start + m * 60000 - 3 * 3600000).toISOString();
                map[br.slice(0, 10) + '|' + br.slice(11, 16)] = b.name;
            }
        });
        return map;
    }

    function renderGrid() {
        var dates  = gridDates();
        var booked = bookedBlocks();
        var now    = Date.now();

        // Estica a grade se já houver horário marcado fora do padrão 07h–22h.
        var first = DAY_START, last = DAY_END;
        Object.keys(state.availability).forEach(function (date) {
            state.availability[date].forEach(function (time) {
                var m = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
                first = Math.min(first, m - (m % 60));
                last  = Math.max(last, m + BLOCK);
            });
        });

        var html = '<thead><tr><th class="adm-grid__time"></th>';
        dates.forEach(function (date, i) {
            var wd = weekdayOf(date);
            var cls = (wd === 0 || wd === 6 ? 'is-weekend ' : '') + (i > 0 && wd === 1 ? 'is-week-start' : '');
            html += '<th class="' + cls + '"><small>' + WEEKDAYS[wd] + '</small>' + date.slice(8) + '/' + date.slice(5, 7) + '</th>';
        });
        html += '</tr></thead><tbody>';

        for (var m = first; m < last; m += BLOCK) {
            var time = timeOf(m);
            html += '<tr class="' + (m % 60 === 0 ? 'is-hour' : '') + '"><th class="adm-grid__time">' + (m % 60 === 0 ? time : '') + '</th>';
            dates.forEach(function (date, i) {
                var cls = 'adm-cell';
                var title = WEEKDAYS[weekdayOf(date)] + ' ' + date.slice(8) + '/' + date.slice(5, 7) + ' ' + time;
                var who = booked[date + '|' + time];
                if (who) { cls += ' is-booked'; title += ' — call com ' + who; }
                else if (instantOf(date, m) < now) cls += ' is-past';
                else if (isOn(date, time)) cls += ' is-on';
                if (i > 0 && weekdayOf(date) === 1) cls += ' is-week-start';
                html += '<td class="' + cls + '" data-date="' + date + '" data-time="' + time + '" title="' + title.replace(/"/g, '&quot;') + '"></td>';
            });
            html += '</tr>';
        }
        $('adm-grid').innerHTML = html + '</tbody>';
    }

    function cellFrom(event) {
        var cell = event.target.closest && event.target.closest('.adm-cell');
        if (!cell || cell.classList.contains('is-past') || cell.classList.contains('is-booked')) return null;
        return cell;
    }

    function applyPaint(cell, on) {
        if (cell.classList.contains('is-on') === on) return;
        cell.classList.toggle('is-on', on);
        setOn(cell.getAttribute('data-date'), cell.getAttribute('data-time'), on);
        setDirty(true);
    }

    function bindGrid() {
        var grid = $('adm-grid');

        // Mouse: clicar e arrastar pinta vários blocos. Toque: um bloco por toque
        // (arrastar com o dedo continua rolando a grade).
        var lastPointer = '';
        var anchor = null;   // bloco onde o arrasto começou
        grid.addEventListener('pointerdown', function (event) {
            lastPointer = event.pointerType;
            var cell = cellFrom(event);
            if (!cell || event.pointerType !== 'mouse' || event.button !== 0) return;
            event.preventDefault();
            paint = !cell.classList.contains('is-on');
            anchor = cell;
            applyPaint(cell, paint);
        });
        // Pinta o retângulo entre o bloco inicial e o atual — assim um arrasto
        // rápido (que pula células) não deixa buracos.
        grid.addEventListener('pointerover', function (event) {
            if (paint === null || !anchor) return;
            var cell = event.target.closest && event.target.closest('.adm-cell');
            if (!cell) return;
            var rows = grid.tBodies[0].rows;
            var r0 = Math.min(anchor.parentNode.sectionRowIndex, cell.parentNode.sectionRowIndex);
            var r1 = Math.max(anchor.parentNode.sectionRowIndex, cell.parentNode.sectionRowIndex);
            var c0 = Math.min(anchor.cellIndex, cell.cellIndex);
            var c1 = Math.max(anchor.cellIndex, cell.cellIndex);
            for (var r = r0; r <= r1; r++) {
                for (var c = c0; c <= c1; c++) {
                    var target = rows[r].cells[c];
                    if (!target.classList.contains('is-past') && !target.classList.contains('is-booked')) applyPaint(target, paint);
                }
            }
        });
        window.addEventListener('pointerup', function () { paint = null; anchor = null; });

        grid.addEventListener('click', function (event) {
            if (lastPointer === 'mouse') return;   // o pointerdown do mouse já tratou
            var cell = cellFrom(event);
            if (cell) applyPaint(cell, !cell.classList.contains('is-on'));
        });
    }

    // Copia os 7 primeiros dias para o resto da janela (mesmo dia da semana).
    function repeatFirstWeek() {
        var dates = gridDates();
        if (dates.length <= 7) return;
        if (!window.confirm('Copiar os horários dos 7 primeiros dias para as semanas seguintes? Os horários já marcados depois disso serão substituídos.')) return;
        dates.slice(7).forEach(function (date, i) {
            var source = state.availability[dates[i % 7]];
            if (source && source.length) state.availability[date] = source.slice(); else delete state.availability[date];
        });
        setDirty(true);
        renderGrid();
    }

    function clearAll() {
        if (!window.confirm('Remover todos os horários disponíveis? As calls já marcadas continuam valendo.')) return;
        state.availability = {};
        setDirty(true);
        renderGrid();
    }

    // ---------- calls marcadas ----------

    function esc(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderBookings() {
        var box = $('adm-bookings');
        if (!state.bookings.length) {
            box.innerHTML = '<p class="ag-small">Nenhuma call marcada por enquanto.</p>';
            return;
        }
        var now = Date.now();
        var rows = state.bookings.map(function (b) {
            var active = b.status !== 'Cancelado' && new Date(b.start).getTime() + b.duration * 60000 > now;
            var link = /^https:\/\//.test(b.link) ? '<a href="' + esc(b.link) + '" target="_blank" rel="noopener">Abrir</a>' : '—';
            return '<tr>' +
                '<td><strong>' + esc(fmtBR(b.start)) + '</strong><small>' + b.duration + ' min</small></td>' +
                '<td>' + esc(b.name) + '<small>' + esc(b.email) + '</small><small>' + (b.phone ? '+' + esc(b.phone) : '') + '</small></td>' +
                '<td><span class="adm-status adm-status--' + esc(b.status) + '">' + esc(b.status) + '</span>' +
                    (b.confirmedAt ? '<small>em ' + esc(b.confirmedAt) + '</small>' : '') + '</td>' +
                '<td><small>24h: ' + esc(b.reminder24 || 'pendente') + '</small><small>2h: ' + esc(b.reminder2 || 'pendente') + '</small></td>' +
                '<td>' + link + '</td>' +
                '<td>' + (active ? '<button type="button" class="adm-cancel" data-token="' + esc(b.token) + '">Cancelar</button>' : '') + '</td>' +
                '</tr>';
        }).join('');
        box.innerHTML = '<div class="adm-bookings-wrap"><table class="adm-bookings"><thead><tr>' +
            '<th>Quando (Brasília)</th><th>Lead</th><th>Status</th><th>Lembretes</th><th>Link</th><th></th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    function cancelBooking(token) {
        var booking = state.bookings.filter(function (b) { return b.token === token; })[0];
        if (!booking) return;
        if (!window.confirm('Cancelar a call com ' + booking.name + ' (' + fmtBR(booking.start) + ')?\n\nO lead NÃO é avisado por WhatsApp — combine com ele antes.')) return;
        api('agenda.admin.cancel', { token: token }).then(function (data) {
            if (data.status !== 'success') { window.alert('Não foi possível cancelar. Recarregue a página e tente de novo.'); return; }
            var unsaved = state.dirty ? state.availability : null;
            receive(data);
            if (unsaved) { state.availability = unsaved; setDirty(true); renderGrid(); }
        });
    }

    // ---------- salvar ----------

    function save() {
        var button = $('adm-save');
        button.disabled = true;
        $('adm-save-status').textContent = 'Salvando…';

        api('agenda.admin.save', {
            config: {
                window:         $('adm-window').value,
                customEnd:      $('adm-custom').value,
                duration:       Number($('adm-duration').value),
                minNoticeHours: Number($('adm-notice').value),
            },
            availability: state.availability,
        }).then(function (data) {
            if (data.status !== 'success') {
                setDirty(true, data.code === 'invalid_config'
                    ? 'Escolha a data final em "Mostrar até".'
                    : 'Não foi possível salvar. Tente de novo.');
                return;
            }
            receive(data);
            setDirty(false, 'Salvo às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.');
        }).catch(function () {
            setDirty(true, 'Sem conexão. Tente de novo.');
        });
    }

    // ---------- início ----------

    $('adm-login').addEventListener('submit', function (event) {
        event.preventDefault();
        $('adm-login-error').hidden = true;
        login($('adm-key').value.trim(), false);
    });

    $('adm-logout').addEventListener('click', function () {
        try { localStorage.removeItem(KEY_STORE); } catch (e) {}
        key = '';
        $('adm-key').value = '';
        show('login');
    });

    ['adm-window', 'adm-custom', 'adm-duration', 'adm-notice'].forEach(function (id) {
        $(id).addEventListener('change', function () {
            $('adm-custom-wrap').hidden = $('adm-window').value !== 'custom';
            setDirty(true);
            renderGrid();
        });
    });

    $('adm-repeat').addEventListener('click', repeatFirstWeek);
    $('adm-clear').addEventListener('click', clearAll);
    $('adm-save').addEventListener('click', save);
    $('adm-bookings').addEventListener('click', function (event) {
        var button = event.target.closest('.adm-cancel');
        if (button) cancelBooking(button.getAttribute('data-token'));
    });
    window.addEventListener('beforeunload', function (event) {
        if (state.dirty) { event.preventDefault(); event.returnValue = ''; }
    });

    bindGrid();

    var saved = '';
    try { saved = localStorage.getItem(KEY_STORE) || ''; } catch (e) {}
    if (saved) login(saved, true);
})();
