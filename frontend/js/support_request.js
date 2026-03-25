// Ficheiro: frontend/js/support_request.js
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('supportRequestForm');
    const formView = document.getElementById('formView');
    const successView = document.getElementById('successView');
    const ticketNumberDisplay = document.getElementById('ticketNumberDisplay');
    const isDev = window.location.port === '8184' || window.location.hostname === 'localhost';
    const API_BASE_URL = isDev ? `http://${window.location.hostname}:3000` : '';
    // --- Carregar e Aplicar Configurações Visuais ---
    const applyVisualSettings = (settings) => {
        if (!settings) return;

        const loginLogo = document.getElementById('loginLogo');
        if (loginLogo && settings.login_logo_url) {
            loginLogo.src = `${API_BASE_URL}${settings.login_logo_url}`;
            loginLogo.style.display = 'block';
        }

        const showcasePanel = document.getElementById('loginShowcase');
        if (showcasePanel && settings.background_image_url) {
            showcasePanel.style.backgroundImage = `url('${API_BASE_URL}${settings.background_image_url}')`;
        } else if (settings.login_background_color && showcasePanel) {
            showcasePanel.style.backgroundColor = settings.login_background_color;
        }

        if (settings.login_form_background_color) {
            document.documentElement.style.setProperty('--background-medium', settings.login_form_background_color);
        }
        if (settings.login_font_color) {
            document.documentElement.style.setProperty('--text-primary', settings.login_font_color);
        }
        if (settings.login_button_color) {
            document.documentElement.style.setProperty('--primary-color', settings.login_button_color);
        }
    };

    const fetchSettings = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/settings/general`);
            if (response.ok) {
                const settings = await response.json();
                applyVisualSettings(settings);
            }
        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
        }
    };

    fetchSettings();

    // --- Lógica do Formulário ---
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitButton = form.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            
            submitButton.disabled = true;
            submitButton.textContent = 'A enviar...';

            // Coleta dados do formulário
            const formData = {
                name: document.getElementById('name').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                sector: document.getElementById('sector').value,
                location: document.getElementById('location').value,
                title: document.getElementById('title').value,
                message: document.getElementById('message').value
            };

            try {
                const response = await fetch(`${API_BASE_URL}/api/public/tickets`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                const data = await response.json();
                if (response.ok) {
                    ticketNumberDisplay.textContent = `#${data.data.ticketNumber}`;
                    formView.style.display = 'none';
                    successView.style.display = 'block';
                } else {
                    throw new Error(data.message || 'Erro ao criar ticket.');
                }
            } catch (error) {
                showNotification(error.message, 'error');
                submitButton.disabled = false;
                submitButton.textContent = originalText;
            }
        });
    }
});