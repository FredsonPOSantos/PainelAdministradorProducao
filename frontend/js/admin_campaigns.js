if (window.initCampaignsPage) {
    console.warn("Tentativa de carregar admin_campaigns.js múltiplas vezes. A segunda execução foi ignorada.");
} else {
    window.initCampaignsPage = () => {

        // --- ELEMENTOS DO DOM ---
        const addCampaignBtn = document.getElementById('addCampaignBtn');
        const modal = document.getElementById('campaignModal');
        const closeBtn = modal.querySelector('.modal-close-btn');
        const cancelBtn = document.getElementById('cancelBtn');
        const campaignForm = document.getElementById('campaignForm');
        const modalTitle = document.getElementById('modalTitle');
        const tableBody = document.querySelector('#campaignsTable tbody');
        const templateSelect = document.getElementById('campaignTemplateId'); // Novo select
        const targetTypeSelect = document.getElementById('campaignTargetType');
        const targetIdSelect = document.getElementById('campaignTargetId');
        const targetIdGroup = document.getElementById('campaignTargetId').parentElement;

        // --- FUNÇÕES DA PÁGINA ---

        const loadTargetsIntoSelect = async (campaignId = null) => {
            const targetType = targetTypeSelect.value;
            targetIdSelect.innerHTML = '<option value="">A carregar...</option>';

            if (targetType === 'all') {
                targetIdGroup.style.display = 'none';
                targetIdSelect.innerHTML = '';
                return;
            }
            targetIdGroup.style.display = '';

            try {
                const endpoint = campaignId 
                    ? `/api/campaigns/available-targets?campaign_id=${campaignId}` 
                    : '/api/campaigns/available-targets';
                
                const response = await apiRequest(endpoint);
                // [CORRIGIDO] A API retorna o objeto { routers: [], groups: [] } diretamente.
                const availableData = response.data || response;

                let targets = [];
                if (targetType === 'group') {
                    targets = availableData.groups;
                } else if (targetType === 'single_router') {
                    targets = availableData.routers;
                }

                targetIdSelect.innerHTML = '<option value="">Selecione um alvo...</option>';
                if (targets.length === 0) {
                    targetIdSelect.innerHTML = '<option value="">Nenhum alvo disponível</option>';
                    return;
                }

                targets.forEach(target => {
                    const option = document.createElement('option');
                    option.value = target.id;
                    
                    // Validação: Se for roteador individual e pertencer a um grupo, desativa e avisa
                    if (targetType === 'single_router' && target.group_name) {
                        option.textContent = `${target.name} (Pertence ao grupo: ${target.group_name})`;
                        option.disabled = true; // Impede a seleção
                        option.style.color = '#888'; // Visual indicativo de desativado
                    } else {
                        option.textContent = `${target.name} (ID: ${target.id})`;
                    }
                    targetIdSelect.appendChild(option);
                });

            } catch (error) {
                console.error(`Erro ao carregar alvos (${targetType}):`, error);
                targetIdSelect.innerHTML = '<option value="">Erro ao carregar</option>';
            }
        };


        const loadTemplatesIntoSelect = async () => {
            try {
                const response = await apiRequest('/api/templates');
                // [CORRIGIDO] A API retorna o array diretamente.
                const templates = Array.isArray(response) ? response : (response.data || []);
                templateSelect.innerHTML = '<option value="">Selecione um Template</option>';
                templates.forEach(template => {
                    const option = document.createElement('option');
                    option.value = template.id;
                    option.textContent = `${template.name} (ID: ${template.id})`;
                    templateSelect.appendChild(option);
                });
            } catch (error) {
                console.error("Erro ao carregar templates para o select:", error);
            }
        };

        const loadCampaigns = async () => {
            tableBody.innerHTML = '<tr><td colspan="6">A carregar...</td></tr>';
            try {
                const campaigns = await apiRequest('/api/campaigns');
                tableBody.innerHTML = '';
                if (campaigns.length === 0) { // [CORRIGIDO] A API retorna o array diretamente
                    tableBody.innerHTML = '<tr><td colspan="6">Nenhuma campanha encontrada.</td></tr>';
                    return;
                }
                campaigns.forEach(campaign => { // [CORRIGIDO] A API retorna o array diretamente
                    const row = document.createElement('tr');
                    
                    // [NOVO] Lógica para verificar expiração visualmente
                    let statusBadge = `<span class="badge status-${campaign.is_active ? 'active' : 'inactive'}">${campaign.is_active ? 'Ativa' : 'Inativa'}</span>`;
                    
                    if (campaign.is_active && campaign.end_date) {
                        const endDate = new Date(campaign.end_date);
                        const today = new Date();
                        today.setHours(0,0,0,0); // Zera horas para comparar apenas datas
                        
                        // Se a data de fim for anterior a hoje, está expirada
                        if (endDate < today) {
                            statusBadge = `<span class="badge status-inactive" style="background-color: #e53e3e;" title="Expirou em ${endDate.toLocaleDateString()}">Expirada</span>`;
                        }
                    }

                    // Ajustado para mostrar as novas colunas
                    row.innerHTML = `
                        <td>${campaign.id}</td>
                        <td>${escapeHtml(campaign.name)}</td>
                        <td>${escapeHtml(campaign.template_name || 'N/A')}</td>
                        <td>${escapeHtml(campaign.target_type)}</td>
                        <td>${statusBadge}</td>
                        <td class="action-buttons">
                            <button class="btn-preview" title="Pré-visualizar Campanha">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-edit" title="Editar Campanha"><i class="fas fa-pencil-alt"></i></button>
                            <button class="btn-delete" title="Eliminar Campanha"><i class="fas fa-trash-alt"></i></button>
                        </td>
                    `;
                    row.querySelector('.btn-edit').addEventListener('click', () => openModalForEdit(campaign));
                    row.querySelector('.btn-delete').addEventListener('click', () => handleDelete(campaign.id, campaign.name));
                    row.querySelector('.btn-preview').addEventListener('click', () => previewCampaign(campaign.id));
                    tableBody.appendChild(row);
                });
            } catch (error) {
                tableBody.innerHTML = `<tr><td colspan="6">Erro ao carregar campanhas.</td></tr>`;
                console.error("Erro ao carregar campanhas:", error);
            }
        };

        const handleFormSubmit = async (event) => {
            event.preventDefault();
            const campaignId = document.getElementById('campaignId').value;

            // Atualizado para corresponder aos campos do backend
            const campaignData = {
                name: document.getElementById('campaignName').value,
                template_id: document.getElementById('campaignTemplateId').value,
                target_type: document.getElementById('campaignTargetType').value,
                target_id: document.getElementById('campaignTargetId').value || null,
                start_date: document.getElementById('campaignStartDate').value,
                end_date: document.getElementById('campaignEndDate').value,
                is_active: document.getElementById('campaignIsActive').checked
            };
            
            const method = campaignId ? 'PUT' : 'POST';
            const endpoint = campaignId ? `/api/campaigns/${campaignId}` : '/api/campaigns';

            try {
                const result = await apiRequest(endpoint, method, campaignData);
                showNotification(result.message, 'success');
                closeModal();
                loadCampaigns();
            } catch (error) {
                showNotification(`Erro: ${error.message}`, 'error');
            }
        };

        const handleDelete = async (campaignId, campaignName) => {
            const confirmed = await showConfirmationModal(`Tem a certeza de que deseja eliminar a campanha "${campaignName}" (ID: ${campaignId})?`);
            if (confirmed) {
                try {
                    const result = await apiRequest(`/api/campaigns/${campaignId}`, 'DELETE');
                    showNotification(result.message, 'success');
                    loadCampaigns();
                } catch (error) {
                    showNotification(`Erro: ${error.message}`, 'error');
                }
            }
        };

        /**
         * [NOVO] Abre uma nova aba para pré-visualizar a campanha.
         * @param {number} campaignId - O ID da campanha a ser pré-visualizada.
         */
        const previewCampaign = (campaignId) => {
            // [CORRIGIDO] Constrói a URL para o SERVIDOR do hotspot (porta 8081),
            // que irá renderizar o template EJS com os dados da campanha de pré-visualização.
            
            // Ajuste para ambiente de produção: Se estiver no Admin (.47), o Portal está no .46
            let portalHost = window.location.hostname;
            if (portalHost === '10.0.0.47') {
                portalHost = '10.0.0.46';
            }

            const previewUrl = `http://${portalHost}:8081/?previewCampaignId=${campaignId}`;
            window.open(previewUrl, '_blank');
        };

        const openModalForCreate = () => {
            campaignForm.reset();
            document.getElementById('campaignId').value = '';
            modalTitle.textContent = 'Adicionar Nova Campanha';
            loadTemplatesIntoSelect();
            loadTargetsIntoSelect();
            modal.classList.remove('hidden');
        };

        const openModalForEdit = (campaign) => {
            campaignForm.reset();
            document.getElementById('campaignId').value = campaign.id;
            document.getElementById('campaignName').value = campaign.name;
            document.getElementById('campaignTargetType').value = campaign.target_type;
            // Formata as datas para o formato yyyy-mm-dd
            document.getElementById('campaignStartDate').value = new Date(campaign.start_date).toISOString().split('T')[0];
            document.getElementById('campaignEndDate').value = new Date(campaign.end_date).toISOString().split('T')[0];
            document.getElementById('campaignIsActive').checked = campaign.is_active;
            modalTitle.textContent = 'Editar Campanha';
            
            loadTemplatesIntoSelect().then(() => {
                document.getElementById('campaignTemplateId').value = campaign.template_id;
            });

            loadTargetsIntoSelect(campaign.id).then(() => {
                document.getElementById('campaignTargetId').value = campaign.target_id || '';
            });

            modal.classList.remove('hidden');
        };

        const closeModal = () => modal.classList.add('hidden');

        // --- EVENT LISTENERS ---
        addCampaignBtn.addEventListener('click', openModalForCreate);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        campaignForm.addEventListener('submit', handleFormSubmit);
        targetTypeSelect.addEventListener('change', () => {
            const campaignId = document.getElementById('campaignId').value;
            loadTargetsIntoSelect(campaignId || null);
        });

        // --- INICIALIZAÇÃO ---
        loadCampaigns();
    };
}
