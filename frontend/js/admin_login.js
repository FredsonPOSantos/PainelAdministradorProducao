// Ficheiro: frontend/js/admin_login.js
// Contém a lógica para o login

document.addEventListener('DOMContentLoaded', () => {

    // --- Seletores de Elementos ---
    const adminLoginForm = document.getElementById('adminLoginForm');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    
    // Define dinamicamente a URL base (dev vs prod)
    const isDev = window.location.port === '8184' || window.location.hostname === 'localhost';
    const API_BASE_URL = isDev ? `http://${window.location.hostname}:3000` : '';

    // --- Lógica do Banner de Atualização ---
    const updateBanner = document.getElementById('updateBanner');
    const closeBannerBtn = document.getElementById('closeUpdateBanner');
    const updateKey = 'dismissed_update_14_7_0_v4'; // Chave atualizada para exibir o banner com data e hora corrigidas
    
    if (updateBanner && !localStorage.getItem(updateKey)) {
        updateBanner.classList.remove('hidden');
    }

    if (closeBannerBtn) {
        closeBannerBtn.addEventListener('click', () => {
            updateBanner.classList.add('hidden');
            localStorage.setItem(updateKey, 'true'); // Grava que o utilizador já viu
        });
    }

    // --- Lógica de Login ---
    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitButton = adminLoginForm.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'A processar...';

            const email = e.target.email.value;
            const password = e.target.senha.value;

            try {
                const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    // Se o backend enviar a mensagem específica, mostre-a.
                    if (data.code === 'USER_NOT_FOUND') {
                        showNotification(data.message, 'info', 10000); // Mostra por 10 segundos
                        throw new Error(data.message); // Interrompe o fluxo, mas a notificação já foi mostrada
                    }
                    throw new Error(data.message || 'Erro desconhecido');
                }

                // Sucesso! Guarda o token e redireciona
                localStorage.setItem('adminToken', data.token);
                window.location.href = 'admin_dashboard.html';

            } catch (error) {
                // Evita mostrar a notificação de erro padrão se a notificação personalizada já foi exibida
                if (error.message.includes('Usuário não cadastrado')) {
                    // A notificação já foi mostrada, apenas logamos o erro no console.
                    console.warn('Tentativa de login com usuário não cadastrado.');
                } else {
                    showNotification(`Erro: ${error.message}`, 'error');
                }
                submitButton.disabled = false;
                submitButton.textContent = 'Entrar';
            }
        });
    }

    // --- Lógica do Link de Recuperação de Senha ---
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            // Redireciona para a página de solicitação de recuperação
            window.location.href = 'admin_forgot_password.html'; 
        });
    }

    // --- Carregar e Aplicar Configurações Visuais ---
    const applyLoginVisualSettings = (settings) => {
        if (!settings) return;

        const loginLogo = document.getElementById('loginLogo');
        if (loginLogo && settings.login_logo_url) {
            loginLogo.src = `${API_BASE_URL}${settings.login_logo_url}`;
            loginLogo.style.display = 'block';
        }

        const companyNameElement = document.getElementById('companyNameLogin');
        if (companyNameElement && settings.company_name) {
            companyNameElement.textContent = settings.company_name;
        }

        const showcasePanel = document.getElementById('loginShowcase');

        // Prioriza a imagem de fundo sobre a cor de fundo
        if (showcasePanel && settings.background_image_url) {
            showcasePanel.style.backgroundImage = `url('${API_BASE_URL}${settings.background_image_url}')`;
        } else if (settings.login_background_color) {
            // Se não houver imagem, aplica a cor de fundo ao painel esquerdo
            if (showcasePanel) showcasePanel.style.backgroundColor = settings.login_background_color;
        }

        if (settings.login_form_background_color) {
            document.documentElement.style.setProperty('--background-medium', settings.login_form_background_color);
        }
        if (settings.login_font_color) {
            document.documentElement.style.setProperty('--text-primary', settings.login_font_color);
        }
        if (settings.login_button_color) {
            document.documentElement.style.setProperty('--primary-color', settings.login_button_color);
        } else if (settings.primary_color) {
            document.documentElement.style.setProperty('--primary-color', settings.primary_color);
        }
    };

    const fetchAndApplySettings = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/settings/general`);
            if (response.ok) {
                const settings = await response.json();
                applyLoginVisualSettings(settings);
            }
        } catch (error) {
            console.error('Erro ao buscar configurações de aparência do login:', error);
        }
    };

    fetchAndApplySettings();
});
