/* ============================================
   SIPOP — lp-publicar.js
   Formulário da landing page /pt/publicar:
   UTMs, validação, nota do lead, envio e eventos do GTM
   ============================================ */

// Regras da nota do lead. Ajuste aqui os pontos e o corte.
// As chaves são os `value` das opções em src/_data/lpPublicar.json.
const LEAD_SCORE = {
    corte: 6,
    regras: {
        estagio: {
            pos_graduando: 2,
            pos_doutorando: 2,
            professor_progressao: 2,
            professor_titular: 2,
            fora_academia: 2,
            graduando: -3,
            outro: 0,
        },
        objetivo: {
            alto_impacto_q1: 2,
            progressao_carreira: 2,
            requisito_academico: 1,
        },
        fase: {
            dados_coletados: 3,
            manuscrito: 3,
            rejeitado: 3,
            protocolo: 1,
        },
        prazo: {
            ate_3_meses: 2,
            '3_a_6_meses': 2,
        },
        area: {
            medicina: 1,
            fisioterapia: 1,
            odontologia: 1,
            nutricao: 1,
            enfermagem: 1,
            educacao_fisica: 1,
            farmacia: 1,
            psicologia: 1,
            outra_saude: 1,
        },
    },
};

const FORM_ENDPOINT = '/.netlify/functions/submit-form';
const REQUEST_TIMEOUT_MS = 30000;
const TRACKING_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid'];
const STORAGE_PREFIX = 'sipop_lp_';

document.addEventListener('DOMContentLoaded', () => {
    setupPublicationsDialog();
    setupScrollToForm();

    const form = document.getElementById('leadForm');
    if (!form) return;

    fillTrackingFields(form);
    setupValidation(form);
    setupSubmit(form);
});

// ==========================================
// 1. UTMs e identificadores de clique
// ==========================================

function readStored(key) {
    try {
        return sessionStorage.getItem(STORAGE_PREFIX + key) || '';
    } catch (e) {
        return '';
    }
}

function writeStored(key, value) {
    try {
        sessionStorage.setItem(STORAGE_PREFIX + key, value);
    } catch (e) {
        // Navegação privada ou armazenamento bloqueado: segue só com a URL
    }
}

function fillTrackingFields(form) {
    const params = new URLSearchParams(window.location.search);

    TRACKING_KEYS.forEach((key) => {
        const fromUrl = params.get(key);
        if (fromUrl) writeStored(key, fromUrl);
        form.elements[key].value = fromUrl || readStored(key);
    });

    form.elements.pagina_origem.value = window.location.href.split('#')[0];
}

// ==========================================
// 2. Validação
// ==========================================

// Devolve só os dígitos do número nacional, sem DDI repetido nem zero à esquerda
function nationalDigits(ddi, rawNumber) {
    const ddiDigits = ddi.replace(/\D/g, '');
    let digits = rawNumber.replace(/\D/g, '');

    if (rawNumber.trim().startsWith('+') && digits.startsWith(ddiDigits)) {
        digits = digits.slice(ddiDigits.length);
    }
    if (ddiDigits === '55' && digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
        digits = digits.slice(2);
    }
    return digits.replace(/^0+/, '');
}

function toE164(ddi, rawNumber) {
    return '+' + ddi.replace(/\D/g, '') + nationalDigits(ddi, rawNumber);
}

