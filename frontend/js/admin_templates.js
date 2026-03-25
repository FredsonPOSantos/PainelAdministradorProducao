// Adiciona uma "guarda" para prevenir que o script seja executado mais de uma vez.
if (window.initTemplatesPage) {
    console.warn("Tentativa de carregar admin_templates.js múltiplas vezes. A segunda execução foi ignorada.");
} else {

    /**
     * Define a função no objeto global 'window' para que a guarda funcione
     * e a função seja acessível por outros scripts.
     */
    window.initTemplatesPage = () => {

        // --- ELEMENTOS DO DOM ---
        // A lógica daqui para baixo permanece idêntica à sua versão original.
        const addTemplateBtn = document.getElementById('addTemplateBtn');
        const modal = document.getElementById('templateModal');
        const closeBtn = modal.querySelector('.modal-close-btn');
        const cancelBtn = document.getElementById('cancelBtn');
        const templateForm = document.getElementById('templateForm');
        const modalTitle = document.getElementById('modalTitle');
        const videoUrlGroup = document.getElementById('videoUrlGroup');
        const baseModelSelect = document.getElementById('templateBaseModel');
        const preLoginBannerSelect = document.getElementById('templateBanner');
        const postLoginBannerSelect = document.getElementById('templatePostLoginBanner'); // [NOVO]
        const tableBody = document.querySelector('#templatesTable tbody');

        // [NOVO] Elementos para upload de ficheiros
        const logoSourceUpload = document.getElementById('logoSourceUpload');
        const logoSourceUrl = document.getElementById('logoSourceUrl');
        const logoUploadGroup = document.getElementById('logoUploadGroup');
        const logoUrlGroup = document.getElementById('logoUrlGroup');
        const logoFileInput = document.getElementById('templateLogoFile');

        const bgSourceUpload = document.getElementById('bgSourceUpload');
        const bgSourceUrl = document.getElementById('bgSourceUrl');
        const bgUploadGroup = document.getElementById('bgUploadGroup');
        const bgUrlGroup = document.getElementById('bgUrlGroup');
        const bgFileInput = document.getElementById('templateBgFile');

        // [NOVO] Elementos para a secção de Status
        const statusLogoSourceUpload = document.getElementById('statusLogoSourceUpload');
        const statusLogoSourceUrl = document.getElementById('statusLogoSourceUrl');
        const statusLogoUploadGroup = document.getElementById('statusLogoUploadGroup');
        const statusLogoUrlGroup = document.getElementById('statusLogoUrlGroup');
        const statusLogoFileInput = document.getElementById('templateStatusLogoFile');
        const statusBgSourceColor = document.getElementById('statusBgSourceColor');
        const statusBgSourceImage = document.getElementById('statusBgSourceImage');
        const statusBgColorGroup = document.getElementById('statusBgColorGroup');
        const statusBgImageGroup = document.getElementById('statusBgImageGroup');
        const statusBgFileInput = document.getElementById('templateStatusBgFile');
        const statusBgUrlInput = document.getElementById('templateStatusBgUrl');



        // --- FUNÇÕES INTERNAS DA PÁGINA (ENCAPSULADAS) ---

        const loadTemplates = async () => {
            tableBody.innerHTML = '<tr><td colspan="5">A carregar...</td></tr>';
            try {
                // [CORREÇÃO] Adiciona timestamp para evitar cache do navegador e garantir lista fresca
                const templates = await apiRequest(`/api/templates?t=${Date.now()}`);
                tableBody.innerHTML = '';
                if (templates.length === 0) { // [CORRIGIDO] A API retorna o array diretamente
                    tableBody.innerHTML = '<tr><td colspan="5">Nenhum template encontrado.</td></tr>';
                    return;
                }
                templates.forEach(template => { // [CORRIGIDO] A API retorna o array diretamente
                    const row = document.createElement('tr');
                    
                    // Lógica de Travamento (Sistema)
                    const isSystem = template.is_system === true; // Garante que é booleano
                    const isMaster = window.currentUserProfile && window.currentUserProfile.role === 'master';
                    const canEdit = isMaster || !isSystem;

                    // [NOVO] Adiciona ícone de cadeado se for sistema
                    const systemBadge = isSystem ? '<i class="fas fa-lock" title="Padrão do Sistema" style="color: #cbd5e0; margin-left: 5px;"></i>' : '';
                    
                    // [NOVO] Botão de Visualizar
                    const viewBtn = `<button class="btn-preview" title="Visualizar"><i class="fas fa-eye"></i></button>`;

                    let actionButtons = '';
                    if (canEdit) {
                        actionButtons = `
                            ${viewBtn}
                            <button class="btn-edit" title="Editar Template"><i class="fas fa-pencil-alt"></i></button>
                            <button class="btn-delete" title="Eliminar Template"><i class="fas fa-trash-alt"></i></button>
                        `;
                    } else {
                        actionButtons = `
                            ${viewBtn}
                            <span style="color: #718096; cursor: not-allowed; margin-left: 8px;" title="Protegido pelo Sistema"><i class="fas fa-lock"></i></span>
                        `;
                    }

                    row.innerHTML = `
                        <td>${template.id}</td>
                        <td>${escapeHtml(template.name)} ${systemBadge}</td>
                        <td>${escapeHtml(template.base_model)}</td>
                        <td>${escapeHtml(template.login_type)}</td>
                        <td class="action-buttons">
                            ${actionButtons}
                        </td>
                    `;
                    
                    // [NOVO] Listener para o botão de visualizar
                    const previewButton = row.querySelector('.btn-preview');
                    if (previewButton) {
                        previewButton.addEventListener('click', () => openModalForView(template));
                    }

                    if (canEdit) {
                        row.querySelector('.btn-edit').addEventListener('click', () => openModalForEdit(template));
                        row.querySelector('.btn-delete').addEventListener('click', () => handleDelete(template.id, template.name));
                    }
                    tableBody.appendChild(row);
                });
            } catch (error) {
                tableBody.innerHTML = `<tr><td colspan="5">Erro ao carregar templates.</td></tr>`;
                console.error("Erro ao carregar templates:", error);
            }
        };

        const handleFormSubmit = async (event) => {
            event.preventDefault();
            const templateId = document.getElementById('templateId').value;

            // [NOVO] Usa FormData para enviar ficheiros e texto
            const formData = new FormData();
            formData.append('name', document.getElementById('templateName').value);
            formData.append('base_model', document.getElementById('templateBaseModel').value);
            formData.append('login_type', document.getElementById('templateLoginType').value);
            formData.append('primary_color', document.getElementById('templatePrimaryColor').value);
            formData.append('font_color', document.getElementById('templateFontColor').value);
            formData.append('font_size', document.getElementById('templateFontSize').value || '');
            formData.append('promo_video_url', document.getElementById('templateVideoUrl').value || '');
            formData.append('form_background_color', document.getElementById('templateFormBgColor').value); // [NOVO]
            formData.append('font_family', document.getElementById('templateFontFamily').value); // [NOVO]
            formData.append('prelogin_banner_id', preLoginBannerSelect.value || '');
            formData.append('postlogin_banner_id', postLoginBannerSelect.value || ''); // [NOVO]
            formData.append('status_title', document.getElementById('templateStatusTitle').value || ''); // [NOVO]
            formData.append('status_message', document.getElementById('templateStatusMessage').value || ''); // [NOVO]
            // [NOVO] Campos de personalização da tela de status
            formData.append('status_bg_color', document.getElementById('templateStatusBgColor').value || '');
            formData.append('status_h1_font_size', document.getElementById('templateStatusH1FontSize').value || '');
            formData.append('status_p_font_size', document.getElementById('templateStatusPFontSize').value || '');
            
            // [NOVO] Envia o estado de Padrão do Sistema
            const isSystemCheckbox = document.getElementById('templateIsSystem');
            if (isSystemCheckbox) {
                formData.append('is_system', isSystemCheckbox.checked);
            }



            // Lógica para logótipo
            if (logoSourceUpload.checked && logoFileInput.files[0]) {
                formData.append('logoFile', logoFileInput.files[0]);
            } else {
                formData.append('logoUrl', document.getElementById('templateLogoUrl').value || '');
            }

            // Lógica para imagem de fundo
            if (bgSourceUpload.checked && bgFileInput.files[0]) {
                formData.append('backgroundFile', bgFileInput.files[0]);
            } else {
                formData.append('login_background_url', document.getElementById('templateBgUrl').value || '');
            }

            // [NOVO] Lógica para logótipo da página de status
            if (statusLogoSourceUpload.checked && statusLogoFileInput.files[0]) {
                formData.append('statusLogoFile', statusLogoFileInput.files[0]);
            } else {
                formData.append('status_logo_url', document.getElementById('templateStatusLogoUrl').value || '');
            }

            // [NOVO] Lógica para fundo da página de status
            if (statusBgSourceImage.checked && statusBgFileInput.files[0]) {
                formData.append('statusBgFile', statusBgFileInput.files[0]);
            } else {
                formData.append('status_bg_image_url', statusBgUrlInput.value || '');
            }

            let method = templateId ? 'PUT' : 'POST';
            let endpoint = templateId ? `/api/templates/${templateId}` : '/api/templates';

            try {
                const result = await apiRequest(endpoint, method, formData);
                showNotification(result.message, 'success');
                closeModal();
                loadTemplates();
            } catch (error) {
                // [CORREÇÃO] Se o erro for 404 (Não Encontrado), atualiza a lista para remover o item fantasma
                if (error.message && error.message.includes('404')) {
                    showNotification('Este template já não existe na base de dados. A atualizar a lista...', 'warning');
                    closeModal();
                    loadTemplates();
                } else {
                    showNotification(`Erro ao guardar: ${error.message}`, 'error');
                }
            }
        };

        const handleDelete = async (templateId, templateName) => {
            const confirmed = await showConfirmationModal(`Tem a certeza de que deseja eliminar o template "${templateName}" (ID: ${templateId})?`);
            if (confirmed) {
                try {
                    const result = await apiRequest(`/api/templates/${templateId}`, 'DELETE');
                    showNotification(result.message, 'success');
                    loadTemplates();
                } catch (error) {
                    showNotification(`Erro: ${error.message}`, 'error');
                }
            }
        };

        const loadBannersIntoSelect = async () => {
            try {
                const response = await apiRequest('/api/banners');
                // [CORRIGIDO] A API retorna o array diretamente. Removemos a verificação de .success que falha para arrays.
                const banners = Array.isArray(response) ? response : (response.data || []);
                // Limpa ambos os selects
                preLoginBannerSelect.innerHTML = '<option value="">Nenhum</option>';
                postLoginBannerSelect.innerHTML = '<option value="">Nenhum</option>';

                banners.forEach(banner => {
                    if (banner.is_active) {
                        const option = document.createElement('option');
                        option.value = banner.id;
                        option.textContent = `${banner.name} (ID: ${banner.id})`;

                        if (banner.type === 'pre-login') {
                            preLoginBannerSelect.appendChild(option.cloneNode(true));
                        } else if (banner.type === 'post-login') {
                            postLoginBannerSelect.appendChild(option.cloneNode(true));
                        }
                    }
                });
            } catch (error) {
                console.error("Erro ao carregar banners:", error);
            }
        };

        // [NOVO] Helper para restaurar o estado do formulário (habilitar campos)
        const resetFormState = () => {
            const submitBtn = templateForm.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.style.display = 'block';
            
            const inputs = templateForm.querySelectorAll('input, select, textarea');
            inputs.forEach(input => input.disabled = false);
            
            templateForm.querySelectorAll('.radio-group').forEach(el => el.style.display = 'flex');
        };

        // [NOVO] Abre o modal em modo de visualização (somente leitura)
        const openModalForView = (template) => {
            openModalForEdit(template); // Reutiliza a lógica de preenchimento
            
            modalTitle.textContent = 'Visualizar Template';
            const submitBtn = templateForm.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.style.display = 'none'; // Esconde botão de salvar
            
            const inputs = templateForm.querySelectorAll('input, select, textarea');
            inputs.forEach(input => input.disabled = true); // Desabilita inputs
            
            // Esconde controles de upload/url para limpar a visualização
            templateForm.querySelectorAll('.radio-group').forEach(el => el.style.display = 'none');
        };

        const openModalForCreate = () => {
            templateForm.reset();
            resetFormState(); // [NOVO] Garante que o formulário está editável
            document.getElementById('templateId').value = '';
            modalTitle.textContent = 'Adicionar Novo Template';
            videoUrlGroup.style.display = 'none';
            document.getElementById('templateVideoUrl').required = false;
            // [NOVO] Garante que o modo de upload esteja selecionado ao criar
            logoSourceUpload.checked = true;
            bgSourceUpload.checked = true;
            toggleSourceInputs();
            // [NOVO] Reseta os campos de status
            statusLogoSourceUpload.checked = true;
            toggleStatusLogoSourceInputs();
            // [NOVO] Reseta os campos de fundo de status
            statusBgSourceColor.checked = true;
            toggleStatusBgSourceInputs();

            // [NOVO] Reseta e configura o checkbox de sistema
            const isSystemCheckbox = document.getElementById('templateIsSystem');
            if (isSystemCheckbox) {
                isSystemCheckbox.checked = false;
                const isMaster = window.currentUserProfile && window.currentUserProfile.role === 'master';
                isSystemCheckbox.disabled = !isMaster;
            }

            loadBannersIntoSelect();
            modal.classList.remove('hidden');
        };

        const openModalForEdit = (template) => {
            templateForm.reset();
            resetFormState(); // [NOVO] Garante que o formulário está editável
            document.getElementById('templateId').value = template.id;
            document.getElementById('templateName').value = template.name;
            document.getElementById('templateBaseModel').value = template.base_model;
            document.getElementById('templateLoginType').value = template.login_type;
            document.getElementById('templatePrimaryColor').value = template.primary_color || '#3182ce';
            document.getElementById('templateFontColor').value = template.font_color || '#2d3748';
            document.getElementById('templateFontSize').value = template.font_size || '';
            document.getElementById('templateFormBgColor').value = template.form_background_color || '#ffffff'; // [NOVO]
            document.getElementById('templateFontFamily').value = template.font_family || "'Inter', sans-serif"; // [NOVO]
            document.getElementById('templateLogoUrl').value = template.logo_url || '';
            document.getElementById('templateBgUrl').value = template.login_background_url || '';
            document.getElementById('templateVideoUrl').value = template.promo_video_url || '';
            // [NOVO] Preenche os campos de status
            document.getElementById('templateStatusTitle').value = template.status_title || '';
            document.getElementById('templateStatusMessage').value = template.status_message || '';
            document.getElementById('templateStatusLogoUrl').value = template.status_logo_url || '';
            // [NOVO] Preenche os campos de personalização de status
            document.getElementById('templateStatusBgColor').value = template.status_bg_color || '#f0f2f5';
            statusBgUrlInput.value = template.status_bg_image_url || '';
            document.getElementById('templateStatusH1FontSize').value = template.status_h1_font_size || '';
            document.getElementById('templateStatusPFontSize').value = template.status_p_font_size || '';

            // [NOVO] Define o estado do checkbox de sistema
            const isSystemCheckbox = document.getElementById('templateIsSystem');
            if (isSystemCheckbox) {
                isSystemCheckbox.checked = template.is_system === true;
                const isMaster = window.currentUserProfile && window.currentUserProfile.role === 'master';
                isSystemCheckbox.disabled = !isMaster;
            }


            videoUrlGroup.style.display = template.base_model === 'V2' ? 'block' : 'none';
            document.getElementById('templateVideoUrl').required = template.base_model === 'V2';

            // [NOVO] Ao editar, assume que as URLs existentes são do tipo URL
            logoSourceUrl.checked = true;
            bgSourceUrl.checked = true;
            statusLogoSourceUrl.checked = true; // [NOVO]
            toggleStatusLogoSourceInputs(); // [CORRIGIDO] Chama a função correta
            // [NOVO] Define o seletor de fundo com base nos dados
            statusBgSourceImage.checked = !!template.status_bg_image_url;
            statusBgSourceColor.checked = !template.status_bg_image_url;
            toggleStatusBgSourceInputs();
            toggleSourceInputs();

            loadBannersIntoSelect().then(() => {
                preLoginBannerSelect.value = template.prelogin_banner_id || '';
                postLoginBannerSelect.value = template.postlogin_banner_id || ''; // [NOVO]
            });
            modalTitle.textContent = 'Editar Template';
            modal.classList.remove('hidden');
        };

        const closeModal = () => modal.classList.add('hidden');

        // [NOVO] Função para alternar entre upload e URL
        const toggleSourceInputs = () => {
            // Lógica para o logótipo
            logoUploadGroup.classList.toggle('hidden', !logoSourceUpload.checked);
            logoUrlGroup.classList.toggle('hidden', logoSourceUpload.checked);
            logoFileInput.required = logoSourceUpload.checked;
            document.getElementById('templateLogoUrl').required = !logoSourceUpload.checked;

            // Lógica para a imagem de fundo
            bgUploadGroup.classList.toggle('hidden', !bgSourceUpload.checked);
            bgUrlGroup.classList.toggle('hidden', bgSourceUpload.checked);
            bgFileInput.required = bgSourceUpload.checked;
            document.getElementById('templateBgUrl').required = !bgSourceUpload.checked;
        };

        // [NOVO] Função para alternar o input do logo de status
        const toggleStatusLogoSourceInputs = () => {
            statusLogoUploadGroup.classList.toggle('hidden', !statusLogoSourceUpload.checked);
            statusLogoUrlGroup.classList.toggle('hidden', statusLogoSourceUpload.checked);
            statusLogoFileInput.required = statusLogoSourceUpload.checked;
            document.getElementById('templateStatusLogoUrl').required = !statusLogoSourceUpload.checked;
        };

        // [NOVO] Função para alternar o input do fundo de status
        const toggleStatusBgSourceInputs = () => {
            statusBgColorGroup.classList.toggle('hidden', !statusBgSourceColor.checked);
            statusBgImageGroup.classList.toggle('hidden', statusBgSourceColor.checked);
        };


        // --- EVENT LISTENERS ---
        baseModelSelect.addEventListener('change', () => {
            videoUrlGroup.style.display = baseModelSelect.value === 'V2' ? 'block' : 'none';
        });
        addTemplateBtn.addEventListener('click', openModalForCreate);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        templateForm.addEventListener('submit', handleFormSubmit);

        // [NOVO] Listeners para os seletores de fonte (logo e fundo)
        logoSourceUpload.addEventListener('change', toggleSourceInputs);
        logoSourceUrl.addEventListener('change', toggleSourceInputs);
        bgSourceUpload.addEventListener('change', toggleSourceInputs);
        bgSourceUrl.addEventListener('change', toggleSourceInputs);
        // [NOVO] Listeners para o logo de status
        statusLogoSourceUpload.addEventListener('change', toggleStatusLogoSourceInputs);
        statusLogoSourceUrl.addEventListener('change', toggleStatusLogoSourceInputs);
        // [NOVO] Listeners para o fundo de status
        statusBgSourceColor.addEventListener('change', toggleStatusBgSourceInputs);
        statusBgSourceImage.addEventListener('change', toggleStatusBgSourceInputs);


        // --- INICIALIZAÇÃO DA PÁGINA ---
        loadTemplates();
    };
}
