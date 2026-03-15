document.addEventListener('DOMContentLoaded', () => {
    const sipopForm = document.getElementById('sipop-form');

    // 1. Validação e Envio do Formulário
    if (sipopForm) {
        sipopForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = sipopForm.querySelector('.btn-submit');
            const originalText = submitBtn.innerText;
            const formData = new FormData(sipopForm);

            submitBtn.innerText = 'Sending...';
            submitBtn.disabled = true;

            try {
                const response = await fetch(sipopForm.action, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                if (response.ok) {
                    alert('Thank you! Your message has been sent to the SIPOP team.');
                    sipopForm.reset();
                } else {
                    alert('Oops! There was a problem submitting your form.');
                }
            } catch (error) {
                alert('Error connecting to the server. Please try again later.');
            } finally {
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // 2. Mudança de estilo do Header ao rolar a página
    const header = document.querySelector('.main-header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
            header.style.padding = '10px 0';
        } else {
            header.style.boxShadow = 'none';
            header.style.padding = '20px 0';
        }
    });
});