// Aceita "@perfil", "perfil" ou o link do perfil e devolve só o nome de usuário
function instagramHandle(rawValue) {
    const value = rawValue.trim();
    const fromUrl = value.match(/instagram\.com\/([^/?#\s]+)/i);
    return (fromUrl ? fromUrl[1] : value).replace(/^@+/, '');
}

function validateField(form, field) {
    const value = field.value.trim();

    if (field.name === 'whatsapp') {
        if (!value) return 'Informe seu WhatsApp.';
        const ddi = form.querySelector('#whatsapp_ddi').value;
        const length = nationalDigits(ddi, value).length;
        const valid = ddi === '+55' ? length === 10 || length === 11 : length >= 6 && length <= 14;
        return valid ? '' : 'Informe um número válido, com DDD.';
    }
    if (field.name === 'email') {
        if (!value) return 'Informe seu e-mail.';
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : 'Informe um e-mail válido, como nome@exemplo.com.';
    }
    if (field.name === 'nome') {
        return value ? '' : 'Informe seu nome.';
    }
    if (field.name === 'instagram') {
        if (!value) return '';
        return /^[a-z0-9._]{1,30}$/i.test(instagramHandle(value)) ? '' : 'Informe um perfil válido, como @seuperfil.';
    }
    if (field.tagName === 'SELECT' && field.required && !value) {
        return 'Selecione uma opção.';
    }
    return '';
}

function showFieldError(form, field, message) {
    const errorEl = form.querySelector('#' + field.name + '-erro');
    if (errorEl) errorEl.textContent = message;
    if (message) {
        field.setAttribute('aria-invalid', 'true');
    } else {
        field.removeAttribute('aria-invalid');
    }
}

// Campos obrigatórios e os opcionais que têm formato a conferir
function requiredFields(form) {
    return Array.from(form.querySelectorAll('[required], #instagram'));
}

function setupValidation(form) {
    requiredFields(form).forEach((field) => {
        field.addEventListener('blur', () => {
            if (field.value.trim()) showFieldError(form, field, validateField(form, field));
        });
        field.addEventListener('input', () => {
            if (field.getAttribute('aria-invalid')) showFieldError(form, field, validateField(form, field));
        });
    });
}

function validateForm(form) {
    let firstInvalid = null;

    requiredFields(form).forEach((field) => {
        const message = validateField(form, field);
        showFieldError(form, field, message);
        if (message && !firstInvalid) firstInvalid = field;
    });

    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
}

// ==========================================
// 3. Nota do lead
// ==========================================

function calculateScore(form) {
    return Object.keys(LEAD_SCORE.regras).reduce((total, fieldName) => {
        return total + (LEAD_SCORE.regras[fieldName][form.elements[fieldName].value] || 0);
    }, 0);
}

function createEventId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return 'evt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

// ==========================================
// 4. Envio
// ==========================================

function selectedLabel(form, fieldName) {
    const select = form.elements[fieldName];
    return select.options[select.selectedIndex].text;
}

// O Apps Script grava colunas fixas e ignora campos desconhecidos. Por isso os
// campos existentes são preenchidos com os equivalentes da LP, e o restante vai
// em `objective`, que já aparece na planilha e no e-mail de notificação. Os
// campos originais seguem junto no payload para futuras colunas próprias.
function buildPayload(form, score, qualified, phone) {
    const get = (name) => form.elements[name].value.trim();

    const instagram = instagramHandle(get('instagram'));

    const summary = [
        'Nota do lead: ' + score + ' (qualificado: ' + (qualified ? 'sim' : 'não') + ')',
        'Instagram: ' + (instagram ? '@' + instagram : '—'),
        'Fase: ' + selectedLabel(form, 'fase'),
        'Tipo de estudo: ' + selectedLabel(form, 'tipo_estudo'),
        'Prazo: ' + selectedLabel(form, 'prazo'),
        'Detalhes: ' + (get('detalhes') || '—'),
        'utm_term: ' + (get('utm_term') || '—'),
        'gclid: ' + (get('gclid') || '—'),
        'fbclid: ' + (get('fbclid') || '—'),
        'Página: ' + get('pagina_origem'),
        'event_id: ' + get('event_id'),
    ].join('\n');

    const fields = {};
    Array.from(form.elements).forEach((el) => {
        if (el.name) fields[el.name] = el.value.trim();
    });

    return Object.assign(fields, {
        whatsapp:          phone,
        instagram:         instagram ? '@' + instagram : '',
        source:            'Landing Page — Publicar',
        name:              get('nome'),
        phone:             phone,
        preferredLanguage: 'Portuguese',
        specialty:         selectedLabel(form, 'area'),
        careerStage:       selectedLabel(form, 'estagio'),
        objectiveType:     selectedLabel(form, 'objetivo'),
        objective:         summary,
        timestamp:         new Date().toISOString(),
    });
}

async function sendLead(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(FORM_ENDPOINT, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
            signal:  controller.signal,
        });

        let result = {};
        try {
            result = await response.json();
        } catch (parseErr) {
            // resposta sem corpo JSON legível: trata como falha
        }

        if (!response.ok || result.status !== 'success') {
            throw new Error(result.message || `Request failed (${response.status})`);
        }
    } finally {
        clearTimeout(timer);
    }
}

// Com o GTM ativo, espera as tags dispararem antes de sair da página.
// Sem ele não há o que esperar, e o redirecionamento é imediato.
// O eventCallback do GTM avisa quando as tags rodaram, não quando os
// pedidos terminaram: o Meta Pixel envia por imagem, e sair da página
// logo em seguida cancela o envio. Por isso a folga depois do callback.
const PIXEL_GRACE_MS = 700;

function pushEventsAndRedirect(events, url) {
    let redirected = false;
    const redirect = () => {
        if (redirected) return;
        redirected = true;
        window.location.assign(url);
    };

    const gtmActive = Boolean(window.google_tag_manager);
    if (gtmActive) {
        Object.assign(events[events.length - 1], {
            eventCallback: () => setTimeout(redirect, PIXEL_GRACE_MS),
            eventTimeout: 1000,
        });
    }

    window.dataLayer = window.dataLayer || [];
    events.forEach((event) => window.dataLayer.push(event));

    if (gtmActive) {
        setTimeout(redirect, 2000);
    } else {
        redirect();
    }
}

function setupSubmit(form) {
    const button = form.querySelector('.lp-submit');
    const statusEl = document.getElementById('formStatus');
    const originalText = button.textContent;
    let sending = false;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (sending) return;

        statusEl.textContent = '';
        if (!validateForm(form)) return;

        sending = true;
        button.disabled = true;
        button.textContent = 'Enviando…';

        const score = calculateScore(form);
        const qualified = score >= LEAD_SCORE.corte;
        const phone = toE164(form.querySelector('#whatsapp_ddi').value, form.elements.whatsapp.value);
        // Numa nova tentativa após falha, mantém o mesmo ID
        const eventId = form.elements.event_id.value || createEventId();

        form.elements.nota_lead.value = score;
        form.elements.lead_qualificado.value = qualified ? 'sim' : 'não';
        form.elements.event_id.value = eventId;

        try {
            await sendLead(buildPayload(form, score, qualified, phone));
        } catch (error) {
            console.error('Form error:', error);
            statusEl.textContent = 'Não foi possível enviar seu projeto. Seus dados continuam preenchidos: tente novamente em instantes. Se o problema continuar, escreva para contact@sipopscience.com.';
            sending = false;
            button.disabled = false;
            button.textContent = originalText;
            return;
        }

        const events = [{
            event: 'lead_enviado',
            event_id: eventId,
            nota_lead: score,
            lead_qualificado: qualified,
            area: form.elements.area.value,
            estagio: form.elements.estagio.value,
            fase: form.elements.fase.value,
            prazo: form.elements.prazo.value,
            user_data: { email: form.elements.email.value.trim(), phone: phone },
        }];
        if (qualified) {
            events.push({ event: 'lead_qualificado', event_id: eventId + '-q', nota_lead: score });
        }

        const page = qualified ? '/pt/obrigado-prioridade' : '/pt/obrigado';
        const query = new URLSearchParams({ event_id: eventId, q: qualified ? '1' : '0' });
        pushEventsAndRedirect(events, page + '?' + query.toString());
    });
}

