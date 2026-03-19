// Ficheiro: frontend/js/admin_settings.js
// [VERSÃO 14.2 - INICIALIZAÇÃO ROBUSTA]

let originalPermissionsState = {}; // Mantém esta variável global para o estado das permissões

window.initSettingsPage = () => {
    // [CORRIGIDO] Move a verificação para dentro e usa uma variável local ou de escopo mais restrito.
    // A melhor abordagem é simplesmente permitir a reinicialização.
    console.log("A inicializar a página de Configurações (V14.3 - Reinicialização)...");

    let initialAppearanceSettings = {}; // Armazena o estado inicial das configurações de aparência

    // --- Seletores de Elementos ---
        const unifiedAppearanceForm = document.getElementById('unifiedAppearanceForm');
        const removeBackgroundBtn = document.getElementById('removeBackground');
        const smtpSettingsForm = document.getElementById('smtpSettingsForm'); // [NOVO] Seletor para o novo formulário
        const notificationSettingsForm = document.getElementById('notificationSettingsForm'); // [NOVO]
        const removeLoginLogoBtn = document.getElementById('removeLoginLogo');
        const backgroundUploadInput = document.getElementById('backgroundUpload');
        const loginBgColorInput = document.getElementById('loginBackgroundColor');
        const tabLinks = document.querySelectorAll('.tab-nav .tab-link');
        const tabContents = document.querySelectorAll('.tab-content-container .tab-content');
        const resetAppearanceBtn = document.getElementById('resetAppearanceBtn');

        // --- Elementos da Aba de Permissões (NOVO LAYOUT) ---
        const permissionsGridContainer = document.getElementById('permissionsGridContainer');
        const permissionsError = document.getElementById('permissionsError');
        const permHelpTextMaster = document.getElementById('permHelpTextMaster');
        const permHelpTextDPO = document.getElementById('permHelpTextDPO');
        const permSaveChangesContainer = document.getElementById('permSaveChangesContainer');
        const permSaveChangesBtn = document.getElementById('permSaveChangesBtn');
        const permSaveStatus = document.getElementById('permSaveStatus');
 
        // [NOVO] Elementos da Aba de Políticas
        const viewTermsBtn = document.getElementById('viewTermsBtn');
        const viewMarketingPolicyBtn = document.getElementById('viewMarketingPolicyBtn');
        const policyModal = document.getElementById('policyModal');
        const policyModalTitle = document.getElementById('policyModalTitle');
        const policyViewer = document.getElementById('policyViewer');
        const policyEditor = document.getElementById('policyEditor');
        const policyModalActions = document.getElementById('policyModalActions');
        const policyContentField = document.getElementById('policyContentField');
        const policyTypeField = document.getElementById('policyTypeField');
        const policyEditForm = document.getElementById('policyEditForm');

        // [NOVO] Elementos do Modal de Perfis
        const roleModal = document.getElementById('roleModal');
        const roleForm = document.getElementById('roleForm');
        const roleModalTitle = document.getElementById('roleModalTitle');
        const roleNameInput = document.getElementById('roleName');
        const roleSlugInput = document.getElementById('roleSlug');
        const roleSlugGroup = document.getElementById('roleSlugGroup');
        const roleDescriptionInput = document.getElementById('roleDescription');
        const roleSlugOriginalInput = document.getElementById('roleSlugOriginal');

        // [NOVO] Elementos da Aba de Arquivos
        const mediaTypeSelect = document.getElementById('mediaTypeSelect');
        const refreshMediaBtn = document.getElementById('refreshMediaBtn');
        const archiveMediaBtn = document.getElementById('archiveMediaBtn'); // [NOVO]
        const mediaGallery = document.getElementById('mediaGallery');

        // --- LÓGICA DA ABA DE PERMISSÕES (REFEITA) ---

        const handleSavePermissions = async () => {
            if (!permSaveChangesBtn) return;
            if (permSaveStatus) permSaveStatus.textContent = 'A guardar...';
            permSaveChangesBtn.disabled = true;

            const changes = [];
            const checkboxes = permissionsGridContainer.querySelectorAll('input[type="checkbox"]');

            checkboxes.forEach(box => {
                const key = `${box.dataset.role}|${box.dataset.permission}`;
                if (box.checked !== originalPermissionsState[key]) {
                    changes.push({
                        role: box.dataset.role,
                        permission: box.dataset.permission,
                        checked: box.checked
                    });
                }
            });

            if (changes.length === 0) {
                if (permSaveStatus) permSaveStatus.textContent = 'Nenhuma alteração detetada.';
                permSaveChangesBtn.disabled = false;
                setTimeout(() => { if (permSaveStatus) permSaveStatus.textContent = ''; }, 3000);
                return;
            }

            try {
                const response = await apiRequest('/api/permissions/update-batch', 'POST', { changes });
                // [MELHORIA] Usa o sistema de notificações para uma mensagem mais agradável.
                showNotification(response.message || 'Permissões atualizadas com sucesso!', 'success');
                // Atualiza o estado original para o novo estado salvo
                changes.forEach(change => {
                    originalPermissionsState[`${change.role}|${change.permission}`] = change.checked;
                });
            } catch (error) {
                showNotification(`Erro ao guardar permissões: ${error.message}`, 'error');
            } finally {
                permSaveChangesBtn.disabled = false;
                setTimeout(() => { if (permSaveStatus) { permSaveStatus.textContent = ''; permSaveStatus.style.color = ''; } }, 4000);
            }
        };

        // --- Lógica de Abas ---
        const switchTab = (targetTabId) => {
            if (!targetTabId) return;
            tabContents.forEach(c => c.classList.remove('active'));
            tabLinks.forEach(l => l.classList.remove('active'));
            const targetContent = document.getElementById(targetTabId);
            const targetLink = document.querySelector(`.tab-nav .tab-link[data-tab="${targetTabId}"]`);
            if (targetContent) targetContent.classList.add('active');
            if (targetLink) targetLink.classList.add('active');
        };

        // --- Lógica de Reset ---
        const handleResetAppearance = async () => {
            const confirmed = await showConfirmationModal(
                'Tem a certeza de que deseja repor TODAS as configurações de aparência para os valores predefinidos? Esta ação não pode ser desfeita.',
                'Repor Predefinições de Aparência'
            );

            if (!confirmed) {
                showNotification('A operação foi cancelada.', 'info');
                return;
            }

            try {
                const result = await apiRequest('/api/settings/appearance/reset', 'PUT');
                if (result.success) {
                    showNotification('As configurações de aparência foram repostas com sucesso.', 'success');
                    // Recarrega as configurações para atualizar o formulário e aplicar os estilos
                    await loadGeneralSettings();
                } else {
                    showNotification(result.message || 'Não foi possível repor as configurações.', 'error');
                }
            } catch (error) {
                showNotification(`Erro ao repor as configurações: ${error.message}`, 'error');
            }
        };

        // [NOVO] Função para criar um novo perfil (Role)
        const handleCreateRole = () => {
            roleForm.reset();
            roleSlugOriginalInput.value = '';
            roleModalTitle.textContent = 'Criar Novo Perfil';
            roleSlugGroup.style.display = 'block'; // Mostra slug na criação
            roleSlugInput.required = true;
            roleSlugInput.disabled = false;
            roleModal.classList.remove('hidden');
        };

        // [NOVO] Função para editar nome do perfil
        const handleEditRole = (slug, currentName, currentDescription) => {
            roleForm.reset();
            roleSlugOriginalInput.value = slug;
            roleModalTitle.textContent = 'Editar Perfil';
            roleNameInput.value = currentName;
            roleSlugInput.value = slug;
            roleDescriptionInput.value = currentDescription || '';
            
            roleSlugGroup.style.display = 'none'; // Esconde slug na edição (não editável)
            roleSlugInput.required = false;
            
            roleModal.classList.remove('hidden');
        };

        // [NOVO] Handler para submissão do formulário de perfil
        const handleRoleFormSubmit = async (e) => {
            e.preventDefault();
            const isEdit = !!roleSlugOriginalInput.value;
            const name = roleNameInput.value;
            const description = roleDescriptionInput.value;
            const slug = isEdit ? roleSlugOriginalInput.value : roleSlugInput.value;
            const submitBtn = roleForm.querySelector('button[type="submit"]');

            submitBtn.disabled = true;
            submitBtn.textContent = 'A guardar...';

            try {
                let response;
                if (isEdit) {
                    response = await apiRequest(`/api/roles/${slug}`, 'PUT', { name, description });
                } else {
                    response = await apiRequest('/api/roles', 'POST', { name, slug, description });
                }

                if (response.success) {
                    showNotification(response.message || 'Operação realizada com sucesso!', 'success');
                    roleModal.classList.add('hidden');
                    loadPermissionsMatrix();
                }
            } catch (error) {
                showNotification(`Erro: ${error.message}`, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Salvar';
            }
        };

        const renderPermissionsGrid = (matrixData, selectedRole, isMaster) => {
            const grid = permissionsGridContainer.querySelector('.permissions-grid');
            if (!grid) return;

            grid.innerHTML = '';
            originalPermissionsState = {}; // Limpa o estado ao renderizar

            const groups = matrixData.permissions.reduce((acc, p) => {
                acc[p.feature_name] = acc[p.feature_name] || [];
                acc[p.feature_name].push(p);
                return acc;
            }, {});

            for (const featureName in groups) {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'permission-group';

                const title = document.createElement('h4');
                title.textContent = featureName;
                groupDiv.appendChild(title);

                groups[featureName].forEach(permission => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'permission-item';

                    const permissionKey = permission.permission_key;
                    const isChecked = matrixData.assignments[selectedRole]?.[permissionKey] === true;
                    const stateKey = `${selectedRole}|${permissionKey}`;
                    originalPermissionsState[stateKey] = isChecked;

                    if (isMaster) {
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.id = `perm-${stateKey}`;
                        checkbox.checked = isChecked;
                        checkbox.dataset.role = selectedRole;
                        checkbox.dataset.permission = permissionKey;

                        if (permissionKey.startsWith('lgpd.')) {
                            checkbox.disabled = true;
                        }

                        const label = document.createElement('label');
                        label.htmlFor = checkbox.id;
                        label.textContent = permission.action_name;

                        itemDiv.appendChild(checkbox);
                        itemDiv.appendChild(label);
                    } else {
                        itemDiv.innerHTML = `<span class="permission-readonly ${isChecked ? 'allowed' : ''}">${isChecked ? '✓' : '—'}</span> <span>${permission.action_name}</span>`;
                    }
                    groupDiv.appendChild(itemDiv);
                });
                grid.appendChild(groupDiv);
            }
        };

        const loadPermissionsMatrix = async () => {
            if (!permissionsGridContainer) return false;
            if (permissionsError) permissionsError.textContent = '';
            permissionsGridContainer.innerHTML = '<p>A carregar...</p>';

            const role = window.currentUserProfile?.role;
            if (role !== 'master' && role !== 'DPO') {
                permissionsGridContainer.innerHTML = '<p>Acesso negado.</p>';
                return false;
            }

            const isMaster = (role === 'master');
            if (permHelpTextMaster) permHelpTextMaster.style.display = isMaster ? 'block' : 'none';
            if (permHelpTextDPO) permHelpTextDPO.style.display = !isMaster ? 'block' : 'none';

            try {
                const response = await apiRequest('/api/permissions/matrix');
                // [CORRIGIDO] Torna a verificação mais robusta, aceitando o objeto de dados diretamente ou dentro de uma propriedade 'data'.
                const matrixData = response.data || response;
                if (!matrixData || !matrixData.roles || !matrixData.permissions) {
                    throw new Error(response.message || "Dados da matriz de permissões estão incompletos ou em formato inválido.");
                }
                permissionsGridContainer.innerHTML = ''; // Limpa o "A carregar..."

                // Cria o seletor de Role
                const header = document.createElement('div');
                header.className = 'permissions-header';
                const inputGroup = document.createElement('div');
                inputGroup.className = 'input-group';
                inputGroup.style.display = 'flex'; // Alinha itens na horizontal
                inputGroup.style.alignItems = 'flex-end'; // Alinha com a base do input
                inputGroup.style.gap = '10px';

                const label = document.createElement('label');
                label.htmlFor = 'permissionRoleSelect';
                label.textContent = 'Selecione a Função para Editar';
                const select = document.createElement('select');
                select.id = 'permissionRoleSelect';
                select.style.marginBottom = '0'; // Remove margem inferior para alinhar com botão
                select.style.flexGrow = '1';

                // [ATUALIZADO] Agora 'role' é um objeto { slug, name, is_system }
                matrixData.roles.forEach(role => {
                    if (role.slug !== 'master') { // Master não pode ser editado
                        const option = document.createElement('option');
                        option.value = role.slug;
                        option.textContent = role.name;
                        option.dataset.isSystem = role.is_system; // Guarda info se é sistema
                        option.dataset.description = role.description || ''; // [NOVO] Guarda descrição
                        select.appendChild(option);
                    }
                });
                
                // Container para o label e select
                const selectWrapper = document.createElement('div');
                selectWrapper.style.flexGrow = '1';
                selectWrapper.style.display = 'flex';
                selectWrapper.style.flexDirection = 'column';
                selectWrapper.appendChild(label);
                selectWrapper.appendChild(select);

                // Container para botões
                const btnGroup = document.createElement('div');
                btnGroup.style.display = 'flex';
                btnGroup.style.gap = '10px';

                // Botão de criar novo perfil
                const btnCreate = document.createElement('button');
                btnCreate.className = 'btn-secondary';
                btnCreate.innerHTML = '<i class="fas fa-plus"></i> Novo Perfil';
                btnCreate.title = "Criar novo perfil personalizado";
                btnCreate.style.height = '42px'; // Altura para combinar com o input
                btnCreate.onclick = handleCreateRole;

                // [NOVO] Botão de editar perfil
                const btnEdit = document.createElement('button');
                btnEdit.className = 'btn-secondary';
                btnEdit.innerHTML = '<i class="fas fa-pencil-alt"></i>';
                btnEdit.title = "Editar nome do perfil";
                btnEdit.style.height = '42px';
                btnEdit.onclick = () => {
                    const selectedOption = select.options[select.selectedIndex];
                    handleEditRole(select.value, selectedOption.text, selectedOption.dataset.description);
                };

                // [NOVO] Botão de excluir perfil
                const btnDelete = document.createElement('button');
                btnDelete.className = 'btn-delete'; // Usa classe de erro/perigo
                btnDelete.innerHTML = '<i class="fas fa-trash"></i>';
                btnDelete.title = "Excluir perfil selecionado";
                btnDelete.style.height = '42px';
                btnDelete.style.display = 'none'; // Escondido por padrão
                btnDelete.onclick = () => handleDeleteRole(select.value, select.options[select.selectedIndex].text);

                btnGroup.appendChild(btnCreate);
                btnGroup.appendChild(btnEdit); // Adiciona o botão de editar
                btnGroup.appendChild(btnDelete);

                inputGroup.appendChild(selectWrapper);
                inputGroup.appendChild(btnGroup);

                header.appendChild(inputGroup);
                permissionsGridContainer.appendChild(header);

                // Cria a grid
                const grid = document.createElement('div');
                grid.className = 'permissions-grid';
                permissionsGridContainer.appendChild(grid);

                // Função para atualizar visibilidade do botão de excluir
                const updateDeleteButton = () => {
                    const selectedOption = select.options[select.selectedIndex];
                    const isSystem = selectedOption.dataset.isSystem === 'true';
                    // Só mostra botão de excluir se NÃO for sistema
                    btnDelete.style.display = isSystem ? 'none' : 'inline-block';
                };

                // Renderiza as permissões para a role selecionada
                renderPermissionsGrid(matrixData, select.value, isMaster);
                updateDeleteButton();

                // Adiciona listener para trocar de role
                select.addEventListener('change', (e) => {
                    renderPermissionsGrid(matrixData, e.target.value, isMaster);
                    updateDeleteButton();
                });

                // [NOVO] Adiciona listener para dependências de permissão
                grid.addEventListener('change', (event) => {
                    const checkbox = event.target;
                    if (checkbox.type !== 'checkbox' || !checkbox.checked) {
                        return; // Só age ao marcar a caixa
                    }

                    const permissionKey = checkbox.dataset.permission;
                    const parts = permissionKey.split('.');

                    if (parts.length > 1) {
                        const feature = parts[0];
                        const action = parts[1];

                        // Se a ação for criar, atualizar ou apagar, garante que a leitura também está marcada
                        if (['create', 'update', 'delete'].includes(action)) {
                            const readPermissionKey = `${feature}.read`;
                            const readCheckbox = grid.querySelector(`input[data-permission="${readPermissionKey}"]`);
                            if (readCheckbox && !readCheckbox.checked) {
                                readCheckbox.checked = true;
                            }
                        }
                    }
                });

                if (isMaster) {
                    if (permSaveChangesContainer) permSaveChangesContainer.style.display = 'block';
                    if (permSaveChangesBtn) {
                        permSaveChangesBtn.removeEventListener('click', handleSavePermissions);
                        permSaveChangesBtn.addEventListener('click', handleSavePermissions);
                    }
                }
                return true;
            } catch (error) {
                if (permissionsError) permissionsError.textContent = `Erro: ${error.message}`;
                return false;
            }
        };

        // --- Lógica de Formulários ---
        const handleUnifiedAppearance = async (e) => {
            e.preventDefault();
            window.showPagePreloader('A aplicar nova aparência...');
            const submitButton = document.getElementById('saveAppearanceBtn');
            if (!submitButton) return;

            const formData = new FormData();
            let hasChanges = false;

            // Mapeia IDs do formulário para chaves no objeto de configurações
            // [ADICIONADO] 'companyName' ao mapeamento
            const fieldMapping = {
                'primaryColor': 'primary_color',
                'backgroundColor': 'background_color',
                'sidebarColor': 'sidebar_color',
                'fontColor': 'font_color',
                'fontFamily': 'font_family',
                'fontSize': 'font_size',
                'modalBackgroundColor': 'modal_background_color',
                'modalFontColor': 'modal_font_color',
                'modalBorderColor': 'modal_border_color',
                'loginBackgroundColor': 'login_background_color',
                'loginFormBackgroundColor': 'login_form_background_color',
                'loginFontColor': 'login_font_color',
                'loginButtonColor': 'login_button_color',
                'companyName': 'company_name',
                // [NOVO] Adiciona os novos campos de navegação e tipografia ao mapeamento
                'navTitleColor': 'nav_title_color',
                'labelColor': 'label_color',
                'placeholderColor': 'placeholder_color',
                'tabLinkColor': 'tab_link_color',
                'tabLinkActiveColor': 'tab_link_active_color',
                'adminSessionTimeout': 'admin_session_timeout', // [NOVO] Mapeamento do timeout
                'loaderTimeout': 'loader_timeout' // [NOVO]
            };

            // 1. Compara campos de texto e cor
            for (const id in fieldMapping) {
                const element = document.getElementById(id);
                if (element) {
                    const initialValue = initialAppearanceSettings[fieldMapping[id]];
                    const currentValue = element.value;
                    // Compara valores, tratando `null` e `undefined` de forma similar a string vazia para inputs
                    if (String(initialValue || '') !== String(currentValue)) {
                        formData.append(fieldMapping[id], currentValue);
                        hasChanges = true;
                    }
                }
            }

            // [NOVO] Verifica checkbox do loader
            const loaderEnabledCheckbox = document.getElementById('loaderEnabled');
            if (loaderEnabledCheckbox) {
                const initialVal = initialAppearanceSettings.loader_enabled;
                const currentVal = loaderEnabledCheckbox.checked;
                // O banco retorna true/false, o checkbox é boolean.
                if (initialVal !== currentVal) {
                    formData.append('loader_enabled', currentVal);
                    hasChanges = true;
                }
            }

            // 2. Verifica upload de ficheiros
            const loginLogoInput = document.getElementById('loginLogoUpload');
            if (loginLogoInput && loginLogoInput.files[0]) {
                const loginLogoFile = loginLogoInput.files[0];
                // FORÇA A ATUALIZAÇÃO: Mesmo que o nome do ficheiro seja o mesmo, o conteúdo é novo.
                // O backend irá gerar o novo URL com a extensão correta (.svg).
                formData.append('loginLogo', loginLogoFile);
                hasChanges = true;
            }

            const backgroundImageInput = document.getElementById('backgroundUpload');
            if (backgroundImageInput && backgroundImageInput.files[0]) {
                const backgroundImageFile = backgroundImageInput.files[0];
                formData.append('backgroundImage', backgroundImageFile);
                hasChanges = true;
            }

            const companyLogoFile = document.getElementById('logoUpload')?.files[0]; // Este pode ficar como está, pois é o principal
            if (companyLogoFile) { 
                formData.append('companyLogo', companyLogoFile);
                hasChanges = true;
            }

            // 3. Verifica remoção de imagens
            if (unifiedAppearanceForm.dataset.removeBackground === 'true') {
                formData.append('removeBackgroundImage', 'true');
                hasChanges = true;
            }
            if (unifiedAppearanceForm.dataset.removeLoginLogo === 'true') {
                formData.append('removeLoginLogo', 'true');
                hasChanges = true;
            }

            // 4. Se não houver alterações, notifica e pára
            if (!hasChanges) {
                showNotification("Nenhuma alteração detectada.", "info");
                window.hidePagePreloader();
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = 'A guardar...';

            try {
                const result = await apiRequest('/api/settings/appearance', 'POST', formData);
                // LOG ADICIONADO: Mostra a resposta completa ao guardar
                console.log('%c[handleUnifiedAppearance] Resposta da API após guardar:', 'color: orange;', result);

                // [CORREÇÃO] Detecta as configurações retornadas em várias estruturas possíveis (root, data, ou data.settings)
                const returnedSettings = result.settings || (result.data && result.data.settings) || result.data;

                if (result.success && returnedSettings) {
                    window.systemSettings = returnedSettings;
                    if (window.applyVisualSettings) window.applyVisualSettings(returnedSettings);
                    // Recarrega as configurações para atualizar o estado inicial (`initialAppearanceSettings`)
                    await loadGeneralSettings(); 
                }
                showNotification(result.message || 'Configurações de aparência guardadas.', result.success ? 'success' : 'error');
            } catch (error) {
                showNotification(`Erro: ${error.message}`, 'error');
            } finally {
                window.hidePagePreloader();
                submitButton.disabled = false;
                submitButton.textContent = 'Guardar Todas as Alterações de Aparência';
                delete unifiedAppearanceForm.dataset.removeBackground;
                delete unifiedAppearanceForm.dataset.removeLoginLogo;
            }
        };

        /**
         * [NOVO] Lida com a submissão do formulário de configurações de SMTP.
         */
        const handleSmtpSettings = async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const submitButton = form.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'A guardar...';

            try {
                const smtpData = {
                    email_host: document.getElementById('emailHost').value,
                    email_port: document.getElementById('emailPort').value,
                    email_user: document.getElementById('emailUser').value,
                    email_pass: document.getElementById('emailPass').value, // A senha, pode ser vazia
                    email_from: document.getElementById('emailFrom').value,
                    email_secure: document.getElementById('emailSecure').checked,
                };

                const result = await apiRequest('/api/settings/smtp', 'POST', smtpData);

                showNotification(result.message || 'Operação concluída.', result.success ? 'success' : 'error');
                if (result.success) {
                    document.getElementById('emailPass').value = ''; // Limpa o campo de senha por segurança
                }
            } catch (error) {
                showNotification(`Erro ao salvar configurações de SMTP: ${error.message}`, 'error');
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Salvar Configurações de E-mail';
            }
        };

        // [NOVO] Handler para Notificações
        const handleNotificationSettings = async (e) => {
            e.preventDefault();
            const btn = notificationSettingsForm.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'A guardar...';

            const data = {
                offline_report_emails: document.getElementById('offlineReportEmails').value,
                telegram_bot_token: document.getElementById('telegramBotToken').value,
                telegram_chat_id: document.getElementById('telegramChatId').value,
                offline_report_schedule: document.getElementById('offlineReportSchedule').value
            };

            try {
                const result = await apiRequest('/api/settings/notifications', 'POST', data);
                showNotification(result.message, 'success');
            } catch (error) {
                showNotification(`Erro: ${error.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Salvar Configurações de Notificação';
            }
        };

        // [NOVO] Handler para Teste de Notificações
        const testNotificationBtn = document.getElementById('testNotificationBtn');
        if (testNotificationBtn) {
            testNotificationBtn.addEventListener('click', async () => {
                testNotificationBtn.disabled = true;
                testNotificationBtn.textContent = 'A enviar...';
                
                const data = {
                    offline_report_emails: document.getElementById('offlineReportEmails').value,
                    telegram_bot_token: document.getElementById('telegramBotToken').value,
                    telegram_chat_id: document.getElementById('telegramChatId').value
                };

                try {
                    const result = await apiRequest('/api/settings/notifications/test', 'POST', data);
                    showNotification(result.message, result.success ? 'success' : 'warning');
                } catch (error) {
                    showNotification(`Erro no teste: ${error.message}`, 'error');
                } finally {
                    testNotificationBtn.disabled = false;
                    testNotificationBtn.textContent = 'Testar Envio';
                }
            });
        }

        // --- Lógica de Carregamento de Dados ---
        const loadGeneralSettings = async () => {
            try {
                const response = await apiRequest('/api/settings/general');
                // [CORRIGIDO] A API pode retornar o objeto de configurações diretamente ou dentro de uma propriedade 'data'.
                const settings = response.data || response;
                if (!settings || Object.keys(settings).length === 0) {
                    showNotification('Não foi possível carregar as configurações de aparência.', 'error');
                    return;
                }
                
                // LOG ADICIONADO: Mostra os dados que serão usados para preencher o formulário
                console.log('%c[loadGeneralSettings] Configurações recebidas para preencher o formulário:', 'color: orange;', settings);

                // Guarda o estado inicial para detecção de alterações
                initialAppearanceSettings = { ...settings };

                const fields = {
                    'companyName': settings.company_name,
                    'primaryColor': settings.primary_color,
                    'backgroundColor': settings.background_color,
                    'sidebarColor': settings.sidebar_color,
                    'fontColor': settings.font_color,
                    'fontFamily': settings.font_family,
                    'fontSize': settings.font_size,
                    'modalBackgroundColor': settings.modal_background_color,
                    'modalFontColor': settings.modal_font_color,
                    'modalBorderColor': settings.modal_border_color,
                    'loginBackgroundColor': settings.login_background_color,
                    'loginFormBackgroundColor': settings.login_form_background_color,
                    'loginFontColor': settings.login_font_color,
                    'loginButtonColor': settings.login_button_color,
                    // [NOVO] Adiciona os novos campos para serem preenchidos
                    'navTitleColor': settings.nav_title_color,
                    'labelColor': settings.label_color,
                    'placeholderColor': settings.placeholder_color,
                    'tabLinkColor': settings.tab_link_color,
                    'tabLinkActiveColor': settings.tab_link_active_color,
                    'adminSessionTimeout': settings.admin_session_timeout, // [NOVO] Preenche o input
                    'loaderTimeout': settings.loader_timeout, // [NOVO]
                    // [NOVO] Campos de SMTP
                    'emailHost': settings.email_host,
                    'emailPort': settings.email_port,
                    'emailUser': settings.email_user,
                    'emailFrom': settings.email_from,
                    // A senha não é preenchida por segurança
                    // [NOVO] Campos de Notificações
                    'offlineReportEmails': settings.offline_report_emails,
                    'telegramBotToken': settings.telegram_bot_token,
                    'telegramChatId': settings.telegram_chat_id,
                    'offlineReportSchedule': settings.offline_report_schedule
                };
                
                for (const id in fields) {
                    const el = document.getElementById(id);
                    if (el) {
                        el.value = fields[id] || '';
                    }
                }

                // Preenche o checkbox de 'loader_enabled'
                const loaderEnabledCheckbox = document.getElementById('loaderEnabled');
                if (loaderEnabledCheckbox) {
                    loaderEnabledCheckbox.checked = settings.loader_enabled !== false; // Default true se undefined
                }

                // Preenche o checkbox de 'email_secure'
                const emailSecureCheckbox = document.getElementById('emailSecure');
                if (emailSecureCheckbox) {
                    emailSecureCheckbox.checked = !!settings.email_secure;
                }

                const updatePreview = (previewId, removeBtnId, url) => {
                    const preview = document.getElementById(previewId);
                    const removeBtn = document.getElementById(removeBtnId);
                    if (!preview) {
                        console.warn(`Elemento de preview não encontrado: ${previewId}`);
                        return;
                    }
                    const hasUrl = !!url;
                    preview.style.display = hasUrl ? 'block' : 'none';
                    if (hasUrl) preview.src = `http://${window.location.hostname}:3000${url}?v=${Date.now()}`;
                    
                    if (removeBtn) {
                        removeBtn.style.display = hasUrl ? 'inline-block' : 'none';
                    } else if (hasUrl) {
                        // Se há uma URL mas nenhum botão de remover, é bom estar ciente disso.
                        // Pode ser intencional (como no logo da empresa).
                        console.log(`Preview '${previewId}' atualizado, mas nenhum botão de remoção '${removeBtnId}' foi encontrado.`);
                    }
                };

                updatePreview('currentLogoPreview', 'removeLogo', settings.logo_url);
                updatePreview('currentBackgroundPreview', 'removeBackground', settings.background_image_url);
                updatePreview('currentLoginLogoPreview', 'removeLoginLogo', settings.login_logo_url);

                const loginBgColorInput = document.getElementById('loginBackgroundColor');
                if (loginBgColorInput) loginBgColorInput.disabled = !!settings.background_image_url;

            } catch (error) {
                console.error('Erro ao carregar configurações gerais:', error);
                showNotification('Falha ao carregar as configurações de aparência.', 'error');
            }
        };


        let auditLogs = []; // Variável para armazenar os logs carregados
        let systemLogs = []; // [NOVO] Variável para armazenar os logs de sistema
        let currentLogTab = 'activity'; // [NOVO] Estado atual da aba de logs

        // [NOVO] Função para injetar as abas de tipo de log na interface
        const injectLogTabs = () => {
            const keywordInput = document.getElementById('logKeyword');
            if (!keywordInput || document.getElementById('log-type-tabs')) return;

            // Encontra o container de filtros para inserir as abas antes dele
            const filtersContainer = keywordInput.parentElement; // .filters ou div pai
            
            const tabsDiv = document.createElement('div');
            tabsDiv.id = 'log-type-tabs';
            tabsDiv.style.cssText = 'margin-bottom: 15px; display: flex; gap: 10px;';
            
            tabsDiv.innerHTML = `
                <button type="button" class="btn-primary" id="btn-log-activity">Logs de Atividade</button>
                <button type="button" class="btn-secondary" id="btn-log-system">Logs do Sistema</button>
                <button type="button" class="btn-secondary" id="btn-log-offline" style="margin-left: auto;"><i class="fas fa-archive" style="margin-right: 5px;"></i>Ver Logs Offline</button>
            `;
            
            filtersContainer.parentElement.insertBefore(tabsDiv, filtersContainer);

            // [NOVO] Injeta o seletor de Tipo de Ação nos filtros
            if (!document.getElementById('logActionType')) {
                const select = document.createElement('select');
                select.id = 'logActionType';
                select.style.cssText = 'padding: 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--background-medium); color: var(--text-primary); margin-right: 10px; max-width: 150px;';
                select.innerHTML = `
                    <option value="">Todas as Ações</option>
                    <option value="maintenance">Manutenção</option>
                    <option value="login">Login/Acesso</option>
                    <option value="user">Utilizadores</option>
                    <option value="router">Roteadores</option>
                    <option value="settings">Configurações</option>
                `;
                // Insere após o campo de palavra-chave
                keywordInput.parentNode.insertBefore(select, keywordInput.nextSibling);
            }

            document.getElementById('btn-log-activity').addEventListener('click', () => switchLogTab('activity'));
            document.getElementById('btn-log-system').addEventListener('click', () => switchLogTab('system'));
            document.getElementById('btn-log-offline').addEventListener('click', viewOfflineLogs);
        };

        // [NOVO] Função para alternar entre tipos de logs
        const switchLogTab = (tab) => {
            currentLogTab = tab;
            
            // Atualiza estilo dos botões
            const btnActivity = document.getElementById('btn-log-activity');
            const btnSystem = document.getElementById('btn-log-system');
            const actionSelect = document.getElementById('logActionType');
            
            if (tab === 'activity') {
                btnActivity.className = 'btn-primary';
                btnSystem.className = 'btn-secondary';
                if (actionSelect) actionSelect.style.display = 'inline-block'; // Mostra filtro
                updateLogTableHeaders('activity');
                loadAuditLogs();
            } else {
                btnActivity.className = 'btn-secondary';
                btnSystem.className = 'btn-primary';
                if (actionSelect) actionSelect.style.display = 'none'; // Esconde filtro (não se aplica a sistema)
                updateLogTableHeaders('system');
                loadSystemLogs();
            }
        };

        // [NOVO] Atualiza os cabeçalhos da tabela dinamicamente
        const updateLogTableHeaders = (type) => {
            const tableBody = document.getElementById('auditLogsTableBody');
            if (!tableBody) return;
            const table = tableBody.closest('table');
            const thead = table.querySelector('thead tr');
            
            if (type === 'activity') {
                thead.innerHTML = `
                    <th>Data/Hora</th>
                    <th>Utilizador</th>
                    <th>IP</th>
                    <th>Ação</th>
                    <th>Status</th>
                    <th>Descrição</th>
                `;
            } else {
                thead.innerHTML = `
                    <th>Data/Hora</th>
                    <th>Mensagem de Erro</th>
                    <th>Endpoint</th>
                    <th>Utilizador</th>
                    <th>Ações</th>
                `;
            }
        };

        // [NOVO] Modal de detalhes do erro
        window.showErrorDetails = (logId) => {
            const log = systemLogs.find(l => l.id === logId);
            if (!log) return;

            const modal = document.createElement('div');
            modal.className = 'modal-overlay'; // Usa a classe existente do seu CSS
            modal.innerHTML = `
                <div class="modal-content large">
                    <h3>Detalhes do Erro #${log.id}</h3>
                    <p><strong>Timestamp:</strong> ${new Date(log.timestamp).toLocaleString()}</p>
                    <p><strong>Mensagem:</strong> ${log.error_message}</p>
                    <p><strong>Endpoint:</strong> ${log.request_method || 'N/A'} ${log.request_url || 'N/A'}</p>
                    
                    <h4 style="margin-top:15px; font-size:14px;">Stack Trace:</h4>
                    <pre style="background: #1a202c; padding: 10px; border-radius: 5px; max-height: 300px; overflow-y: auto; font-size: 12px; color: #e2e8f0;"><code>${log.stack_trace || 'Não disponível'}</code></pre>
                    
                    <div class="modal-actions">
                        <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            // Pequeno delay para animação CSS se houver
            setTimeout(() => modal.classList.remove('hidden'), 10);
        };

        // [NOVO] Função para visualizar os logs offline
        const viewOfflineLogs = async () => {
            try {
                const response = await apiRequest('/api/logs/offline-buffer');
                const logs = response.data || [];

                let contentHtml = '<p>O ficheiro de logs offline está vazio.</p>';

                if (logs.length > 0) {
                    contentHtml = `
                        <p>Encontrados <strong>${logs.length}</strong> erros no ficheiro de log offline. Estes são erros que ocorreram enquanto a base de dados estava indisponível.</p>
                        <div style="max-height: 50vh; overflow-y: auto; background: #1a202c; padding: 15px; border-radius: 8px; margin-top: 15px;">
                    `;
                    logs.forEach(log => {
                        contentHtml += `
                            <div style="border-bottom: 1px solid #4a5568; padding-bottom: 10px; margin-bottom: 10px;">
                                <p><strong>Data/Hora:</strong> ${new Date(log.timestamp).toLocaleString()}</p>
                                <p><strong>Mensagem:</strong> ${log.errorMessage}</p>
                                <p><strong>Endpoint:</strong> ${log.requestMethod || 'N/A'} ${log.requestUrl || 'N/A'}</p>
                                <p><strong>Utilizador:</strong> ${log.userEmail || 'N/A'}</p>
                            </div>
                        `;
                    });
                    contentHtml += '</div>';
                }

                const modal = document.createElement('div');
                modal.className = 'modal-overlay';
                modal.innerHTML = `
                    <div class="modal-content large">
                        <h3>Logs de Erro Offline</h3>
                        ${contentHtml}
                        <div class="modal-actions">
                            <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
                setTimeout(() => modal.classList.remove('hidden'), 10);

            } catch (error) {
                showNotification(`Erro ao buscar logs offline: ${error.message}`, 'error');
            }
        };


        const loadAuditLogs = async (filters = {}) => {
            window.showPagePreloader('A carregar logs de atividade...');
            const tableBody = document.getElementById('auditLogsTableBody');
            if (!tableBody) return;

            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">A carregar logs...</td></tr>`;

            try {
                let endpoint = '/api/logs/activity';
                const queryParams = new URLSearchParams();
                if (filters.keyword) {
                    queryParams.append('keyword', filters.keyword);
                }
                if (filters.startDate) {
                    queryParams.append('startDate', filters.startDate);
                }
                if (filters.endDate) {
                    queryParams.append('endDate', filters.endDate);
                }
                if (filters.actionType) {
                    queryParams.append('actionType', filters.actionType);
                }

                const queryString = queryParams.toString();
                if (queryString) {
                    endpoint += `?${queryString}`;
                }

                const response = await apiRequest(endpoint);

                // [CORRIGIDO] Torna a verificação mais robusta, aceitando um array direto ou um objeto com a propriedade 'data'.
                const logs = response.data || response;
                if (!Array.isArray(logs)) {
                    throw new Error(response.message || 'Resposta inválida da API de logs.');
                }

                auditLogs = logs; // Armazena os logs na variável
                tableBody.innerHTML = ''; // Limpa a tabela

                if (auditLogs.length === 0) {
                    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Nenhum log de atividade encontrado.</td></tr>`;
                    return;
                }

                auditLogs.forEach(log => {
                    const row = document.createElement('tr');

                    // Formata a data para ser mais legível
                    const timestamp = new Date(log.timestamp).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });

                    // Adiciona uma classe CSS com base no status para colorir
                    const statusClass = log.status === 'SUCCESS' ? 'status-success' : 'status-failure';

                    row.innerHTML = `
                        <td>${timestamp}</td>
                        <td>${log.user_email || 'N/A'}</td>
                        <td>${log.ip_address || 'N/A'}</td>
                        <td>${log.action}</td>
                        <td class="status-cell"><span class="${statusClass}">${log.status}</span></td>
                        <td>${log.description || ''}</td>
                    `;
                    tableBody.appendChild(row);
                });

            } catch (error) {
                console.error("Erro ao carregar logs de auditoria:", error);
                tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--color-danger);">Falha ao carregar logs. Tente novamente.</td></tr>`;
            } finally {
                window.hidePagePreloader();
            }
        };

        // [NOVO] Carrega os logs de sistema
        const loadSystemLogs = async (filters = {}) => {
            window.showPagePreloader('A carregar logs de sistema...');
            const tableBody = document.getElementById('auditLogsTableBody');
            if (!tableBody) return;

            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">A carregar logs de sistema...</td></tr>`;

            try {
                let endpoint = '/api/logs/system';
                const queryParams = new URLSearchParams();
                // Usa os mesmos inputs de filtro para ambos os tipos
                const keyword = document.getElementById('logKeyword')?.value;
                const startDate = document.getElementById('logStartDate')?.value;
                const endDate = document.getElementById('logEndDate')?.value;

                if (keyword) queryParams.append('keyword', keyword);
                if (startDate) queryParams.append('startDate', startDate);
                if (endDate) queryParams.append('endDate', endDate);

                const queryString = queryParams.toString();
                if (queryString) endpoint += `?${queryString}`;

                const response = await apiRequest(endpoint);
                systemLogs = response.data || response; // [CORRIGIDO]

                tableBody.innerHTML = '';

                if (!Array.isArray(systemLogs) || systemLogs.length === 0) {
                    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Nenhum erro de sistema registado.</td></tr>`;
                    return;
                }

                systemLogs.forEach(log => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${new Date(log.timestamp).toLocaleString()}</td>
                        <td title="${log.error_message}" style="max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${log.error_message}</td>
                        <td><span class="badge role-estetica">${log.request_method || '-'}</span> ${log.request_url || '-'}</td>
                        <td>${log.user_email || 'N/A'}</td>
                        <td><button class="btn-secondary" style="padding: 0; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center;" onclick="showErrorDetails(${log.id})" title="Ver Detalhes"><i class="fas fa-info-circle"></i></button></td>
                    `;
                    tableBody.appendChild(row);
                });
            } catch (error) {
                console.error("Erro ao carregar logs de sistema:", error);
                tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--error-text);">Falha ao carregar logs.</td></tr>`;
            } finally {
                window.hidePagePreloader();
            }
        };

        const exportToCSV = () => {
            // [MODIFICADO] Exporta baseado na aba atual
            if (currentLogTab === 'system') {
                const header = ["Data/Hora", "Mensagem", "Endpoint", "Utilizador", "Stack Trace"];
                const csv = [
                    header.join(','),
                    ...systemLogs.map(log => [
                        `"${new Date(log.timestamp).toLocaleString('pt-BR')}"`,
                        `"${(log.error_message || '').replace(/"/g, '""')}"`,
                        `"${log.request_method} ${log.request_url}"`,
                        `"${log.user_email || 'N/A'}"`,
                        `"${(log.stack_trace || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
                    ].join(','))
                ].join('\n');
                downloadFile(csv, 'logs_sistema.csv', 'text/csv;charset=utf-8;');
                return;
            }

            const header = ["Data/Hora", "Utilizador", "IP", "Ação", "Status", "Descrição"];
            const csv = [
                header.join(','),
                ...auditLogs.map(log => [
                    `"${new Date(log.timestamp).toLocaleString('pt-BR')}"`,
                    `"${log.user_email || 'N/A'}"`,
                    `"${log.ip_address || 'N/A'}"`,
                    `"${log.action}"`,
                    `"${log.status}"`,
                    `"${(log.description || '').replace(/"/g, '""')}"`
                ].join(','))
            ].join('\n');

            downloadFile(csv, 'logs_auditoria.csv', 'text/csv;charset=utf-8;');
        };

        // Função auxiliar para download
        const downloadFile = (content, fileName, mimeType) => {
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        const exportToExcel = () => {
            const data = currentLogTab === 'activity' ? auditLogs : systemLogs;
            const sheetName = currentLogTab === 'activity' ? "Logs de Auditoria" : "Logs de Sistema";
            
            const worksheet = XLSX.utils.json_to_sheet(auditLogs.map(log => ({
                "Data/Hora": new Date(log.timestamp).toLocaleString('pt-BR'),
                "Utilizador": log.user_email || 'N/A',
                "IP": log.ip_address || 'N/A',
                "Ação": log.action,
                "Status": log.status,
                "Descrição": log.description || ''
            })));
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
            XLSX.writeFile(workbook, `${sheetName.toLowerCase().replace(/ /g, '_')}.xlsx`);
        };

        const filterLogsBtn = document.getElementById('filterLogsBtn');
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');

        if (filterLogsBtn) {
            filterLogsBtn.addEventListener('click', () => {
                const keyword = document.getElementById('logKeyword').value;
                const startDate = document.getElementById('logStartDate').value;
                const endDate = document.getElementById('logEndDate').value;
                const actionType = document.getElementById('logActionType')?.value; // [NOVO]
                if (currentLogTab === 'activity') {
                    loadAuditLogs({ keyword, startDate, endDate, actionType });
                } else {
                    loadSystemLogs({ keyword, startDate, endDate });
                }
            });
        }

        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                document.getElementById('logKeyword').value = '';
                document.getElementById('logStartDate').value = '';
                document.getElementById('logEndDate').value = '';
                if (document.getElementById('logActionType')) document.getElementById('logActionType').value = '';
                if (currentLogTab === 'activity') {
                    loadAuditLogs();
                } else {
                    loadSystemLogs();
                }
            });
        }

        document.getElementById('exportCsvBtn')?.addEventListener('click', exportToCSV);
        document.getElementById('exportExcelBtn')?.addEventListener('click', exportToExcel);

        // --- INICIALIZAÇÃO DA PÁGINA ---
        const initializeSettingsPage = async () => {
            if (!window.currentUserProfile?.role) {
                setTimeout(initializeSettingsPage, 100); // Espera o perfil carregar
                return;
            }

            const role = window.currentUserProfile.role;
            const permissions = window.currentUserProfile.permissions;
            const isMaster = (role === 'master');
            let firstVisibleTabId = 'tab-empresa'; // [ATUALIZADO] Nova aba padrão

            // [CORRIGIDO] Lógica de visibilidade da aba de Aparência
            const canSeeAppearance = isMaster || permissions['settings.appearance'] || permissions['settings.login_page'];
            const appearanceTabLink = document.querySelector('.tab-link[data-tab="tab-aparencia"]');
            if (appearanceTabLink) {
                appearanceTabLink.style.display = canSeeAppearance ? '' : 'none';
            }

            tabLinks.forEach(link => {
                const tabId = link.getAttribute('data-tab');
                let show = true;
                // [CORRIGIDO] Controla a visibilidade da aba Empresa (SMTP) pela permissão
                if (tabId === 'tab-empresa' && !isMaster && !permissions['settings.smtp']) {
                    show = false;
                }
                if (tabId === 'tab-permissoes' && !isMaster && role !== 'DPO') { show = false; }
                // A visibilidade da aba de aparência é tratada acima
                if (tabId === 'tab-aparencia') {
                    return; // Pula a lógica antiga
                }
                // [CORRIGIDO] Permite acesso se tiver permissão de leitura de logs de atividade OU sistema
                if (tabId === 'tab-logs' && !isMaster && role !== 'DPO') {
                    const hasLogPermission = permissions['logs.activity.read'] || permissions['logs.system.read'];
                    if (!hasLogPermission) show = false;
                }
                // [CORRIGIDO] Adiciona a verificação de permissão para a aba de Gestão de Dados (LGPD)
                if (tabId === 'tab-lgpd' && !permissions['lgpd.read']) {
                show = false;
            }
            // [NOVO] Aba de Notificações (mesma permissão de SMTP ou Empresa)
            if (tabId === 'tab-notificacoes' && !isMaster && !permissions['settings.smtp']) {
                show = false;
            }
            // [NOVO] Aba de Arquivos apenas para Master
            if (tabId === 'tab-arquivos' && !isMaster) {
                    show = false;
                }
                
                link.style.display = show ? '' : 'none';
                const tabContentEl = document.getElementById(tabId);
                if(tabContentEl) tabContentEl.style.display = show ? '' : 'none';
            });

            // Carrega dados das abas visíveis
            if (document.getElementById('tab-empresa')?.style.display !== 'none') {
                loadGeneralSettings();
            }
            if (document.getElementById('tab-aparencia')?.style.display !== 'none') {
                loadGeneralSettings();
            }
            if (document.getElementById('tab-notificacoes')?.style.display !== 'none') {
                loadGeneralSettings(); // Usa a mesma função pois os dados vêm da mesma API
            }
            if (document.getElementById('tab-permissoes')?.style.display !== 'none') {
                loadPermissionsMatrix();
            }
            if (document.getElementById('tab-logs')?.style.display !== 'none') {
                // [MODIFICADO] Injeta as abas e carrega o padrão
                injectLogTabs();
                loadAuditLogs(); // Carrega atividade por padrão
            }
            if (document.getElementById('tab-arquivos')?.style.display !== 'none') {
                loadMediaFiles(); // Carrega a aba de arquivos se visível
            }

            // [CORRIGIDO] Controla a visibilidade das seções de aparência
            const panelAppearanceSection = document.querySelector('.appearance-section');
            if (panelAppearanceSection) {
                panelAppearanceSection.style.display = (isMaster || permissions['settings.appearance']) ? '' : 'none';
            }
            const loginAppearanceSection = document.querySelector('.login-appearance-section');
            if (loginAppearanceSection) {
                loginAppearanceSection.style.display = (isMaster || permissions['settings.login_page']) ? '' : 'none';
            }

            const firstVisibleLink = Array.from(tabLinks).find(link => link.style.display !== 'none');
            if (firstVisibleLink) {
                firstVisibleTabId = firstVisibleLink.dataset.tab;
            }
            switchTab(firstVisibleTabId);
        };

        // --- [NOVA LÓGICA PARA O MODAL DE POLÍTICAS] ---

        const openPolicyModal = (type) => {
            const isMaster = window.currentUserProfile?.role === 'master';
            const content = (type === 'terms') ? window.systemSettings.terms_content : window.systemSettings.marketing_policy_content;
            const title = (type === 'terms') ? 'Termos e Condições' : 'Política de Sorteios e Promoções';

            policyModalTitle.textContent = title;
            policyViewer.innerHTML = content || '<p>Nenhum conteúdo definido.</p>';
            policyTypeField.value = type;

            // Reseta o estado do modal
            policyViewer.classList.remove('hidden');
            policyEditor.classList.add('hidden');

            // Configura os botões
            policyModalActions.innerHTML = '';
            if (isMaster) {
                const editBtn = document.createElement('button');
                editBtn.id = 'editPolicyBtn';
                editBtn.className = 'btn-secondary';
                editBtn.textContent = 'Editar';
                editBtn.onclick = () => enterEditMode(content);
                policyModalActions.appendChild(editBtn);
            }

            policyModal.classList.remove('hidden');
            // [NOVO] Adiciona a classe 'large' para um modal mais espaçoso, ideal para textos
            const modalContent = policyModal.querySelector('.modal-content');
            if (modalContent) modalContent.classList.add('large');
        };

        const enterEditMode = (currentContent) => {
            policyViewer.classList.add('hidden');
            policyEditor.classList.remove('hidden');

            const editor = document.querySelector("trix-editor[input='policyContentField']").editor;
            editor.loadHTML(currentContent || '');

            // Altera os botões para Salvar e Cancelar
            policyModalActions.innerHTML = `
                <button id="cancelEditBtn" type="button" class="btn-secondary">Cancelar Edição</button>
                <button id="savePolicyBtn" type="button" class="btn-primary">Salvar Alterações</button>
            `;

            document.getElementById('cancelEditBtn').onclick = () => exitEditMode(currentContent);
            document.getElementById('savePolicyBtn').onclick = handleSavePolicy;
        };

        const exitEditMode = (originalContent) => {
            policyViewer.innerHTML = originalContent || '<p>Nenhum conteúdo definido.</p>';
            policyViewer.classList.remove('hidden');
            policyEditor.classList.add('hidden');
            openPolicyModal(policyTypeField.value); // Reabre o modal no modo de visualização
        };

        const handleSavePolicy = async () => {
            window.showPagePreloader('A guardar política...');
            const saveBtn = document.getElementById('savePolicyBtn');
            saveBtn.disabled = true;
            saveBtn.textContent = 'A guardar...';

            const type = policyTypeField.value;
            const content = policyContentField.value;

            const dataToSend = {};
            if (type === 'terms') {
                dataToSend.terms_content = content;
                dataToSend.marketing_policy_content = window.systemSettings.marketing_policy_content; // Envia o outro campo inalterado
            } else {
                dataToSend.terms_content = window.systemSettings.terms_content; // Envia o outro campo inalterado
                dataToSend.marketing_policy_content = content;
            }

            try {
                const result = await apiRequest('/api/settings/policies', 'POST', dataToSend);
                if (result.success) {
                    showNotification('Política atualizada com sucesso!', 'success');
                    // Atualiza o cache local e sai do modo de edição
                    if (type === 'terms') {
                        window.systemSettings.terms_content = content;
                    } else {
                        window.systemSettings.marketing_policy_content = content;
                    }
                    exitEditMode(content);
                } else {
                    throw new Error(result.message || 'Falha ao guardar a política.');
                }
            } catch (error) {
                showNotification(`Erro: ${error.message}`, 'error');
            } finally {
                window.hidePagePreloader();
                saveBtn.disabled = false;
                saveBtn.textContent = 'Salvar Alterações';
            }
        };

        // --- [NOVO] Lógica de Gestão de Arquivos ---
        const loadMediaFiles = async () => {
            if (!mediaGallery || !mediaTypeSelect) return;
            
            const type = mediaTypeSelect.value;
            
            // [NOVO] Mostra o botão de arquivar apenas para tickets
            if (archiveMediaBtn) {
                archiveMediaBtn.classList.toggle('hidden', type !== 'ticket_attachments');
            }

            mediaGallery.innerHTML = '<p style="width:100%; text-align:center;">A carregar imagens...</p>';

            try {
                const response = await apiRequest(`/api/settings/media?type=${type}`);
                const files = response.data || [];

                mediaGallery.innerHTML = '';
                if (files.length === 0) {
                    mediaGallery.innerHTML = '<p style="width:100%; text-align:center;">Nenhuma imagem encontrada nesta pasta.</p>';
                    return;
                }

                files.forEach(file => {
                    const item = document.createElement('div');
                    item.className = 'media-item';
                    
                    const isImage = /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(file.name);
                    const fileUrl = `http://${window.location.hostname}:3000${file.url}`;
                    const previewHtml = isImage 
                        ? `<img src="${fileUrl}" alt="${file.name}" class="media-preview">`
                        : `<div class="media-preview" style="display:flex; align-items:center; justify-content:center; background:var(--background-dark); font-size:3rem; color:var(--text-secondary); height: 120px;"><i class="fas fa-file-code"></i></div>`;

                    item.innerHTML = `
                        ${previewHtml}
                        <div class="media-info">
                            <span class="media-name" title="${file.name}"><a href="${fileUrl}" target="_blank" download style="color: var(--primary-color); text-decoration: none;">${file.name}</a></span>
                            <button class="btn-delete-media" data-filename="${file.name}" title="Excluir Permanentemente"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    `;
                    
                    item.querySelector('.btn-delete-media').addEventListener('click', () => handleDeleteMedia(type, file.name));
                    mediaGallery.appendChild(item);
                });
            } catch (error) {
                console.error("Erro ao carregar mídia:", error);
                mediaGallery.innerHTML = '<p style="width:100%; text-align:center; color: var(--error-text);">Erro ao carregar imagens.</p>';
            }
        };

        const handleDeleteMedia = async (type, filename) => {
            const confirmed = await showConfirmationModal(
                `Tem a certeza que deseja excluir permanentemente o arquivo "${filename}"? Se ele estiver em uso por alguma campanha, ela ficará sem imagem.`,
                'Exclusão Permanente'
            );
            if (!confirmed) return;

            try {
                const response = await apiRequest('/api/settings/media', 'DELETE', { type, filename });
                showNotification(response.message, 'success');
                loadMediaFiles(); // Recarrega a lista
            } catch (error) {
                showNotification(`Erro ao excluir: ${error.message}`, 'error');
            }
        };

        // [NOVO] Lógica para Arquivar e Limpar
        const handleArchiveMedia = async () => {
            const type = mediaTypeSelect.value;
            if (type !== 'ticket_attachments') return;

            const confirmed = await showConfirmationModal(
                'Esta ação irá COMPACTAR (ZIP) todos os anexos de tickets atuais e REMOVÊ-LOS desta pasta para libertar espaço. O ficheiro ZIP será salvo na pasta de arquivos do servidor. Deseja continuar?',
                'Arquivar e Limpar Pasta'
            );
            if (!confirmed) return;

            try {
                const response = await apiRequest('/api/settings/media/archive', 'POST', { type });
                showNotification(response.message, 'success');
                loadMediaFiles(); // Recarrega a lista (que deve estar vazia agora)
            } catch (error) {
                showNotification(`Erro ao arquivar: ${error.message}`, 'error');
            }
        };

        const closePolicyModal = () => policyModal.classList.add('hidden');

        if (tabLinks.length > 0) { 
            tabLinks.forEach(link => link.addEventListener('click', (e) => {
                e.preventDefault();
                switchTab(e.currentTarget.dataset.tab);
            })); 
        }
        
        // [CORRIGIDO] Adiciona o listener para o botão de reset de aparência
        if (resetAppearanceBtn) {
            resetAppearanceBtn.addEventListener('click', handleResetAppearance);
        }

        // --- Lógica para os botões de remover imagem ---
        if (removeBackgroundBtn) {
            removeBackgroundBtn.addEventListener('click', () => {
                const preview = document.getElementById('currentBackgroundPreview');
                if (preview) preview.style.display = 'none';
                removeBackgroundBtn.style.display = 'none';
                if (loginBgColorInput) loginBgColorInput.disabled = false;
                if (backgroundUploadInput) backgroundUploadInput.value = ''; // Limpa o seletor de ficheiro
                if (unifiedAppearanceForm) unifiedAppearanceForm.dataset.removeBackground = 'true'; // Marca para remoção no submit
                showNotification("A imagem de fundo será removida ao guardar.", "info");
            });
        }

        if (removeLoginLogoBtn) {
            removeLoginLogoBtn.addEventListener('click', () => {
                const preview = document.getElementById('currentLoginLogoPreview');
                const uploadInput = document.getElementById('loginLogoUpload');
                if (preview) preview.style.display = 'none';
                removeLoginLogoBtn.style.display = 'none';
                if (uploadInput) uploadInput.value = ''; // Limpa o seletor de ficheiro
                if (unifiedAppearanceForm) unifiedAppearanceForm.dataset.removeLoginLogo = 'true'; // Marca para remoção no submit
                showNotification("O logo da página de login será removido ao guardar.", "info");
            });
        }


        const goToLgpdPageBtn = document.getElementById('goToLgpdPageBtn');
        if (goToLgpdPageBtn) {
            goToLgpdPageBtn.addEventListener('click', () => {
                const reauthModal = document.getElementById('reauthLgpdModal');
                const reauthEmail = document.getElementById('reauthEmail');


                if (reauthModal && reauthEmail && window.currentUserProfile) {
                    reauthEmail.value = window.currentUserProfile.email;
                    reauthModal.classList.remove('hidden');
                }
            });
        }

        // [ADICIONADO] Listener para o formulário de aparência unificado
        if (unifiedAppearanceForm) {
            unifiedAppearanceForm.addEventListener('submit', handleUnifiedAppearance);
        }

        // [NOVO] Listener para o formulário de SMTP e Botão de Teste de Erro
        if (smtpSettingsForm) {
            smtpSettingsForm.removeEventListener('submit', handleSmtpSettings); // Previne duplicados
            smtpSettingsForm.addEventListener('submit', handleSmtpSettings);
        }

        // [NOVO] Listeners para Gestão de Arquivos
        if (mediaTypeSelect) {
            mediaTypeSelect.addEventListener('change', loadMediaFiles);
        }
        if (refreshMediaBtn) {
            refreshMediaBtn.addEventListener('click', loadMediaFiles);
        }
        if (archiveMediaBtn) {
            archiveMediaBtn.addEventListener('click', handleArchiveMedia);
        }

        // [NOVO] Listener para Notificações
        if (notificationSettingsForm) {
            notificationSettingsForm.addEventListener('submit', handleNotificationSettings);
        }

        // [NOVO] Listeners para o Modal de Perfis
        if (roleForm) {
            roleForm.addEventListener('submit', handleRoleFormSubmit);
            // Geração automática de slug
            roleNameInput.addEventListener('input', () => {
                if (!roleSlugOriginalInput.value) { // Apenas na criação
                    const slug = roleNameInput.value.toLowerCase()
                        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                        .replace(/[^a-z0-9]/g, "_");
                    roleSlugInput.value = slug;
                }
            });
            // Fechar modal
            roleModal.querySelectorAll('.modal-close-btn, .modal-close-btn-action').forEach(btn => {
                btn.addEventListener('click', () => roleModal.classList.add('hidden'));
            });
        }

        // --- [SOLUÇÃO DEFINITIVA PARA "MODAL FANTASMA"] ---
        // 1. Guarda as referências exatas das funções de listener num objeto.
        //    Isto é crucial para que o `removeEventListener` saiba qual função remover.
        const policyListeners = {
            openTerms: () => openPolicyModal('terms'),
            openMarketing: () => openPolicyModal('marketing'),
            closeModal: () => closePolicyModal()
        };

        // 2. Adiciona os listeners aos botões usando as referências guardadas.
        viewTermsBtn?.addEventListener('click', policyListeners.openTerms);
        viewMarketingPolicyBtn?.addEventListener('click', policyListeners.openMarketing);
        policyModal?.querySelector('.modal-close-btn')?.addEventListener('click', policyListeners.closeModal);

        // 3. Cria uma função de "limpeza" que usa as mesmas referências para remover os listeners.
        //    Esta função será chamada pelo `admin_dashboard.js` ao navegar para outra página.
        window.cleanupSettingsPage = () => {
            console.log("Executando cleanupSettingsPage para remover listeners de políticas.");
            viewTermsBtn?.removeEventListener('click', policyListeners.openTerms);
            viewMarketingPolicyBtn?.removeEventListener('click', policyListeners.openMarketing);
            policyModal?.querySelector('.modal-close-btn')?.removeEventListener('click', policyListeners.closeModal);
        };

        initializeSettingsPage();
    }; // <-- Esta chave fecha a função window.initSettingsPage