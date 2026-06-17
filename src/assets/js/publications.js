/* ============================================
   SIPOP — publications.js
   Filtro interativo de publicações por tipo
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    const filters  = document.querySelectorAll('.pub-filter');
    const cards    = document.querySelectorAll('.pub-card');
    const emptyMsg = document.getElementById('pubEmpty');

    if (!filters.length || !cards.length) return;

    filters.forEach(btn => {
        btn.addEventListener('click', () => {

            // Atualiza botão ativo
            filters.forEach(f => f.classList.remove('active'));
            btn.classList.add('active');

            const selected = btn.dataset.filter;
            let visible = 0;

            cards.forEach(card => {
                const types = card.dataset.type || '';

                const show = selected === 'all' || types.includes(selected);

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