// ==========================================
// 5. Modal "Ver publicações"
// ==========================================

function setupPublicationsDialog() {
    const dialog = document.getElementById('publicationsDialog');
    const openBtn = document.getElementById('openPublications');
    const closeBtn = document.getElementById('closePublications');
    if (!dialog || !openBtn || !closeBtn) return;

    openBtn.addEventListener('click', () => dialog.showModal());
    closeBtn.addEventListener('click', () => dialog.close());
    // Clique no fundo escurecido também fecha
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close();
    });
}

// ==========================================
// 6. Rolagem animada até o formulário
// ==========================================

function setupScrollToForm() {
    const target = document.getElementById('formulario');
    if (!target) return;
    const heading = target.querySelector('h2');
    if (heading) heading.setAttribute('tabindex', '-1');

    document.querySelectorAll('a[href="#formulario"]').forEach((link) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const offset = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
            const top = target.getBoundingClientRect().top + window.scrollY - offset;
            const done = () => { if (heading) heading.focus({ preventScroll: true }); };

            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                window.scrollTo({ top, behavior: 'instant' });
                done();
                return;
            }
            animateScroll(top, done);
        });
    });
}

// Animação própria em vez de scroll-behavior: smooth, para ter a mesma
// duração e curva em todos os navegadores. Para se a pessoa rolar no meio.
function animateScroll(top, onDone) {
    const start = window.scrollY;
    const distance = top - start;
    const duration = Math.min(1100, Math.max(500, Math.abs(distance) * 0.25));
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let startTime = null;
    let cancelled = false;

    const cancel = () => { cancelled = true; };
    const events = ['wheel', 'touchstart', 'keydown'];
    events.forEach((ev) => window.addEventListener(ev, cancel, { once: true, passive: true }));

    function step(now) {
        if (cancelled) return;
        if (startTime === null) startTime = now;
        const progress = Math.min(1, (now - startTime) / duration);
        window.scrollTo({ top: start + distance * ease(progress), behavior: 'instant' });
        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            events.forEach((ev) => window.removeEventListener(ev, cancel));
            onDone();
        }
    }
    requestAnimationFrame(step);
}
