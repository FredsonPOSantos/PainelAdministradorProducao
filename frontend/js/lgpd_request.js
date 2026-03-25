// Ficheiro: frontend/js/lgpd_request.js

document.addEventListener('DOMContentLoaded', () => {
    const lgpdRequestForm = document.getElementById('lgpdRequestForm');
    const requestView = document.getElementById('requestView');
    const resultView = document.getElementById('resultView');
    const resultMessage = document.getElementById('resultMessage');
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

    if (lgpdRequestForm) {
        lgpdRequestForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitButton = lgpdRequestForm.querySelector('button[type="submit"]');
            const fullName = document.getElementById('fullName').value;
            const email = document.getElementById('userEmail').value;
            const termsCheckbox = document.getElementById('termsCheckbox');

            if (!termsCheckbox.checked) {
                showNotification('Deve declarar que está ciente dos termos para continuar.', 'warning');
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = 'A enviar...';

            try {
                const response = await fetch(`${API_BASE_URL}/api/lgpd/request-exclusion`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fullName, email })
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.message || 'Ocorreu um erro ao enviar o seu pedido.');
                }

                // Sucesso
                if (requestView) requestView.style.display = 'none';
                if (resultView) resultView.style.display = 'block';
                if (resultMessage) resultMessage.textContent = data.message;
            } catch (error) {
                showNotification(`Erro: ${error.message}`, 'error');
                submitButton.disabled = false;
                submitButton.textContent = 'Enviar Pedido';
            }
        });
    }
});