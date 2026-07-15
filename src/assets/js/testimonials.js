/* ============================================
   SIPOP — testimonials.js
   Filtro interativo de depoimentos por perfil
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    const filters  = document.querySelectorAll('.test-filter');
    const cards    = document.querySelectorAll('.test-card');
    const emptyMsg = document.getElementById('testEmpty');

    if (!filters.length || !cards.length) return;

    filters.forEach(btn => {
        btn.addEventListener('click', () => {

            // Atualiza botão ativo
            filters.forEach(f => f.classList.remove('active'));
            btn.classList.add('active');

            const selected = btn.dataset.filter;
            let visible = 0;

            cards.forEach(card => {
                const category = card.dataset.category || '';

                const show = selected === 'all' || category === selected;

                if (show) {
                    card.classList.remove('hidden');
                    visible++;
                } else {
                    card.classList.add('hidden');
                }
            });

            // Mostra mensagem se nenhum card visível
            if (emptyMsg) {
                emptyMsg.style.display = visible === 0 ? 'block' : 'none';
            }
        });
    });

});
