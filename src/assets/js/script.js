/* ============================================
   SIPOP — script.js
   - Theme toggle: light / dark / system
   - Formulário via Google Apps Script
   - Header scroll behavior
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 0. UTM CAPTURE — rastreamento de campanha
    // ==========================================

    /*
     * Lê utm_source, utm_medium, utm_campaign e utm_content da URL
     * (definidos no link de cada anúncio no Meta Ads Manager).
     * Salva no sessionStorage para persistir durante a sessão e
     * preenche os campos ocultos do formulário, se existirem na página.
     */
    function captureUTMs() {
        const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
        const params   = new URLSearchParams(window.location.search);
        const stored   = {};

        UTM_KEYS.forEach((key) => {
            const fromUrl = params.get(key);
            if (fromUrl) {
                sessionStorage.setItem(key, fromUrl);
            }
            stored[key] = sessionStorage.getItem(key) || '';
        });

        UTM_KEYS.forEach((key) => {
            const field = document.getElementById(key);
            if (field) field.value = stored[key];
        });
    }

    captureUTMs();

    // ==========================================
    // 1. THEME TOGGLE — light / dark / system
    // ==========================================

    const html        = document.documentElement;
    const themeToggle = document.getElementById('themeToggle');
    const STORAGE_KEY = 'sipop-theme';

    // Ciclo de estados: light → dark → system → light → ...
    const CYCLE = ['light', 'dark', 'system'];

    /*
     * Aplica o tema visualmente no <html>.
     * 'system' remove o data-theme para deixar o CSS
     * Media Query (@media prefers-color-scheme) agir livremente.
     */
    function applyTheme(theme) {
        if (theme === 'system') {
            html.removeAttribute('data-theme');
            // Força re-avaliação da media query adicionando
            // um atributo neutro para os seletores de ícone funcionarem
            html.setAttribute('data-theme', 'system');
        } else {
            html.setAttribute('data-theme', theme);
        }
    }

    // Lê preferência salva; se não houver, começa em 'system'
    const savedTheme = localStorage.getItem(STORAGE_KEY) || 'system';
    applyTheme(savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = localStorage.getItem(STORAGE_KEY) || 'system';
            const nextIndex = (CYCLE.indexOf(current) + 1) % CYCLE.length;
            const next = CYCLE[nextIndex];

            applyTheme(next);
            localStorage.setItem(STORAGE_KEY, next);
        });
    }

    // ==========================================
    // 2. FORMULÁRIO — GOOGLE APPS SCRIPT
    // ==========================================

    /*
     * CONFIGURAÇÃO:
     * 1. Abra Google Sheets e crie uma planilha chamada "SIPOP Contacts"
     * 2. Vá em Extensões > Apps Script e cole o código do arquivo apps-script.gs
     * 3. Implante como Web App (Execute as: Me | Who has access: Anyone)
     * 4. Cole a URL gerada em APPS_SCRIPT_URL dentro de
     *    netlify/functions/submit-form.js (não aqui — o front não fala
     *    mais direto com o Apps Script, veja o porquê abaixo)
     *
     * O front chama /.netlify/functions/submit-form, uma Netlify Function
     * que repassa a submissão pro Apps Script no servidor (server-to-server,
     * sem a limitação de 'no-cors' do browser) e devolve um status real —
     * assim o usuário só vê "enviado com sucesso" quando o lead realmente
     * foi salvo na planilha.
     */

    const FORM_ENDPOINT = '/.netlify/functions/submit-form';

    const form     = document.getElementById('sipop-form');
    const statusEl = document.getElementById('formStatus');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn    = form.querySelector('.btn-submit');
            const originalText = submitBtn.innerText;

            submitBtn.innerText  = 'Sending...';
            submitBtn.disabled   = true;
            statusEl.textContent = '';
            statusEl.className   = 'form-status';

            const phoneCode   = form.phoneCountryCode ? form.phoneCountryCode.value.trim() : '';
            const phoneNumber = form.phone             ? form.phone.value.trim()             : '';
            const fullPhone   = phoneNumber ? [phoneCode, phoneNumber].filter(Boolean).join(' ') : '';

            const data = {
                source:             form.source ? form.source.value : 'Main Website',
                name:               form.name.value,
                email:              form.email.value,
                phone:              fullPhone,
                nationality:        form.nationality        ? form.nationality.value        : '',
                preferredLanguage:  form.preferredLanguage   ? form.preferredLanguage.value   : '',
                specialty:          form.specialty.value,
                careerStage:        form.careerStage    ? form.careerStage.value    : '',
                objectiveType:      form.objectiveType ? form.objectiveType.value : '',
                objective:          form.objective.value,
                utm_source:         form.utm_source   ? form.utm_source.value   : '',
                utm_medium:         form.utm_medium   ? form.utm_medium.value   : '',
                utm_campaign:       form.utm_campaign ? form.utm_campaign.value : '',
                utm_content:        form.utm_content  ? form.utm_content.value  : '',
                timestamp:          new Date().toISOString(),
            };

            try {
                const response = await fetch(FORM_ENDPOINT, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify(data),
                });

                let result = {};
                try {
                    result = await response.json();
                } catch (parseErr) {
                    // resposta sem corpo JSON legível — trata como falha
                }

                if (!response.ok || result.status !== 'success') {
                    throw new Error(result.message || `Request failed (${response.status})`);
                }

                statusEl.textContent = '✓ Message sent successfully. We will get back to you soon.';
                statusEl.className   = 'form-status';

                // Eventos de conversão — Meta Pixel + GA4
                // (só disparam quando o lead realmente foi salvo)
                if (typeof fbq === 'function') {
                    fbq('track', 'Lead', {
                        content_name: data.source,
                        content_category: data.utm_campaign || 'organic',
                    });
                }
                if (typeof gtag === 'function') {
                    gtag('event', 'generate_lead', {
                        event_category: 'Form',
                        event_label:    data.source,
                        utm_source:     data.utm_source,
                        utm_campaign:   data.utm_campaign,
                    });
                }

                form.reset();
                captureUTMs();

            } catch (error) {
                statusEl.textContent = 'Something went wrong and your message was not sent. Please try again or email us directly at contact@sipopscience.com';
                statusEl.className   = 'form-status error';
                console.error('Form error:', error);

            } finally {
                submitBtn.innerText = originalText;
                submitBtn.disabled  = false;
            }
        });
    }

    // ==========================================
    // 3. HEADER — SCROLL BEHAVIOR
    // ==========================================

    const header = document.querySelector('.main-header');

    if (header) {
        // Mantém --header-height sempre igual à altura real do header,
        // já que ela muda (padding 20px → 10px) ao rolar a página.
        // Isso evita que elementos sticky (ex: filtros de publicações
        // e depoimentos) fiquem por baixo do header fixo.
        const syncHeaderHeight = () => {
            document.documentElement.style.setProperty(
                '--header-height',
                `${header.offsetHeight}px`
            );
        };

        syncHeaderHeight();
        window.addEventListener('resize', syncHeaderHeight, { passive: true });

        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                header.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
                header.style.padding   = '10px 0';
            } else {
                header.style.boxShadow = 'none';
                header.style.padding   = '20px 0';
            }
            // padding tem transition de 0.3s — relê a altura antes
            // (chute otimista) e de novo depois que a transição acaba
            syncHeaderHeight();
            setTimeout(syncHeaderHeight, 320);
        }, { passive: true });
    }

    // ==========================================
    // 4. NAV TOGGLE — menu hambúrguer (mobile/tablet)
    // ==========================================

    const navToggle = document.getElementById('navToggle');
    const navMenu    = document.getElementById('navMenu');

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            const isOpen = navMenu.classList.toggle('is-open');
            navToggle.setAttribute('aria-expanded', isOpen);
        });

        // fecha o menu ao clicar num link (útil pros anchors #about, #services etc.)
        navMenu.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('is-open');
                navToggle.setAttribute('aria-expanded', 'false');
            });
        });
    }

    // ==========================================
    // 5. LANGUAGE SWITCHER — fecha ao clicar fora
    // ==========================================

    document.addEventListener('click', (e) => {
        document.querySelectorAll('.lang-switcher[open]').forEach((el) => {
            if (!el.contains(e.target)) el.removeAttribute('open');
        });
    });

});
