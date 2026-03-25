document.addEventListener('DOMContentLoaded', () => {
    if (window.initUsersPage) {
        console.warn("Tentativa de carregar admin_users.js múltiplas vezes.");
    } else {
        window.initUsersPage = () => {

            const currentUserRole = window.currentUserProfile ? window.currentUserProfile.role : null;
            const currentUserId = window.currentUserProfile ? window.currentUserProfile.id : null;

            const addUserBtn = document.getElementById('addUserBtn');
            const tableBody = document.querySelector('#usersTable tbody');
            const userModal = document.getElementById('userModal');
            const userModalCloseBtn = userModal.querySelector('.modal-close-btn');
            const userModalCancelBtn = document.getElementById('cancelBtn');
            const userForm = document.getElementById('userForm');
            const modalTitle = document.getElementById('modalTitle');
            const passwordGroup = document.getElementById('passwordGroup');
            const sensitiveDataGroup = userModal.querySelector('.sensitive-data-group');
            const resetPasswordModal = document.getElementById('resetPasswordModal');
            const resetModalCloseBtn = resetPasswordModal.querySelector('.modal-close-btn');
            const resetModalCancelBtn = document.getElementById('cancelResetBtn');
            const resetPasswordForm = document.getElementById('resetPasswordForm');
            const resetUserEmailSpan = document.getElementById('resetUserEmail');
            const userRoleSelect = document.getElementById('userRoleSelect'); // [NOVO] Referência ao select

            const setupPageByRole = () => {
                if (!currentUserRole) {
                    console.error("Não foi possível determinar a função do utilizador.");
                    return;
                }
                if (currentUserRole === 'master') {
                    addUserBtn.style.display = 'block';
                }
                if (currentUserRole === 'master' || currentUserRole === 'DPO') {
                    document.querySelectorAll('.sensitive-data').forEach(el => {
                        el.style.display = 'table-cell';
                    });
                }
            };

            // [NOVO] Função para carregar as funções (roles) dinamicamente
            const loadRolesIntoSelect = async () => {
                try {
                    const response = await apiRequest('/api/roles');
                    const roles = response.data || response;
                    
                    userRoleSelect.innerHTML = ''; // Limpa opções existentes
                    
                    roles.forEach(role => {
                        const option = document.createElement('option');
                        option.value = role.slug;
                        option.textContent = role.name;
                        userRoleSelect.appendChild(option);
                    });
                } catch (error) {
                    console.error("Erro ao carregar roles:", error);
                    showNotification("Erro ao carregar lista de funções.", "error");
                }
            };

            const loadUsers = async () => {
                window.showPagePreloader('A carregar utilizadores...');
                tableBody.innerHTML = `<tr><td colspan="9">A carregar...</td></tr>`;
                try {
                    const users = await apiRequest('/api/admin/users');
                    tableBody.innerHTML = '';
                    if (users.length === 0) { // [CORRIGIDO] A API retorna o array diretamente
                        tableBody.innerHTML = `<tr><td colspan="9">Nenhum utilizador encontrado.</td></tr>`;
                        return;
                    }
                    const showSensitiveData = (currentUserRole === 'master' || currentUserRole === 'DPO');
                    users.forEach(user => { // [CORRIGIDO] A API retorna o array diretamente
                        const row = document.createElement('tr');
                        let cells = `
                            <td>${user.id}</td>
                            <td>${escapeHtml(user.nome_completo || 'N/A')}</td>
                            <td>${escapeHtml(user.email)}</td>
                            <td><span class="badge role-${escapeAttr(user.role)}">${escapeHtml(user.role)}</span></td>
                        `;
                        if (showSensitiveData) {
                            cells += `
                                <td>${escapeHtml(user.setor || 'N/A')}</td>
                                <td>${escapeHtml(user.matricula || 'N/A')}</td>
                                <td>${escapeHtml(user.cpf || 'N/A')}</td>
                            `;
                        }
                        cells += `
                            <td><span class="badge status-${user.is_active ? 'active' : 'inactive'}">${user.is_active ? 'Ativo' : 'Inativo'}</span></td>
                            <td class="action-buttons">
                                ${generateActionButtons(user)}
                            </td>
                        `;
                        row.innerHTML = cells;
                        tableBody.appendChild(row);
                    });
                    attachActionListeners();
                } catch (error) {
                    tableBody.innerHTML = `<tr><td colspan="9">Erro ao carregar utilizadores.</td></tr>`;
                    console.error("Erro ao carregar utilizadores:", error);
                } finally {
                    window.hidePagePreloader();
                }
            };

            const generateActionButtons = (user) => {
                let buttons = '';
                const userId = user.id;
                const isSelf = (user.id === currentUserId);
                const isMasterUser = (user.id === 1);
                if (currentUserRole === 'master') {
                    buttons += `<button class="btn-edit" data-user-id="${userId}" title="Editar Utilizador"><i class="fas fa-pencil-alt"></i></button>`;
                    if (!isMasterUser) {
                        buttons += `<button class="btn-delete" data-user-id="${userId}" title="Eliminar Utilizador"><i class="fas fa-trash-alt"></i></button>`;
                        // [NOVO] Botão de Permissões Individuais
                        buttons += `<button class="btn-secondary btn-permissions" data-user-id="${userId}" title="Permissões Individuais"><i class="fas fa-shield-alt"></i></button>`;
                        buttons += `<button class="btn-secondary" data-user-id="${userId}" data-user-email="${escapeAttr(user.email)}" title="Resetar Senha"><i class="fas fa-key"></i></button>`;
                    }
                } else if (currentUserRole === 'gestao') {
                    if (!isMasterUser) {
                        buttons += `<button class="btn-edit" data-user-id="${userId}" title="Editar Utilizador"><i class="fas fa-pencil-alt"></i></button>`;
                        if (!isSelf) {
                           buttons += `<button class="btn-secondary" data-user-id="${userId}" data-user-email="${escapeAttr(user.email)}" title="Resetar Senha"><i class="fas fa-key"></i></button>`;
                        }
                    }
                }
                return buttons;
            };
            
            const attachActionListeners = () => {
                tableBody.querySelectorAll('.btn-edit').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const userId = e.currentTarget.getAttribute('data-user-id');
                        openModalForEdit(userId);
                    });
                });
                tableBody.querySelectorAll('.btn-delete').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const userId = e.currentTarget.getAttribute('data-user-id');
                        handleDelete(userId);
                    });
                });
                // [NOVO] Listener para o botão de permissões
                tableBody.querySelectorAll('.btn-permissions').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const userId = e.currentTarget.getAttribute('data-user-id'); // currentTarget para pegar o botão, não o ícone
                        openPermissionsModal(userId);
                    });
                });
                // [CORRIGIDO] Seletor mais específico para evitar conflito com o botão de permissões
                tableBody.querySelectorAll('.btn-secondary[data-user-email]').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const userId = e.currentTarget.getAttribute('data-user-id');
                        const userEmail = e.target.getAttribute('data-user-email');
                        openResetPasswordModal(userId, userEmail);
                    });
                });
            };

            const handleFormSubmit = async (event) => {
                event.preventDefault();
                const userId = document.getElementById('userId').value;
                
                let userData = {
                    nome_completo: document.getElementById('userFullName').value,
                    email: document.getElementById('userEmail').value,
                    role: document.getElementById('userRoleSelect').value,
                    is_active: document.getElementById('userIsActive').checked,
                };

                if (currentUserRole === 'master') {
                    userData.setor = document.getElementById('userSetor').value;
                    userData.matricula = document.getElementById('userMatricula').value;
                    userData.cpf = document.getElementById('userCpf').value;
                }

                const password = document.getElementById('userPassword').value;
                if (!userId || password) {
                    if (password && password.length < 6) {
                         showNotification("A senha deve ter pelo menos 6 caracteres.", 'warning');
                         return;
                    }
                    userData.password = password;
                }

                const method = userId ? 'PUT' : 'POST';
                const endpoint = userId ? `/api/admin/users/${userId}` : '/api/admin/users';

                try {
                    const result = await apiRequest(endpoint, method, userData);
                    showNotification(result.message, 'success');
                    closeModal(userModal);
                    loadUsers(); // Recarrega a lista após sucesso
                } catch (error) {
                    showNotification(`Erro: ${error.message}`, 'error');
                }
            };

            const handleDelete = async (userId) => {
                const confirmed = await showConfirmationModal(`Tem a certeza de que deseja eliminar o utilizador com ID ${userId}?`);
                if (confirmed) {
                    try {
                        const result = await apiRequest(`/api/admin/users/${userId}`, 'DELETE');
                        showNotification(result.message, 'success');
                        loadUsers();
                    } catch (error) {
                        showNotification(`Erro: ${error.message}`, 'error');
                    }
                }
            };

            const openModalForCreate = () => {
                userForm.reset();
                document.getElementById('userId').value = '';
                modalTitle.textContent = 'Adicionar Novo Utilizador';
                document.getElementById('userPassword').required = true;
                passwordGroup.style.display = 'block';
                sensitiveDataGroup.style.display = 'block'; 
                
                // [ATUALIZADO] Lógica dinâmica para desativar master
                const masterOption = userRoleSelect.querySelector('option[value="master"]');
                if (masterOption) masterOption.disabled = (currentUserRole !== 'master');
                userModal.classList.remove('hidden');
            };

            const openModalForEdit = async (userId) => {
                try {
                     const users = await apiRequest('/api/admin/users');
                     const user = users.find(u => u.id == userId);
                     if (!user) {
                        showNotification("Erro: Utilizador não encontrado.", 'error');
                        return;
                     }

                    userForm.reset();
                    document.getElementById('userId').value = user.id;
                    document.getElementById('userFullName').value = user.nome_completo || '';
                    document.getElementById('userEmail').value = user.email;
                    document.getElementById('userRoleSelect').value = user.role;
                    document.getElementById('userIsActive').checked = user.is_active;
                    
                    modalTitle.textContent = 'Editar Utilizador';
                    
                    document.getElementById('userPassword').required = false;
                    passwordGroup.style.display = 'none'; 
                    
                    // [ATUALIZADO] Lógica dinâmica para esconder master
                    const masterOption = userRoleSelect.querySelector('option[value="master"]');
                    if (masterOption) masterOption.style.display = (currentUserRole === 'master') ? 'block' : 'none';
                    userRoleSelect.disabled = (currentUserRole === 'gestao' && user.role === 'master');

                    if (currentUserRole === 'master') {
                        document.getElementById('userSetor').value = user.setor || '';
                        document.getElementById('userMatricula').value = user.matricula || '';
                        document.getElementById('userCpf').value = user.cpf || '';
                        sensitiveDataGroup.style.display = 'block';
                    } else {
                        sensitiveDataGroup.style.display = 'none';
                    }

                    userModal.classList.remove('hidden');
                    
                } catch (error) {
                    showNotification(`Erro ao buscar dados do utilizador: ${error.message}`, 'error');
                }
            };

            // [NOVO] Função para abrir o modal de permissões individuais
            const openPermissionsModal = async (userId) => {
                // Cria o modal dinamicamente
                const modalId = 'userPermissionsModal';
                document.getElementById(modalId)?.remove(); // Remove se já existir

                const modalHtml = `
                    <div id="${modalId}" class="modal-overlay">
                        <div class="modal-content large">
                            <button class="modal-close-btn">&times;</button>
                            <h3>Permissões Individuais</h3>
                            <p class="input-hint">Defina permissões específicas para este utilizador. Estas configurações sobrepõem-se ao perfil.</p>
                            <div id="userPermissionsGrid" class="permissions-grid" style="max-height: 50vh; overflow-y: auto; margin: 15px 0;">
                                <p>A carregar...</p>
                            </div>
                            <div class="modal-actions">
                                <button class="btn-secondary modal-close-btn-action">Cancelar</button>
                                <button id="saveUserPermissionsBtn" class="btn-primary">Salvar Permissões</button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.insertAdjacentHTML('beforeend', modalHtml);
                const modal = document.getElementById(modalId);
                const grid = document.getElementById('userPermissionsGrid');

                // Listeners de fechar
                modal.querySelectorAll('.modal-close-btn, .modal-close-btn-action').forEach(btn => 
                    btn.onclick = () => modal.remove()
                );
                setTimeout(() => modal.classList.remove('hidden'), 10);

                try {
                    // Carrega a matriz completa e as permissões do utilizador
                    const [matrixRes, userPermsRes] = await Promise.all([
                        apiRequest('/api/permissions/matrix'),
                        apiRequest(`/api/admin/users/${userId}/permissions`)
                    ]);

                    const matrix = matrixRes.data || matrixRes;
                    const userPerms = userPermsRes.individual_permissions || [];
                    const userRole = userPermsRes.role;

                    // Mapa de permissões individuais: key -> boolean
                    const userMap = {};
                    userPerms.forEach(p => userMap[p.permission_key] = p.is_granted);

                    // Renderiza a grid
                    grid.innerHTML = '';
                    const groups = matrix.permissions.reduce((acc, p) => {
                        acc[p.feature_name] = acc[p.feature_name] || [];
                        acc[p.feature_name].push(p);
                        return acc;
                    }, {});

                    for (const feature in groups) {
                        const groupDiv = document.createElement('div');
                        groupDiv.className = 'permission-group';
                        groupDiv.innerHTML = `<h4>${escapeHtml(feature)}</h4>`;

                        groups[feature].forEach(perm => {
                            const roleHasPerm = matrix.assignments[userRole]?.[perm.permission_key] === true;
                            const userOverride = userMap[perm.permission_key];
                            
                            // Estado visual: Se tem override, usa ele. Se não, usa a role.
                            const isChecked = userOverride !== undefined ? userOverride : roleHasPerm;
                            
                            const itemDiv = document.createElement('div');
                            itemDiv.className = 'permission-item';
                            itemDiv.innerHTML = `
                                <input type="checkbox" id="uperm-${escapeAttr(perm.permission_key)}" data-key="${escapeAttr(perm.permission_key)}" ${isChecked ? 'checked' : ''}>
                                <label for="uperm-${escapeAttr(perm.permission_key)}">${escapeHtml(perm.action_name)} ${roleHasPerm ? '<span style="font-size:10px; color:#718096;">(Padrão: Sim)</span>' : ''}</label>
                            `;
                            groupDiv.appendChild(itemDiv);
                        });
                        grid.appendChild(groupDiv);
                    }

                    // Salvar
                    document.getElementById('saveUserPermissionsBtn').onclick = async () => {
                        const permissions = [];
                        grid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                            const key = cb.dataset.key;
                            const roleHasPerm = matrix.assignments[userRole]?.[key] === true;
                            // Se o estado atual for diferente do padrão da role, envia como override.
                            // Se for igual, envia null para remover o override.
                            const value = (cb.checked !== roleHasPerm) ? cb.checked : null;
                            permissions.push({ key, value });
                        });

                        try {
                            await apiRequest(`/api/admin/users/${userId}/permissions`, 'PUT', { permissions });
                            showNotification('Permissões atualizadas!', 'success');
                            modal.remove();
                        } catch (err) {
                            showNotification('Erro ao salvar: ' + err.message, 'error');
                        }
                    };

                } catch (error) {
                    grid.innerHTML = `<p style="color:red">Erro ao carregar dados: ${error.message}</p>`;
                }
            };

            const closeModal = (modalElement) => {
                modalElement.classList.add('hidden');
            };
            
            const openResetPasswordModal = (userId, userEmail) => {
                resetPasswordForm.reset();
                document.getElementById('resetUserId').value = userId;
                resetUserEmailSpan.textContent = userEmail;
                resetPasswordModal.classList.remove('hidden');
            };
            
            const handleResetPasswordSubmit = async (event) => {
                event.preventDefault();
                const userId = document.getElementById('resetUserId').value;
                const newPassword = document.getElementById('newPassword').value;
                
                if (newPassword.length < 6) {
                    showNotification("A nova senha deve ter pelo menos 6 caracteres.", 'warning');
                    return;
                }
                
                try {
                    const result = await apiRequest(`/api/admin/users/${userId}/reset-password`, 'POST', { newPassword });
                    showNotification(result.message, 'success');
                    closeModal(resetPasswordModal);
                } catch (error) {
                    showNotification(`Erro: ${error.message}`, 'error');
                }
            };

            addUserBtn.addEventListener('click', openModalForCreate);
            userModalCloseBtn.addEventListener('click', () => closeModal(userModal));
            userModalCancelBtn.addEventListener('click', () => closeModal(userModal));
            userForm.addEventListener('submit', handleFormSubmit);
            
            resetModalCloseBtn.addEventListener('click', () => closeModal(resetPasswordModal));
            resetModalCancelBtn.addEventListener('click', () => closeModal(resetPasswordModal));
            resetPasswordForm.addEventListener('submit', handleResetPasswordSubmit);
            
            setupPageByRole();
            loadRolesIntoSelect(); // [NOVO] Carrega as roles ao iniciar
            loadUsers();
        };
    }
});