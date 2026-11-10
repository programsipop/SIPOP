// ============================================
// SIPOP — agenda.js
// Páginas do lead: /agendar (escolher data e horário) e /confirmar
// (lembrete de 24h: CONFIRMAR ou REAGENDAR).
//
// Fala com o Apps Script (agenda.gs) pela Netlify Function "agenda".
// O idioma vem do lead (planilha); sem lead, de ?lang= ou do navegador.
// Os horários aparecem no fuso do navegador de quem está agendando.
// ============================================

(function () {
    'use strict';

    var API = '/.netlify/functions/agenda';
    var WHATSAPP_URL = 'https://wa.me/5551935001294';

    var TEXT = {
        pt: {
            locale: 'pt-BR',
            title: 'Agende sua call com o SIPOP',
            titleNamed: '{name}, agende sua call com o SIPOP',
            subtitle: 'Uma conversa de {min} minutos por vídeo, para entender o seu projeto e indicar o melhor caminho.',
            pickDay: 'Escolha o dia',
            pickTime: 'Escolha o horário',
            yourData: 'Seus dados',
            name: 'Nome completo',
            email: 'E-mail',
            phone: 'WhatsApp (com DDD)',
            tz: 'Horários no seu fuso: {tz}.',
            submit: 'Confirmar agendamento',
            submitAt: 'Agendar para {when}',
            submitting: 'Agendando…',
            current: 'Você já tem uma call marcada para {when}. Escolha um novo horário abaixo para reagendar.',
            taken: 'Esse horário acabou de ser reservado. Escolha outro, por favor.',
            contact: 'Preencha nome, e-mail e WhatsApp (com DDD) para agendar.',
            failed: 'Não conseguimos concluir o agendamento. Tente de novo em instantes.',
            emptyTitle: 'Sem horários disponíveis no momento',
            emptyText: 'Nossa agenda está cheia nos próximos dias. Fale com a gente pelo WhatsApp e encontramos um horário para você.',
            emptyCta: 'Falar pelo WhatsApp',
            doneTitle: 'Call agendada!',
            doneText: 'Enviamos a confirmação por e-mail e WhatsApp, com o link da reunião. Você também vai receber um lembrete um dia antes.',
            openLink: 'Abrir link da reunião',
            change: 'Preciso mudar o horário',
            errorTitle: 'Algo deu errado',
            errorText: 'Não conseguimos carregar a agenda. Verifique sua conexão e tente de novo.',
            retry: 'Tentar de novo',
            askTitle: 'Sua call com o SIPOP',
            askText: 'Você confirma sua presença?',
            confirmBtn: 'CONFIRMAR',
            rescheduleBtn: 'REAGENDAR',
            confirming: 'Confirmando…',
            confirmedTitle: 'Presença confirmada',
            confirmedText: 'Obrigado! Enviaremos o link da reunião de novo pelo WhatsApp 2 horas antes.',
            noneTitle: 'Nenhuma call marcada',
            noneText: 'Não encontramos uma call ativa para este link. Você pode escolher um novo horário.',
            noneCta: 'Escolher um horário',
        },
        en: {
            locale: 'en-US',
            title: 'Schedule your call with SIPOP',
            titleNamed: '{name}, schedule your call with SIPOP',
            subtitle: 'A {min}-minute video call to understand your project and point you to the best path.',
            pickDay: 'Pick a day',
            pickTime: 'Pick a time',
            yourData: 'Your details',
            name: 'Full name',
            email: 'Email',
            phone: 'WhatsApp (with country code)',
            tz: 'Times shown in your time zone: {tz}.',
            submit: 'Confirm booking',
            submitAt: 'Book {when}',
            submitting: 'Booking…',
            current: 'You already have a call booked for {when}. Pick a new time below to reschedule.',
            taken: 'That time was just taken. Please pick another one.',
            contact: 'Please fill in your name, email and WhatsApp (with country code).',
            failed: 'We could not complete the booking. Please try again in a moment.',
            emptyTitle: 'No times available right now',
            emptyText: 'Our calendar is full for the next few days. Message us on WhatsApp and we will find a time for you.',
            emptyCta: 'Message us on WhatsApp',
            doneTitle: 'Call booked!',
            doneText: 'We sent the confirmation by email and WhatsApp, with the meeting link. You will also get a reminder the day before.',
            openLink: 'Open meeting link',
            change: 'I need to change the time',
            errorTitle: 'Something went wrong',
            errorText: 'We could not load the calendar. Check your connection and try again.',
            retry: 'Try again',
            askTitle: 'Your call with SIPOP',
            askText: 'Can you confirm you will attend?',
            confirmBtn: 'CONFIRM',
            rescheduleBtn: 'RESCHEDULE',
            confirming: 'Confirming…',
            confirmedTitle: 'Attendance confirmed',
            confirmedText: 'Thank you! We will send the meeting link again on WhatsApp 2 hours before.',
            noneTitle: 'No call booked',
            noneText: 'We could not find an active call for this link. You can pick a new time.',
            noneCta: 'Pick a time',
        },
        es: {
            locale: 'es',
            title: 'Agenda tu llamada con SIPOP',
            titleNamed: '{name}, agenda tu llamada con SIPOP',
            subtitle: 'Una videollamada de {min} minutos para conocer tu proyecto e indicarte el mejor camino.',
            pickDay: 'Elige el día',
            pickTime: 'Elige el horario',
            yourData: 'Tus datos',
            name: 'Nombre completo',
            email: 'Correo electrónico',
            phone: 'WhatsApp (con código de país)',
            tz: 'Horarios en tu zona horaria: {tz}.',
            submit: 'Confirmar cita',
            submitAt: 'Agendar para {when}',
            submitting: 'Agendando…',
            current: 'Ya tienes una llamada agendada para {when}. Elige un nuevo horario abajo para reagendar.',
            taken: 'Ese horario acaba de ser reservado. Elige otro, por favor.',
            contact: 'Completa tu nombre, correo y WhatsApp (con código de país).',
            failed: 'No pudimos completar la cita. Inténtalo de nuevo en unos instantes.',
            emptyTitle: 'Sin horarios disponibles por ahora',
            emptyText: 'Nuestra agenda está llena en los próximos días. Escríbenos por WhatsApp y encontramos un horario para ti.',
            emptyCta: 'Escribir por WhatsApp',
            doneTitle: '¡Llamada agendada!',
            doneText: 'Enviamos la confirmación por correo y WhatsApp, con el enlace de la reunión. También recibirás un recordatorio un día antes.',
            openLink: 'Abrir enlace de la reunión',
            change: 'Necesito cambiar el horario',
            errorTitle: 'Algo salió mal',
            errorText: 'No pudimos cargar la agenda. Revisa tu conexión e inténtalo de nuevo.',
            retry: 'Intentar de nuevo',
            askTitle: 'Tu llamada con SIPOP',
            askText: '¿Confirmas tu asistencia?',
            confirmBtn: 'CONFIRMAR',
            rescheduleBtn: 'REAGENDAR',
            confirming: 'Confirmando…',
            confirmedTitle: 'Asistencia confirmada',
            confirmedText: '¡Gracias! Te enviaremos de nuevo el enlace de la reunión por WhatsApp 2 horas antes.',
            noneTitle: 'Ninguna llamada agendada',
            noneText: 'No encontramos una llamada activa para este enlace. Puedes elegir un nuevo horario.',
            noneCta: 'Elegir un horario',
        },
    };

    var app = document.getElementById('ag-app');
    if (!app) return;

    var params = new URLSearchParams(window.location.search);
    var token  = /^s[0-9a-f]{16}$/.test(params.get('t') || '') ? params.get('t') : '';
    var tzName = '';
    try { tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}

    var lang = pickLang(params.get('lang') || navigator.language);
    var t    = TEXT[lang];

    var state = { slots: [], duration: 30, day: '', slot: '', known: false, firstName: '' };

    // ---------- utilidades ----------

    function pickLang(value) {
        var v = String(value || '').toLowerCase();
        if (v.indexOf('en') === 0) return 'en';
        if (v.indexOf('es') === 0) return 'es';
        return 'pt';
    }

    function $(id) { return document.getElementById(id); }

    function show(view) { app.setAttribute('data-view', view); }

    function fill(text, values) {
        return text.replace(/\{(\w+)\}/g, function (m, key) { return values[key] !== undefined ? values[key] : m; });
    }

    function applyText() {
        document.documentElement.lang = t.locale;
        app.querySelectorAll('[data-t]').forEach(function (el) {
            var key = el.getAttribute('data-t');
            if (t[key]) el.textContent = fill(t[key], { min: state.duration });
        });
    }

    function setLang(value) {
        if (!value) return;
        lang = pickLang(value);
        t = TEXT[lang];
    }

    function api(action, body) {
        var payload = Object.assign({ action: action }, body || {});
        return fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
        }).then(function (response) { return response.json(); });
    }

    function fmt(iso, options) {
        return new Intl.DateTimeFormat(t.locale, options).format(new Date(iso));
    }

    // "quinta-feira, 12 de novembro, 14:00"
    function fmtWhen(iso) {
        return fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + fmtTime(iso);
    }

    function fmtTime(iso) {
        return fmt(iso, { hour: lang === 'en' ? 'numeric' : '2-digit', minute: '2-digit' });
    }

    function tzLabel() {
        var short = '';
        try {
            var parts = new Intl.DateTimeFormat(t.locale, { timeZoneName: 'short' }).formatToParts(new Date());
            short = (parts.filter(function (p) { return p.type === 'timeZoneName'; })[0] || {}).value || '';
        } catch (e) {}
        var name = tzName.replace(/_/g, ' ');
        return name && short ? name + ' (' + short + ')' : (name || short);
    }

    // Dia local (no fuso do navegador) de um instante: "2026-11-12"
    function localDay(iso) {
        var d = new Date(iso);
        return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }

    function showError(message) {
        var el = $('ag-error');
        if (!el) return;
        el.textContent = message || '';
        el.hidden = !message;
    }

    // ============================================
    // /agendar
    // ============================================

    function loadBooking(keepDay) {
        show('loading');
        api('agenda.slots', { token: token }).then(function (data) {
            if (data.status !== 'success') throw new Error(data.code);

            state.slots     = data.slots || [];
            state.duration  = data.duration || 30;
            state.known     = !!data.lead;
            state.firstName = data.lead ? data.lead.firstName : '';
            state.booking   = data.booking || null;
            if (data.lead) setLang(data.lead.lang);
            applyText();

            if (!state.slots.length) {
                $('ag-whatsapp').href = WHATSAPP_URL;
                show('empty');
                return;
            }

            if (state.firstName) $('ag-app').querySelector('[data-t="title"]').textContent = fill(t.titleNamed, { name: state.firstName });

            var current = $('ag-current');
            current.hidden = !state.booking;
            if (state.booking) current.textContent = fill(t.current, { when: fmtWhen(state.booking.start) });

            $('ag-contact').hidden = state.known;
            $('ag-tz').textContent = fill(t.tz, { tz: tzLabel() });

            var days = groupByDay();
            state.day  = keepDay && days[state.day] ? state.day : Object.keys(days)[0];
            state.slot = '';
            renderDays(days);
            renderTimes(days);
            updateSubmit();
            show('pick');
        }).catch(function () {
            applyText();
            show('error');
        });
    }

    function groupByDay() {
        var days = {};
        state.slots.forEach(function (iso) {
            var key = localDay(iso);
            (days[key] = days[key] || []).push(iso);
        });
        return days;
    }

    function renderDays(days) {
        var box = $('ag-days');
        box.textContent = '';
        Object.keys(days).forEach(function (key) {
            var first = days[key][0];
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'ag-day';
            button.setAttribute('aria-pressed', String(key === state.day));
            button.setAttribute('aria-label', fmt(first, { weekday: 'long', day: 'numeric', month: 'long' }));
            [['ag-day__wd', { weekday: 'short' }], ['ag-day__num', { day: 'numeric' }], ['ag-day__mo', { month: 'short' }]].forEach(function (part) {
                var span = document.createElement('span');
                span.className = part[0];
                span.textContent = fmt(first, part[1]).replace('.', '');
                button.appendChild(span);
            });
            button.addEventListener('click', function () {
                state.day = key;
                state.slot = '';
                renderDays(days);
                renderTimes(days);
                updateSubmit();
            });
            box.appendChild(button);
        });
    }

    function renderTimes(days) {
        var box = $('ag-times');
        box.textContent = '';
        (days[state.day] || []).forEach(function (iso) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'ag-time';
            button.textContent = fmtTime(iso);
            button.setAttribute('aria-pressed', String(iso === state.slot));
            button.addEventListener('click', function () {
                state.slot = iso;
                showError('');
                renderTimes(days);
                updateSubmit();
            });
            box.appendChild(button);
        });
    }

    function updateSubmit() {
        var button = $('ag-submit');
        button.disabled = !state.slot;
        button.textContent = state.slot ? fill(t.submitAt, { when: fmtWhen(state.slot) }) : t.submit;
    }

    function submitBooking() {
        if (!state.slot) return;
        var body = { token: token, start: state.slot, tz: tzName, lang: lang };

        if (!state.known) {
            body.name  = $('ag-name').value.trim();
            body.email = $('ag-email').value.trim();
            body.phone = $('ag-phone').value.trim();
            var digits = body.phone.replace(/\D/g, '');
            if (!body.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || digits.length < 10 || digits.length > 15) {
                showError(t.contact);
                return;
            }
        }

        var button = $('ag-submit');
        button.disabled = true;
        button.textContent = t.submitting;
        showError('');

        api('agenda.book', body).then(function (data) {
            if (data.status === 'success') {
                token = data.booking.token;
                // Dispara a confirmação (e-mail + WhatsApp). Se a página fechar antes,
                // o gatilho do Apps Script envia no lugar.
                if (!data.unchanged) api('agenda.notify', { token: token }).catch(function () {});
                showDone(data.booking);
                return;
            }
            if (data.code === 'slot_taken') {
                loadBooking(true);
                setTimeout(function () { showError(t.taken); }, 0);
                return;
            }
            showError(data.code === 'missing_contact' ? t.contact : t.failed);
            updateSubmit();
        }).catch(function () {
            showError(t.failed);
            updateSubmit();
        });
    }

    function showDone(booking) {
        $('ag-done-when').textContent = fmtWhen(booking.start);
        var link = $('ag-done-link');
        link.hidden = !booking.link;
        if (booking.link) link.href = booking.link;
        try { history.replaceState(null, '', window.location.pathname + '?t=' + booking.token); } catch (e) {}
        show('done');
    }

    // ============================================
    // /confirmar
    // ============================================

    function loadConfirm() {
        show('loading');
        api('agenda.get', { token: token }).then(function (data) {
            if (data.status !== 'success') throw new Error(data.code);
            setLang(data.lang || (data.booking && data.booking.lang));
            applyText();

            var bookUrl = '/agendar/' + (token ? '?t=' + token : '');
            if (!data.booking) {
                $('ag-none-link').href = bookUrl;
                show('none');
                return;
            }
            if (data.booking.status === 'Confirmado') { showConfirmed(data.booking); return; }

            $('ag-ask-when').textContent = fmtWhen(data.booking.start);
            $('ag-reschedule').href = bookUrl;
            show('ask');
        }).catch(function () {
            applyText();
            if (!token) { $('ag-none-link').href = '/agendar/'; show('none'); return; }
            show('error');
        });
    }

    function confirmPresence() {
        var button = $('ag-confirm');
        button.disabled = true;
        button.textContent = t.confirming;
        showError('');
        api('agenda.confirm', { token: token }).then(function (data) {
            if (data.status !== 'success') throw new Error(data.code);
            showConfirmed(data.booking);
        }).catch(function () {
            button.disabled = false;
            button.textContent = t.confirmBtn;
            showError(t.failed);
        });
    }

    function showConfirmed(booking) {
        $('ag-confirmed-when').textContent = fmtWhen(booking.start);
        var link = $('ag-confirmed-link');
        link.hidden = !booking.link;
        if (booking.link) link.href = booking.link;
        show('confirmed');
    }

    // ---------- início ----------

    applyText();

    if (app.getAttribute('data-page') === 'confirm') {
        $('ag-confirm').addEventListener('click', confirmPresence);
        $('ag-retry').addEventListener('click', loadConfirm);
        loadConfirm();
    } else {
        $('ag-submit').addEventListener('click', submitBooking);
        $('ag-retry').addEventListener('click', function () { loadBooking(false); });
        $('ag-done-change').addEventListener('click', function (event) {
            event.preventDefault();
            loadBooking(false);
        });
        $('ag-contact').addEventListener('submit', function (event) {
            event.preventDefault();
            submitBooking();
        });
        loadBooking(false);
    }
})();
