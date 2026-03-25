// Ficheiro: frontend/js/admin_profile.js

if (window.initProfilePage) {
    console.warn("Tentativa de carregar admin_profile.js múltiplas vezes.");
} else {
    window.initProfilePage = () => {

        // --- Elementos do DOM ---
        const profileNameDisplay = document.getElementById('profileNameDisplay');
        const profileRoleDisplay = document.getElementById('profileRoleDisplay');
        const profileAvatarDisplay = document.getElementById('profileAvatarDisplay');
        document.getElementById('pageTitle').textContent = 'Meu Perfil'; // [NOVO] Garante o título correto
        
        const profileNameInput = document.getElementById('profileNameInput');
        const profileEmailInput = document.getElementById('profileEmailInput');
        const profilePhoneInput = document.getElementById('profilePhoneInput');
        const profileSectorInput = document.getElementById('profileSectorInput');
        
        const btnEditProfile = document.getElementById('btnEditProfile');
        const editButtons = document.getElementById('editButtons');
        const btnCancelProfile = document.getElementById('btnCancelProfile');
        const btnSaveProfile = document.getElementById('btnSaveProfile');
        const profileDataForm = document.getElementById('profileDataForm');
        const changePasswordForm = document.getElementById('changePasswordForm'); // [NOVO]
        
        const avatarUpload = document.getElementById('avatarUpload');
        const editAvatarBtn = document.querySelector('.edit-avatar-btn');
        const dynamicThemesContainer = document.getElementById('dynamicThemesContainer');

        let originalData = {}; // Cache para restaurar dados ao cancelar

        // --- Definição dos Temas e Cores para Preview ---
        const themes = [
            { id: 'default', name: 'Padrão do Sistema', colors: { bg: '#1c033f', sidebar: '#13012d', primary: '#d507e4' } },
            { id: 'light', name: 'Claro (Light)', colors: { bg: '#f3f4f6', sidebar: '#ffffff', primary: '#2563eb' } },
            { id: 'vscode', name: 'VSCode Dark', colors: { bg: '#1e1e1e', sidebar: '#252526', primary: '#007acc' } },
            { id: 'gray', name: 'Escuro Suave', colors: { bg: '#37474f', sidebar: '#263238', primary: '#607d8b' } },
            { id: 'oceano', name: 'Oceano (Dark)', colors: { bg: '#01023f', sidebar: '#00507c', primary: '#007a93' } },
            { id: 'teal', name: 'Verde Piscina', colors: { bg: '#ebf7f6', sidebar: '#005143', primary: '#009e8e' } },
            { id: 'contrast', name: 'Alto Contraste', colors: { bg: '#000000', sidebar: '#000000', primary: '#ffff00' } },
            { id: 'windows11', name: 'Windows 11', colors: { bg: '#1c1c1c', sidebar: '#323232', primary: '#0078d4' } },
            { id: 'linux', name: 'Linux (Ubuntu)', colors: { bg: '#300A24', sidebar: '#2C001E', primary: '#E95420' } },
            { id: 'bluelight', name: 'Filtro Azul', colors: { bg: '#211f1c', sidebar: '#1a1815', primary: '#D97706' } },
            { id: 'rota-padrao', name: 'Rota Transportes (Padrão)', colors: { bg: '#1a202c', sidebar: '#1a202c', primary: '#dc335c' } },
            { id: 'rota-roxo', name: 'Rota Transportes (Roxo)', colors: { bg: '#3D3175', sidebar: '#3D3175', primary: '#CC003E' } },
            { id: 'cidade-sol-azul', name: 'Cidade Sol (Azul)', colors: { bg: '#728EB6', sidebar: '#1a202c', primary: '#F7DB16' } },
            { id: 'cidade-sol-amarelo', name: 'Cidade Sol (Amarelo)', colors: { bg: '#fff9c4', sidebar: '#fbc02d', primary: '#45637A' } },
            { id: 'expresso-amarelo', name: 'Expresso BR (Amarelo)', colors: { bg: '#45637A', sidebar: '#45637A', primary: '#F7DB17' } },
            { id: 'expresso-azul', name: 'Expresso BR (Azul)', colors: { bg: '#44647c', sidebar: '#44647c', primary: '#f4dc15' } },
            { id: 'sunset', name: 'Pôr do Sol', colors: { bg: '#2d1b2e', sidebar: '#2d1b2e', primary: '#ff6b6b' } },
            { id: 'abyss', name: 'Abyss (VSCode)', colors: { bg: '#000c18', sidebar: '#000c18', primary: '#77088d' } },
            { id: 'kimbie', name: 'Kimbie (VSCode)', colors: { bg: '#221a0f', sidebar: '#221a0f', primary: '#dc3958' } },
            { id: 'cs-padrao', name: 'CS (Padrão)', colors: { bg: '#004557', sidebar: '#004557', primary: '#f3d916' } },
            { id: 'rt-padrao', name: 'RT (Padrão)', colors: { bg: '#ffffff', sidebar: '#6c5c9d', primary: '#ec258e' } },
            { id: 'eb-padrao', name: 'EB (Padrão)', colors: { bg: '#ffffff', sidebar: '#28345c', primary: '#f7db17' } }
        ];

        // --- Funções Auxiliares ---

        // Atualiza a interface do Avatar (Imagem ou Iniciais)
        const updateAvatarUI = (url, name) => {
            if (url) {
            const isDev = window.location.port === '8184' || window.location.hostname === 'localhost';
            profileAvatarDisplay.innerHTML = `<img src="${isDev ? `http://${window.location.hostname}:3000` : ''}${url}" alt="Avatar" onerror="this.style.display='none'; this.parentElement.innerHTML='<span>ERRO</span>'">`;
            } else {
                const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'US';
                profileAvatarDisplay.innerHTML = `<span id="profileInitials">${initials}</span>`;
            }
        };

        // Aplica o tema ao corpo da página
        const applyTheme = (theme) => {
            // Remove todas as classes de tema conhecidas
            document.body.classList.remove('theme-rota-padrao', 'theme-rota-roxo', 'theme-cidade-sol-azul', 'theme-cidade-sol-amarelo', 'theme-expresso-amarelo', 'theme-expresso-azul', 'theme-oceano', 'theme-light', 'theme-contrast', 'theme-teal', 'theme-gray', 'theme-vscode', 'theme-windows11', 'theme-linux', 'theme-bluelight', 'theme-sunset', 'theme-abyss', 'theme-kimbie', 'theme-cs-padrao', 'theme-rt-padrao', 'theme-eb-padrao');
            
            // Adiciona a classe se não for o padrão
            if (theme && theme !== 'default') {
                document.body.classList.add(`theme-${theme}`);
            }
        };

        // Gera os cartões de tema dinamicamente
        const renderThemeOptions = () => {
            if (!dynamicThemesContainer) return;
            
            dynamicThemesContainer.innerHTML = themes.map(t => `
                <label class="theme-option">
                    <input type="radio" name="theme" value="${t.id}">
                    <div class="theme-preview" style="background-color: ${t.colors.bg};">
                        <div style="height: 100%; display: flex;">
                            <div style="width: 25%; background-color: ${t.colors.sidebar}; border-right: 1px solid rgba(255,255,255,0.1);"></div>
                            <div style="flex: 1; padding: 5px;">
                                <div style="height: 8px; width: 40%; background-color: ${t.colors.primary}; border-radius: 2px; margin-bottom: 4px;"></div>
                                <div style="height: 4px; width: 80%; background-color: rgba(255,255,255,0.2); border-radius: 2px;"></div>
                            </div>
                        </div>
                    </div>
                    <span>${t.name}</span>
                </label>
            `).join('');

            // Adiciona listeners aos novos radios
            document.querySelectorAll('input[name="theme"]').forEach(radio => {
                radio.addEventListener('change', handleThemeChange);
            });
        };

        // --- Lógica de Negócio ---

        const loadProfileData = async () => {
            try {
                const response = await apiRequest('/api/admin/profile');
                if (!response.success) throw new Error(response.message);
                const user = response.data;

                // Preenche a UI
                if (profileNameDisplay) profileNameDisplay.textContent = user.name || user.username || 'Administrador';
                if (profileRoleDisplay) profileRoleDisplay.textContent = user.role || 'N/A';
                updateAvatarUI(user.avatar_url, user.name || user.username);

                // Preenche o Formulário
                if (profileNameInput) profileNameInput.value = user.name || '';
                if (profileEmailInput) profileEmailInput.value = user.email || '';
                if (profilePhoneInput) profilePhoneInput.value = user.phone || '';
                if (profileSectorInput) profileSectorInput.value = user.sector || '';

                // Define o Tema Selecionado
                const currentTheme = user.theme_preference || 'default'; // [MODIFICADO] Volta para o padrão do sistema
                const themeRadio = document.querySelector(`input[name="theme"][value="${currentTheme}"]`);
                if (themeRadio) themeRadio.checked = true;
                applyTheme(currentTheme);

                // Guarda dados originais para cancelar edição
                originalData = {
                    name: user.name || '',
                    phone: user.phone || '',
                    sector: user.sector || ''
                };

            } catch (error) {
                console.error("Erro ao carregar perfil:", error);
                showNotification("Erro ao carregar dados do perfil.", "error");
            }
        };

        const handleThemeChange = async (e) => {
            const newTheme = e.target.value;
            applyTheme(newTheme); // Aplica visualmente na hora (feedback instantâneo)

            try {
                // Salva a preferência no backend
                await apiRequest('/api/admin/profile/theme', 'PUT', { theme: newTheme });
                // Atualiza o perfil local
                if (window.currentUserProfile) window.currentUserProfile.theme_preference = newTheme;
            } catch (error) {
                console.error("Erro ao salvar tema:", error);
                showNotification("Erro ao salvar preferência de tema.", "warning");
            }
        };

        const handleAvatarUpload = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('avatar', file);

            try {
                showNotification('A enviar imagem...', 'info');
                const response = await apiRequest('/api/admin/profile/avatar', 'POST', formData);
                
                if (response.success) {
                    updateAvatarUI(response.data.avatar_url, originalData.name);
                    showNotification('Foto de perfil atualizada!', 'success');
                    // Atualiza o avatar no cabeçalho principal também, se existir
                    const headerAvatar = document.getElementById('headerUserAvatar');
                const isDev = window.location.port === '8184' || window.location.hostname === 'localhost';
                if (headerAvatar) headerAvatar.src = `${isDev ? `http://${window.location.hostname}:3000` : ''}${response.data.avatar_url}`;
                }
            } catch (error) {
                showNotification(`Erro no upload: ${error.message}`, 'error');
            }
        };

        const handleProfileUpdate = async (e) => {
            e.preventDefault();
            btnSaveProfile.disabled = true;
            btnSaveProfile.textContent = 'A guardar...';

            const updatedData = {
                name: profileNameInput.value,
                phone: profilePhoneInput.value,
                sector: profileSectorInput.value
            };

            try {
                const response = await apiRequest('/api/admin/profile', 'PUT', updatedData);
                
                if (response.success) {
                    showNotification('Perfil atualizado com sucesso!', 'success');
                    originalData = { ...updatedData };
                    if (profileNameDisplay) profileNameDisplay.textContent = updatedData.name;
                    
                    // Atualiza nome no cabeçalho principal
                    const headerName = document.getElementById('userFirstName');
                    if (headerName) headerName.textContent = updatedData.name.split(' ')[0];

                    // Sai do modo de edição
                    btnCancelProfile.click();
                }
            } catch (error) {
                showNotification(`Erro ao atualizar: ${error.message}`, 'error');
            } finally {
                btnSaveProfile.disabled = false;
                btnSaveProfile.textContent = 'Salvar Alterações';
            }
        };

        // [NOVO] Lógica para alterar senha
        const handleChangePassword = async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const submitBtn = changePasswordForm.querySelector('button[type="submit"]');

            submitBtn.disabled = true;
            submitBtn.textContent = 'A atualizar...';

            try {
                const response = await apiRequest('/api/admin/profile/change-own-password', 'POST', {
                    currentPassword,
                    newPassword
                });

                if (response.success) {
                    showNotification('Senha alterada com sucesso!', 'success');
                    changePasswordForm.reset();
                }
            } catch (error) {
                showNotification(`Erro: ${error.message}`, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Atualizar Senha';
            }
        };

        // --- Listeners de Eventos ---

        if (btnEditProfile) {
            btnEditProfile.addEventListener('click', () => {
                btnEditProfile.classList.add('hidden');
                editButtons.classList.remove('hidden');
                editButtons.style.display = 'flex';
                
                [profileNameInput, profilePhoneInput, profileSectorInput].forEach(input => {
                    if (input) {
                        input.removeAttribute('readonly');
                        input.style.border = '1px solid var(--primary-color)';
                    }
                });
            });
        }

        if (btnCancelProfile) {
            btnCancelProfile.addEventListener('click', () => {
                btnEditProfile.classList.remove('hidden');
                editButtons.classList.add('hidden');
                editButtons.style.display = 'none';

                // Restaura valores
                if (profileNameInput) profileNameInput.value = originalData.name;
                if (profilePhoneInput) profilePhoneInput.value = originalData.phone;
                if (profileSectorInput) profileSectorInput.value = originalData.sector;

                [profileNameInput, profilePhoneInput, profileSectorInput].forEach(input => {
                    if (input) {
                        input.setAttribute('readonly', true);
                        input.style.border = '';
                    }
                });
            });
        }

        if (profileDataForm) profileDataForm.addEventListener('submit', handleProfileUpdate);
        
        if (editAvatarBtn && avatarUpload) {
            editAvatarBtn.addEventListener('click', () => avatarUpload.click());
            avatarUpload.addEventListener('change', handleAvatarUpload);
        }

        // [NOVO] Listener para o formulário de senha
        if (changePasswordForm) {
            changePasswordForm.addEventListener('submit', handleChangePassword);
        }

        // --- Inicialização ---
        renderThemeOptions();
        loadProfileData();
    };
}
