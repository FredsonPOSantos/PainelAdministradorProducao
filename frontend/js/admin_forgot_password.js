document.addEventListener('DOMContentLoaded', () => {
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
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
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitButton = forgotPasswordForm.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'A enviar...';

            const email = document.getElementById('email').value;

            try {
                const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await response.json();

                if (response.ok) {
                    showNotification(data.message || 'Se o e-mail existir, você receberá instruções.', 'success');
                    forgotPasswordForm.reset();
                } else {
                    throw new Error(data.message || 'Erro ao solicitar recuperação.');
                }
            } catch (error) {
                showNotification(error.message, 'error');
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Enviar Instruções';
            }
        });
    }
});