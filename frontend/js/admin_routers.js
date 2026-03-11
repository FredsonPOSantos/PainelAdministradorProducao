// Ficheiro: js/admin_routers.js
window.initRoutersPage = () => {
        console.log("A inicializar a página de gestão de Roteadores...");
        const groupPrefixes = { 'CS': 'Cidade Sol', 'RT': 'Rota Transportes', 'GB': 'Grupo Brasileiro', 'EB': 'Expresso Brasileiro', 'MKT': 'Marketing', 'VM': 'Via Metro', 'VIP': 'Sala Vip', 'GNC': 'Genérico' };

        // --- ELEMENTOS DO DOM ---
        const routersTableBody = document.querySelector('#routersTable tbody');
        const groupsTableBody = document.querySelector('#groupsTable tbody');
        const checkStatusBtn = document.getElementById('checkStatusBtn');
        const addGroupBtn = document.getElementById('addGroupBtn');
        const groupModal = document.getElementById('groupModal');
        const groupForm = document.getElementById('groupForm');
        
        const routerModal = document.getElementById('routerModal');
        const routerForm = document.getElementById('routerForm');

        const discoverRoutersBtn = document.getElementById('discoverRoutersBtn');
        const discoverModal = document.getElementById('discoverModal');
        const discoverForm = document.getElementById('discoverForm');

        // [NOVO] Injeta a coluna "Visto em" no cabeçalho da tabela se não existir
        const tableHeadRow = document.querySelector('#routersTable thead tr');
        if (tableHeadRow && !tableHeadRow.querySelector('.th-last-seen')) {
            const th = document.createElement('th');
            th.className = 'th-last-seen';
            th.textContent = 'Visto em';
            // Insere antes da última coluna (Ações)
            tableHeadRow.insertBefore(th, tableHeadRow.lastElementChild);
        }

        // [NOVO] Cria e injeta o botão de exportar para Excel ao lado dos outros botões de ação
        if (checkStatusBtn && checkStatusBtn.parentElement) {
            // Verifica se já existe para não duplicar
            if (!document.getElementById('exportExcelBtn')) {
                const exportExcelBtn = document.createElement('button');
                exportExcelBtn.id = 'exportExcelBtn';
                exportExcelBtn.className = 'btn-secondary';
                exportExcelBtn.innerHTML = '<i class="fas fa-file-excel" style="margin-right: 8px;"></i>Exportar Excel';
                // Adiciona o botão no mesmo container que o "Verificar Status"
                checkStatusBtn.parentElement.appendChild(exportExcelBtn);
            }

            // [NOVO] Cria e injeta o campo de pesquisa
            if (!document.getElementById('routerSearchInput')) {
                const searchInput = document.createElement('input');
                searchInput.type = 'text';
                searchInput.id = 'routerSearchInput';
                searchInput.placeholder = 'Pesquisar (Nome/IP)...';
                searchInput.style.cssText = 'padding: 6px 12px; margin-left: 10px; border: 1px solid #4B5563; border-radius: 4px; background-color: #374151; color: #fff; width: 200px;';
                
                searchInput.addEventListener('input', (e) => {
                    const term = e.target.value.toLowerCase();
                    const filtered = allRouters.filter(r => r.name.toLowerCase().includes(term) || (r.ip_address && r.ip_address.includes(term)));
                    displayRouters(filtered, 1); // [NOVO] Reseta para a primeira página ao pesquisar
                });
                checkStatusBtn.parentElement.appendChild(searchInput);
            }

            // [NOVO] Cria e injeta o seletor de período para disponibilidade
            if (!document.getElementById('availabilityPeriodSelect')) {
                const periodSelect = document.createElement('select');
                periodSelect.id = 'availabilityPeriodSelect';
                periodSelect.style.cssText = 'padding: 6px 12px; margin-left: 10px; border: 1px solid #4B5563; border-radius: 4px; background-color: #374151; color: #fff;';
                periodSelect.innerHTML = `
                    <option value="24h" selected>24 Horas</option>
                    <option value="7d">7 Dias</option>
                    <option value="30d">30 Dias</option>
                `;
                // Insere antes do botão de verificar status
                checkStatusBtn.parentElement.insertBefore(periodSelect, checkStatusBtn);
            }
        }
        
        // [NOVO] Cria e injeta o container da paginação abaixo da tabela
        const tableContainer = document.querySelector('#routersTable')?.parentElement;
        if (tableContainer && !document.getElementById('routersPagination')) {
            const paginationContainer = document.createElement('div');
            paginationContainer.id = 'routersPagination';
            paginationContainer.className = 'pagination-container';
            tableContainer.appendChild(paginationContainer);
        }
        
        // [ADICIONADO] Elementos dos Cartões de Estatísticas
        const totalRoutersCard = document.getElementById('totalRouters');
        const totalGroupsCard = document.getElementById('totalGroups');
        
        // [NOVO] Variável para guardar a instância do gráfico e evitar duplicados
        let groupAnalyticsChartInstance = null;

        let allRouters = [];
        let allGroups = [];

        // [NOVO] Variáveis de estado para paginação
        let currentPage = 1;
        const rowsPerPage = 15; // Define quantos roteadores por página
        
        // [NOVO] Variável para o intervalo de atualização
        let autoRefreshInterval;

        // --- Funções Principais de Carregamento ---

        const loadPageData = async (isAutoRefresh = false) => {
            // Só mostra o preloader se NÃO for uma atualização automática
            if (!isAutoRefresh) window.showPagePreloader('A carregar roteadores...');
            
            try {
                // [MODIFICADO] Adicionado "A carregar..." aos cartões
                if (!isAutoRefresh) {
                    totalRoutersCard.textContent = '...';
                    totalGroupsCard.textContent = '...';
                }

                const [groupsResponse, routersResponse] = await Promise.all([
                    apiRequest('/api/routers/groups'),
                    apiRequest('/api/monitoring/all-routers-status') // [CORRIGIDO] Usa a rota que já calcula o tempo de inatividade
                ]);
                allGroups = groupsResponse; // [CORRIGIDO] A API retorna o array diretamente
                allRouters = routersResponse; // [CORRIGIDO] A API retorna o array diretamente

                // [ADICIONADO] Atualiza os cartões de estatísticas
                totalRoutersCard.textContent = allRouters.length; // [CORRIGIDO]
                totalGroupsCard.textContent = allGroups.length; // [CORRIGIDO]

                // Continua a carregar o resto da página
                displayGroups();
                displayRouters();
            } catch (error) {
                console.error("Erro ao carregar dados da página:", error);
                // [ADICIONADO] Define "Erro" nos cartões se falhar
                totalRoutersCard.textContent = 'Erro';
                totalGroupsCard.textContent = 'Erro';
            } finally {
                if (!isAutoRefresh) window.hidePagePreloader();
            }
        };

        const displayGroups = () => {
            groupsTableBody.innerHTML = '';
            if (!allGroups || allGroups.length === 0) {
                groupsTableBody.innerHTML = '<tr><td colspan="5">Nenhum grupo encontrado.</td></tr>';
                return;
            }
            allGroups.forEach(group => {
                const row = document.createElement('tr');
                // [MODIFICADO] router_count agora vem da API de grupos
                const routerCount = group.router_count || 0;
                row.innerHTML = `
                    <td>${group.id}</td>
                    <td>${group.name}</td>
                    <td>${group.observacao || 'N/A'}</td>
                    <td>${routerCount}</td> 
                    <td class="action-buttons">
                        <button class="btn-preview" onclick="window.handleShowGroupAnalytics(${group.id}, '${group.name.replace(/'/g, "\\'")}')" title="Ver Análise de Utilizadores"><i class="fas fa-eye"></i></button>
                        <button class="btn-edit" onclick="openModalForEditGroup(${group.id})" title="Editar Grupo"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn-delete" onclick="handleDeleteGroup(${group.id})" title="Eliminar Grupo"><i class="fas fa-trash-alt"></i></button>
                    </td>
                `;
                groupsTableBody.appendChild(row);
            });
        };

        const displayRouters = (routersList = allRouters, page = currentPage) => {
            currentPage = page;
            routersTableBody.innerHTML = '';
            const groupMap = new Map(allGroups.map(group => [group.id, group.name]));

            // [NOVO] Lógica de paginação
            const startIndex = (currentPage - 1) * rowsPerPage;
            const endIndex = startIndex + rowsPerPage;
            const paginatedItems = routersList.slice(startIndex, endIndex);

            if (paginatedItems.length === 0) {
                routersTableBody.innerHTML = '<tr><td colspan="5">Nenhum roteador encontrado.</td></tr>';
                renderPagination(0, routersList); // Limpa a paginação
                return;
            }

            paginatedItems.forEach(router => {
                // --- LINHA PRINCIPAL ---
                const row = document.createElement('tr');
                row.className = 'router-main-row'; // Classe para estilo e clique
                row.dataset.routerId = router.id; // [NOVO] Adiciona ID para facilitar a busca na exportação
                // [CORRIGIDO] Usa o group_name que já vem da API, em vez de fazer a busca no mapa.
                const groupName = router.group_name || 'Nenhum';
                
                // [MODIFICADO] Lógica de exibição do status na tabela
                let statusDotClass = `status-${router.status || 'offline'}`;
                let statusLabel = router.status || 'offline';
                
                if (router.is_maintenance) {
                    statusDotClass = 'status-maintenance'; // Nova classe CSS
                    statusLabel = 'Manutenção';
                }

                // [NOVO] Lógica para exibir o tempo de inatividade e o alerta visual
                let downtimeHTML = router.downtime || '-';
                if (router.downtime_alert) {
                    // Adiciona um ícone de alerta e uma cor vermelha se o tempo de inatividade for >= 24h
                    downtimeHTML = `<span style="color: var(--error-text, #ef4444); font-weight: bold;" title="Este roteador está offline há 24 horas ou mais."><i class="fas fa-exclamation-triangle" style="margin-right: 5px;"></i>${router.downtime}</span>`;
                }

                // Evento de clique para expandir
                row.onclick = (e) => {
                    // Não expande se clicar nos botões de ação
                    if (e.target.closest('.action-buttons')) return;
                    toggleRouterDetails(router.id);
                };

                // [NOVO] Formata o uptime inicial se disponível
                let uptimeDisplay = '-';
                if (router.uptime_seconds !== null && router.uptime_seconds !== undefined) {
                    if (typeof formatUptime === 'function') {
                        uptimeDisplay = formatUptime(router.uptime_seconds);
                    } else {
                        uptimeDisplay = router.uptime_seconds + 's';
                    }
                }

                // [NOVO] Formata a data de última visualização
                // [CORREÇÃO] Volta a usar 'last_seen' para incluir as verificações automáticas de fundo
                const lastSeenDisplay = router.last_seen ? new Date(router.last_seen).toLocaleString('pt-BR') : 'Nunca';

                row.innerHTML = `
                    <td>${router.id}</td>
                    <td>${router.name}</td>
                    <td><span class="status-dot ${statusDotClass}"></span> ${statusLabel}</td>
                    <td>${router.observacao || 'N/A'}</td> 
                    <td>${lastSeenDisplay}</td>
                    <td class="action-buttons">
                        <button class="btn-secondary btn-refresh" onclick="window.refreshSingleRouter(${router.id})" title="Forçar verificação imediata de status"><i class="fas fa-sync-alt"></i></button>
                        <button class="btn-edit" onclick="openModalForEditRouter(${router.id})" title="Editar Roteador"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn-delete" onclick="handleDeleteRouter(${router.id})" title="Eliminar Roteador"><i class="fas fa-trash-alt"></i></button>
                        <button class="btn-secondary" onclick="toggleMaintenance(${router.id}, ${router.is_maintenance})" title="Modo Manutenção"><i class="fas fa-tools"></i></button>
                        <button class="btn-secondary" onclick="viewRouterHistory(${router.id})" title="Histórico"><i class="fas fa-history"></i></button>
                        <button class="btn-secondary" onclick="toggleRouterDetails(${router.id})" title="Ver Detalhes"><i class="fas fa-chevron-down"></i></button>
                    </td>
                `;
                routersTableBody.appendChild(row);

                // --- LINHA DE DETALHES (EXPANSÍVEL) ---
                const detailsRow = document.createElement('tr');
                detailsRow.id = `details-${router.id}`;
                detailsRow.className = 'router-details-row hidden';
                detailsRow.innerHTML = `
                    <td colspan="5">
                    <td colspan="6">
                        <div class="router-details-grid">
                            <div class="detail-item">
                                <span class="detail-label">Latência</span>
                                <span class="detail-value" id="latency-${router.id}">${router.latency ? router.latency + ' ms' : '-'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Tempo Atividade</span>
                                <span class="detail-value" id="uptime-${router.id}">${uptimeDisplay}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Disponibilidade</span>
                                <span class="detail-value" id="availability-${router.id}">-</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Inatividade</span>
                                <span class="detail-value" id="downtime-${router.id}">${downtimeHTML}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Visto por Último</span>
                                <span class="detail-value" id="last-seen-${router.id}">${lastSeenDisplay}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Grupo</span>
                                <span class="detail-value">${groupName}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Interface Monitorada</span>
                                <span class="detail-value">${router.monitoring_interface || '-'}</span>
                            </div>
                        </div>
                    </td>
                `;
                routersTableBody.appendChild(detailsRow);
            });

            // [NOVO] Renderiza os controlos da paginação
            renderPagination(routersList.length, routersList);
        };

        // [NOVO] Função para alternar a visibilidade dos detalhes
        window.toggleRouterDetails = (id) => {
            const row = document.getElementById(`details-${id}`);
            if (row) row.classList.toggle('hidden');
        };

        // [NOVO] Função para renderizar os botões de paginação
        const renderPagination = (totalItems, listToPaginate) => {
            const paginationContainer = document.getElementById('routersPagination');
            if (!paginationContainer) return;

            const totalPages = Math.ceil(totalItems / rowsPerPage);
            paginationContainer.innerHTML = '';

            if (totalPages <= 1) return;

            const createButton = (text, page, isDisabled = false, isActive = false) => {
                const button = document.createElement('button');
                button.textContent = text;
                button.disabled = isDisabled;
                if (isActive) button.classList.add('active');
                button.addEventListener('click', () => displayRouters(listToPaginate, page));
                return button;
            };

            // Botão "Anterior"
            paginationContainer.appendChild(createButton('Anterior', currentPage - 1, currentPage === 1));

            // Botões de página (simplificado para mostrar apenas a página atual)
            const pageInfo = document.createElement('span');
            pageInfo.className = 'pagination-info';
            pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
            paginationContainer.appendChild(pageInfo);

            // Botão "Próximo"
            paginationContainer.appendChild(createButton('Próximo', currentPage + 1, currentPage === totalPages));
        };

        // --- Lógica para Roteadores Individuais (Edição e Eliminação) ---
        
        window.openModalForEditRouter = (routerId) => {
            const router = allRouters.find(r => r.id === routerId);
            if (!router) return;
            routerForm.reset();
            document.getElementById('routerId').value = router.id;
            document.getElementById('routerName').value = router.name;
            document.getElementById('routerIpAddress').value = router.ip || ''; // [CORRIGIDO] Usa a propriedade 'ip' que vem da API de monitoramento

            // --- [MODIFICADO] Lógica para a seleção da interface de monitoramento ---
            const monitoringInterfaceInput = document.getElementById('routerMonitoringInterface');
            const parentGroup = monitoringInterfaceInput.parentElement;

            // Remove o select antigo se existir, para reconstruir
            const oldSelect = parentGroup.querySelector('select#routerMonitoringInterface');
            if (oldSelect) {
                oldSelect.remove();
            }
            // Garante que o input original esteja visível por padrão
            monitoringInterfaceInput.style.display = 'block';

            // Se o roteador estiver online e tiver uma lista de interfaces, cria um dropdown
            if (router.status === 'online' && router.interfaces && router.interfaces.length > 0) {
                monitoringInterfaceInput.style.display = 'none'; // Esconde o input de texto

                const select = document.createElement('select');
                select.id = 'routerMonitoringInterface';
                select.name = 'monitoring_interface';

                // Opção para desativar
                select.innerHTML = '<option value="">Nenhuma (desativado)</option>';

                // Popula com as interfaces encontradas
                router.interfaces.forEach(iface => {
                    const option = document.createElement('option');
                    option.value = iface.name;
                    option.textContent = iface.name;
                    if (iface.name === router.monitoring_interface) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                });
                
                parentGroup.appendChild(select);
            } else {
                // Se estiver offline ou sem interfaces, usa o input de texto normal
                monitoringInterfaceInput.value = router.monitoring_interface || '';
            }

            document.getElementById('routerDescription').value = router.observacao;

            // [NOVO] Preenche os campos de credenciais da API para monitoramento de interface
            const apiUserInput = document.getElementById('routerApiUser');
            const apiPortInput = document.getElementById('routerApiPort');
            const apiPasswordInput = document.getElementById('routerApiPassword');

            if (apiUserInput) apiUserInput.value = router.username || '';
            if (apiPortInput) apiPortInput.value = router.api_port || '';
            if (apiPasswordInput) apiPasswordInput.value = ''; // Nunca preenche a senha por segurança

            routerModal.classList.remove('hidden');
        };


        const handleRouterFormSubmit = async (event) => {
            event.preventDefault();
            const routerId = document.getElementById('routerId').value;
            const routerData = { 
                observacao: document.getElementById('routerDescription').value,
                ip_address: document.getElementById('routerIpAddress').value || null,
                monitoring_interface: document.getElementById('routerMonitoringInterface').value || null // [NOVO]
            };
            try {
                const result = await apiRequest(`/api/routers/${routerId}`, 'PUT', routerData);
                showNotification(result.message, 'success');
                routerModal.classList.add('hidden');
                loadPageData(); // Recarrega para atualizar a lista local
            } catch (error) {
                showNotification(`Erro: ${error.message}`, 'error');
            }
        };
        
        // [NOVO] Alternar Modo de Manutenção
        window.toggleMaintenance = async (id, currentStatus) => {
            const newStatus = !currentStatus;
            const action = newStatus ? 'ativar' : 'desativar';
            if (!confirm(`Deseja ${action} o modo de manutenção para este roteador?`)) return;

            try {
                // [CORREÇÃO] Usa a rota padrão de update, pois o controller já suporta is_maintenance
                await apiRequest(`/api/routers/${id}`, 'PUT', { is_maintenance: newStatus });
                showNotification(`Modo de manutenção ${action} com sucesso.`, 'success');
                loadPageData();
            } catch (e) {
                showNotification(`Erro ao alterar modo de manutenção: ${e.message}`, 'error');
            }
        };

        // [NOVO] Ver Histórico
        window.viewRouterHistory = async (id) => {
            // Abre um modal simples com logs filtrados
            const modalHtml = `
                <div id="historyModal" class="modal-overlay visible">
                    <div class="modal-content large">
                        <h3>Histórico do Roteador #${id}</h3>
                        <div id="historyContent" style="min-height: 200px;">
                            <div style="display: flex; justify-content: center; align-items: center; height: 100%;">
                                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i>
                            </div>
                        </div>
                        <div class="modal-actions"><button class="btn-primary" onclick="document.getElementById('historyModal').remove()">Fechar</button></div>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            try {
                const response = await apiRequest(`/api/logs/activity?target_type=router&target_id=${id}`); // [CORRIGIDO] Filtro exato por tipo e ID
                const logs = response.data || response;

                if (!Array.isArray(logs) || logs.length === 0) {
                    document.getElementById('historyContent').innerHTML = `<p style="text-align: center; padding: 20px;">Nenhum registo de histórico encontrado para este roteador.</p>`;
                    return;
                }

                let tableHtml = `
                    <p style="margin-bottom: 15px;">Encontrados <strong>${logs.length}</strong> registos de atividade.</p>
                    <div class="table-container" style="max-height: 500px; overflow-y: auto;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr>
                                    <th>Data/Hora</th>
                                    <th>Utilizador</th>
                                    <th>Ação</th>
                                    <th>Status</th>
                                    <th>Descrição</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                logs.forEach(log => {
                    const timestamp = new Date(log.timestamp).toLocaleString('pt-BR');
                    const statusBadge = log.status === 'SUCCESS' 
                        ? '<span class="badge status-active">Sucesso</span>' 
                        : '<span class="badge status-inactive">Falha</span>';

                    tableHtml += `
                        <tr>
                            <td>${timestamp}</td>
                            <td>${log.user_email || 'Sistema'}</td>
                            <td>${log.action}</td>
                            <td>${statusBadge}</td>
                            <td>${log.description || ''}</td>
                        </tr>
                    `;
                });

                tableHtml += `
                            </tbody>
                        </table>
                    </div>
                `;

                document.getElementById('historyContent').innerHTML = tableHtml;
            } catch (error) {
                console.error("Erro ao carregar histórico:", error);
                document.getElementById('historyContent').innerHTML = `<p style="color: #e53e3e; text-align: center;">Erro ao carregar histórico: ${error.message}</p>`;
            }
        };

        window.handleDeleteRouter = async (routerId) => {
            const hasPermanentDeletePermission = window.currentUserProfile?.permissions['routers.individual.delete_permanent'];

            const modalTitle = 'Confirmar Exclusão de Roteador';
            const modalMessage = 'Como deseja proceder com a exclusão?';
            
            const modalButtons = [
                { text: 'Cancelar', value: 'cancel', class: 'btn-secondary' },
                { text: 'Remover (Manter Histórico)', value: 'soft_delete', class: 'btn-delete' }
            ];

            if (hasPermanentDeletePermission) {
                modalButtons.push({ text: 'Excluir Permanentemente', value: 'permanent_delete', class: 'btn-danger' });
            }

            const userChoice = await showConfirmationModal(modalMessage, modalTitle, modalButtons);

            if (userChoice === 'cancel' || !userChoice) {
                showNotification('Operação cancelada.', 'info');
                return;
            }

            let endpoint = '';
            if (userChoice === 'soft_delete') {
                endpoint = `/api/routers/${routerId}`;
            } else if (userChoice === 'permanent_delete' && hasPermanentDeletePermission) {
                endpoint = `/api/routers/${routerId}/permanent`;
            } else {
                return; // Nenhuma ação válida
            }

            try {
                const result = await apiRequest(endpoint, 'DELETE');
                showNotification(result.message, 'success');
                loadPageData();
            } catch (error) {
                showNotification(`Erro: ${error.message}`, 'error');
            }
        };

        // [NOVO] Função para formatar a duração da inatividade
        const formatDowntime = (startDate) => {
            if (!startDate) return '-';
            
            const downMs = Date.now() - new Date(startDate).getTime();
            if (downMs < 0) return '0m';

            const seconds = Math.floor(downMs / 1000);
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);

            let parts = [];
            if (days > 0) parts.push(`${days}d`);
            if (hours > 0) parts.push(`${hours}h`);
            if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`); // Mostra minutos se for a única unidade

            return parts.join(' ');
        };

        // [NOVO] Variável de controle para cancelamento
        let isCheckingStatus = false;

        // --- NOVA LÓGICA DE VERIFICAÇÃO DE STATUS ---
        const handleCheckAllStatus = async () => {
            // Se já estiver a verificar, o clique serve para cancelar
            if (isCheckingStatus) {
                isCheckingStatus = false;
                checkStatusBtn.textContent = 'A cancelar...';
                checkStatusBtn.disabled = true; // Evita cliques múltiplos enquanto para
                return;
            }

            isCheckingStatus = true;
            checkStatusBtn.textContent = 'Cancelar'; // Muda o botão para Cancelar
            checkStatusBtn.classList.add('btn-danger'); // Adiciona estilo visual de alerta (opcional)
            const selectedPeriod = document.getElementById('availabilityPeriodSelect')?.value || '24h'; // [NOVO] Pega o período

            // [MODIFICADO] Usa a lista completa de roteadores (allRouters) em vez de apenas os da página atual
            // Isso garante que TODOS os roteadores sejam verificados, mesmo os que estão na página 2, 3, etc.
            if (allRouters.length === 0) {
                 isCheckingStatus = false;
                 checkStatusBtn.textContent = 'Verificar Status';
                 checkStatusBtn.classList.remove('btn-danger');
                 showNotification('Nenhum roteador para verificar.', 'warning');
                 return;
            }

            // [NOVO] Cria a barra de progresso
            const progressContainer = document.createElement('div');
            progressContainer.style.cssText = 'margin-top: 10px; width: 100%; background: #374151; border-radius: 4px; overflow: hidden; height: 8px;';
            const progressBar = document.createElement('div');
            progressBar.style.cssText = 'width: 0%; height: 100%; background: #10b981; transition: width 0.2s ease;';
            progressContainer.appendChild(progressBar);
            checkStatusBtn.parentNode.insertBefore(progressContainer, checkStatusBtn.nextSibling);

            let processedCount = 0;
            const totalCount = allRouters.length;

            for (const router of allRouters) {
                // [NOVO] Atualiza o texto do botão para mostrar progresso real (ex: "Verificando 5/50...")
                checkStatusBtn.textContent = `Verificando ${processedCount + 1}/${totalCount}...`;

                // [NOVO] Verifica se o processo foi cancelado ou se o utilizador saiu da página
                // document.body.contains(checkStatusBtn) retorna false se o botão não estiver mais no DOM (mudança de página)
                if (!isCheckingStatus || !document.body.contains(checkStatusBtn)) {
                    isCheckingStatus = false;
                    break;
                }

                // Tenta encontrar a linha na tabela (se estiver na página atual)
                const row = routersTableBody.querySelector(`tr[data-router-id="${router.id}"]`);
                let statusCell, latencyEl, uptimeEl, availEl, downtimeEl, lastSeenEl;

                if (row) {
                    statusCell = row.cells[2];
                    latencyEl = document.getElementById(`latency-${router.id}`);
                    uptimeEl = document.getElementById(`uptime-${router.id}`);
                    availEl = document.getElementById(`availability-${router.id}`);
                    downtimeEl = document.getElementById(`downtime-${router.id}`);
                    lastSeenEl = document.getElementById(`last-seen-${router.id}`);

                    if (statusCell) statusCell.innerHTML = 'Verificando...';
                    if(latencyEl) latencyEl.textContent = '...';
                    if(uptimeEl) uptimeEl.textContent = '...';
                    if(availEl) availEl.textContent = '...';
                    if(downtimeEl) downtimeEl.textContent = '...';
                }

                // [NOVO] Adiciona um delay de 800ms para permitir acompanhar visualmente
                await new Promise(resolve => setTimeout(resolve, 800));
                // [MODIFICADO] Aumentado para 1.5s (1500ms) para facilitar o acompanhamento visual
                await new Promise(resolve => setTimeout(resolve, 1500));

                try {
                    const pingResponse = await apiRequest(`/api/routers/${router.id}/ping`, 'POST', { period: selectedPeriod });

                    // Atualiza o objeto na cache global
                    Object.assign(router, pingResponse);

                    // Se a linha estiver visível (página atual), atualiza o DOM
                    if (row && pingResponse && pingResponse.status) {
                        // [CORREÇÃO] Se estiver em manutenção, força o visual de manutenção
                        if (pingResponse.is_maintenance) {
                            statusCell.innerHTML = `<span class="status-dot status-maintenance"></span> Manutenção`;
                        } else {
                            // Caso contrário, mostra o status real (online/offline)
                            statusCell.innerHTML = `<span class="status-dot status-${pingResponse.status}"></span> ${pingResponse.status}`;
                        }
                        
                        if (pingResponse.latency !== null && pingResponse.latency !== undefined) {
                            if(latencyEl) {
                                latencyEl.textContent = `${pingResponse.latency} ms`;
                                if (pingResponse.latency < 50) latencyEl.style.color = '#10b981';
                                else if (pingResponse.latency < 150) latencyEl.style.color = '#f59e0b';
                                else latencyEl.style.color = '#ef4444';
                            }
                        } else {
                            if(latencyEl) { latencyEl.textContent = '-'; latencyEl.style.color = ''; }
                        }

                        // [CORREÇÃO] Atualiza a célula "Visto em" na tabela principal com a data real do banco (last_seen_manual)
                        if (row && row.cells[4]) {
                            row.cells[4].textContent = pingResponse.last_seen ? new Date(pingResponse.last_seen).toLocaleString('pt-BR') : 'Nunca';
                        }

                        // [CORREÇÃO] Atualiza o detalhe com a mesma data consistente
                        if (lastSeenEl) {
                            lastSeenEl.textContent = pingResponse.last_seen ? new Date(pingResponse.last_seen).toLocaleString('pt-BR') : 'Nunca';
                        }

                        // [REFEITO] Lógica de Disponibilidade e Inatividade
                        if (pingResponse.status === 'online') {
                            // Se está ONLINE, mostra Disponibilidade e limpa Inatividade.
                            if (pingResponse.availability !== null && pingResponse.availability !== undefined) {
                                if(availEl) availEl.textContent = `${pingResponse.availability}%`;
                            } else {
                                if(availEl) availEl.textContent = '-';
                            }
                            if(downtimeEl) downtimeEl.textContent = '-';
                            
                            if (pingResponse.uptime_seconds !== null && pingResponse.uptime_seconds !== undefined && typeof formatUptime === 'function') {
                                if(uptimeEl) uptimeEl.textContent = formatUptime(pingResponse.uptime_seconds);
                            } else {
                                if(uptimeEl) uptimeEl.textContent = '-';
                            }
                        } else {
                            // Se está OFFLINE, mostra Inatividade e limpa Disponibilidade.
                            if(availEl) availEl.textContent = '-';
                            if(uptimeEl) uptimeEl.textContent = '-';
                            if (pingResponse.status_changed_at && typeof formatDowntime === 'function') {
                                if(downtimeEl) downtimeEl.textContent = formatDowntime(pingResponse.status_changed_at);
                            }
                        }

                    }

                } catch (error) {
                    if (row) {
                        if (statusCell) statusCell.innerHTML = `<span class="status-dot status-offline"></span> erro`;
                        if(latencyEl) latencyEl.textContent = '-';
                        if(uptimeEl) uptimeEl.textContent = '-';
                        if(availEl) availEl.textContent = '-';
                        if(downtimeEl) downtimeEl.textContent = '-';
                    }
                    router.status = 'offline'; // Atualiza cache
                }

                // [NOVO] Atualiza a barra de progresso
                processedCount++;
                progressBar.style.width = `${(processedCount / totalCount) * 100}%`;
            }
            
            // Reset do estado
            isCheckingStatus = false;
            checkStatusBtn.disabled = false;
            checkStatusBtn.textContent = 'Verificar Status';
            checkStatusBtn.classList.remove('btn-danger');

            // Remove a barra de progresso após um pequeno delay
            setTimeout(() => progressContainer.remove(), 1000);
            
            if (processedCount < totalCount) {
                showNotification('Verificação cancelada.', 'info');
            } else {
                showNotification('Verificação de status concluída.', 'success');
            }
        };

        // [NOVO] Função para exportar os dados da tabela para um ficheiro Excel
        const exportRoutersToExcel = () => {
            if (typeof XLSX === 'undefined') {
                showNotification("Erro: A biblioteca de exportação para Excel não foi carregada.", 'error');
                console.error("SheetJS (XLSX) library not found. Make sure it's included in the main HTML file.");
                return;
            }

            // [CORRIGIDO] Usa a lista completa de roteadores (allRouters) em vez de apenas os da página atual
            if (allRouters.length === 0) {
                showNotification('Não há dados de roteadores para exportar.', 'info');
                return;
            }

            const groupMap = new Map(allGroups.map(group => [group.id, group.name]));

            const dataToExport = allRouters.map(router => {
                // Pega os valores das células da linha correspondente na tabela para ter os dados de status em tempo real
                const row = routersTableBody.querySelector(`tr[data-router-id="${router.id}"]`);
                
                let latency = '-';
                let uptime = '-';
                let availability = '-';
                let status = router.status || 'offline';

                if (row) {
                    status = row.cells[2]?.textContent.trim() || status;
                    latency = row.cells[3]?.textContent.trim() || '-';
                    uptime = row.cells[4]?.textContent.trim() || '-';
                    availability = row.cells[5]?.textContent.trim() || '-';
                }

                return {
                    'ID': router.id,
                    'Nome': router.name,
                    'Status': status,
                    'Latência': latency,
                    'Uptime': uptime,
                    'Disponibilidade': availability,
                    'Grupo': router.group_id ? groupMap.get(router.group_id) || 'N/A' : 'Nenhum',
                    'Observação': router.observacao || 'N/A'
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Roteadores");
            XLSX.writeFile(workbook, `Relatorio_Roteadores_${new Date().toISOString().slice(0, 10)}.xlsx`);
        };

        // --- Lógica de Deteção Automática ---

        const handleDiscoverRouters = async () => {
            try {
                // [CORRIGIDO] A função apiRequest retorna um objeto { success, data }.
                // O array de roteadores está em response.data.
                const response = await apiRequest('/api/routers/discover');
                if (!response.success) throw new Error(response.message);

                // [CORRIGIDO] A resposta da API está aninhada. O array está em response.data.data.
                // [CORRIGIDO] Torna a verificação mais robusta, usando um array vazio como fallback se 'data' não existir.
                const newRouters = response.data || [];

                const discoveredRouterList = document.getElementById('discoveredRouterList');
                discoveredRouterList.innerHTML = '';
                if (newRouters.length === 0) {
                    showNotification('Nenhum roteador novo foi detetado na rede.', 'info');
                    return;
                }
                newRouters.forEach(name => {
                    const item = document.createElement('div');
                    item.className = 'checkbox-item';
                    item.innerHTML = `
                        <input type="checkbox" id="discover-${name}" name="routerNames" value="${name}" checked>
                        <label for="discover-${name}"><span class="checkbox-item-name">${name}</span></label>
                    `;
                    discoveredRouterList.appendChild(item);
                });
                discoverModal.classList.remove('hidden');
            } catch (error) {
                showNotification(`Erro ao verificar novos roteadores: ${error.message}`, 'error');
            }
        };

        const handleBatchAddSubmit = async (event) => {
            event.preventDefault();
            const selectedCheckboxes = discoverModal.querySelectorAll('input[name="routerNames"]:checked');
            const routerNames = Array.from(selectedCheckboxes).map(cb => cb.value);
            if (routerNames.length === 0) {
                showNotification('Por favor, selecione pelo menos um roteador para adicionar.', 'warning');
                return;
            }
            try {
                const result = await apiRequest('/api/routers/batch-add', 'POST', { routerNames });
                showNotification(result.message, 'success');
                discoverModal.classList.add('hidden');
                loadPageData();
            } catch (error) {
                showNotification(`Erro ao adicionar roteadores: ${error.message}`, 'error');
            }
        };

        // --- Lógica para Grupos de Roteadores ---

        const populatePrefixSelector = () => {
            const groupPrefixSelect = document.getElementById('groupPrefix');
            groupPrefixSelect.innerHTML = '<option value="">Selecionar para preencher...</option>';
            for (const prefix in groupPrefixes) {
                groupPrefixSelect.innerHTML += `<option value="${prefix}">${prefix} - ${groupPrefixes[prefix]}</option>`;
            }
        };

        const handlePrefixChangeAndFilter = () => {
            const groupPrefixSelect = document.getElementById('groupPrefix');
            const selectedPrefix = groupPrefixSelect.value;

            if (selectedPrefix && groupPrefixes[selectedPrefix]) {
                document.getElementById('groupName').value = `Grupo ${groupPrefixes[selectedPrefix]}`;
                document.getElementById('groupDescription').value = `Grupo de roteadores da ${groupPrefixes[selectedPrefix]}`;
            }

            // Filtra os roteadores com base no prefixo
            loadRoutersIntoGroupModal([], selectedPrefix);
        };
        
        const loadRoutersIntoGroupModal = (currentGroupRouters = [], prefix = '') => {
            const routerListDiv = document.getElementById('routerListForGroup');
            routerListDiv.innerHTML = '';

            let routersToDisplay = allRouters;

            if (prefix && prefix !== 'GNC') {
                routersToDisplay = allRouters.filter(r => r.name.startsWith(prefix));
            }

            // Roteadores disponíveis são os que não têm grupo (group_id == null)
            // OU os que já estão neste grupo (currentGroupRouters)
            const availableRouters = routersToDisplay.filter(r => r.group_id === null || currentGroupRouters.includes(r.id));

            if (availableRouters.length === 0) {
                routerListDiv.innerHTML = '<p>Nenhum roteador disponível para adicionar ao grupo (todos os roteadores já pertencem a outros grupos ou não correspondem ao filtro).</p>';
                return;
            }

            availableRouters.forEach(router => {
                const isChecked = currentGroupRouters.includes(router.id) ? 'checked' : '';
                const itemHTML = `
                    <label class="checkbox-item" for="group-router-${router.id}">
                        <input type="checkbox" id="group-router-${router.id}" name="routerIds" value="${router.id}" ${isChecked}>
                        <div class="checkbox-item-text">
                            <span class="checkbox-item-name">${router.name}</span>
                            <span class="checkbox-item-description">${router.observacao || 'Sem descrição.'}</span>
                        </div>
                    </label>`;
                routerListDiv.innerHTML += itemHTML;
            });
        };


        const handleGroupFormSubmit = async (event) => {
            event.preventDefault();
            window.showPagePreloader('A salvar grupo...');
            const groupId = document.getElementById('groupId').value;
            const selectedCheckboxes = groupModal.querySelectorAll('input[name="routerIds"]:checked');
            const routerIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.value));
            
            // [MODIFICADO] A validação de 2 roteadores foi removida para permitir grupos vazios ou com 1.
            
            const groupData = {
                name: document.getElementById('groupName').value,
                observacao: document.getElementById('groupDescription').value,
                routerIds // Envia a lista de IDs de roteadores para o backend
            };
            
            const method = groupId ? 'PUT' : 'POST';
            const endpoint = groupId ? `/api/routers/groups/${groupId}` : '/api/routers/groups';
            
            try {
                const result = await apiRequest(endpoint, method, groupData);
                showNotification(result.message, 'success');
                groupModal.classList.add('hidden');
                loadPageData(); // Recarrega tudo
            } catch (error) {
                showNotification(`Erro: ${error.message}`, 'error');
            } finally {
                window.hidePagePreloader();
            }
        };

        const openModalForCreateGroup = () => {
            groupForm.reset();
            document.getElementById('groupId').value = '';
            document.getElementById('groupModalTitle').textContent = 'Adicionar Novo Grupo';
            document.getElementById('groupPrefix').disabled = false;
            handlePrefixChangeAndFilter(); // Chama a nova função para preencher e filtrar
            groupModal.classList.remove('hidden');
        };

        window.openModalForEditGroup = (groupId) => {
            const group = allGroups.find(g => g.id === groupId);
            if (!group) return;
            groupForm.reset();
            document.getElementById('groupId').value = group.id;
            document.getElementById('groupModalTitle').textContent = 'Editar Grupo';
            document.getElementById('groupName').value = group.name;
            document.getElementById('groupDescription').value = group.observacao;
            document.getElementById('groupPrefix').value = '';
            document.getElementById('groupPrefix').disabled = true;
            // Carrega os roteadores que pertencem a este grupo
            const currentGroupRouters = allRouters.filter(r => r.group_id === groupId).map(r => r.id);
            loadRoutersIntoGroupModal(currentGroupRouters);
            groupModal.classList.remove('hidden');
        };

        window.handleDeleteGroup = async (groupId) => {
            const confirmed = await showConfirmationModal('Tem a certeza de que deseja eliminar este grupo? Os roteadores associados não serão eliminados, ficarão apenas "Sem Grupo".');
            if (confirmed) {
                try {
                    const result = await apiRequest(`/api/routers/groups/${groupId}`, 'DELETE');
                    showNotification(result.message, 'success');
                    loadPageData();
                } catch (error) {
                    showNotification(`Erro: ${error.message}`, 'error');
                }
            }
        };
        
        // [NOVO] Função para renderizar o gráfico de análise do grupo
        const renderGroupAnalyticsChart = (data) => {
            const canvas = document.getElementById('groupAnalyticsChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            // Destrói instância anterior se existir
            if (groupAnalyticsChartInstance) {
                groupAnalyticsChartInstance.destroy();
            }

            const labels = data.map(item => item.router_name);
            const values = data.map(item => item.user_count);

            groupAnalyticsChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Nº de Utilizadores',
                        data: values,
                        backgroundColor: 'rgba(66, 153, 225, 0.6)',
                        borderColor: 'rgba(66, 153, 225, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: 'var(--text-tertiary)',
                                stepSize: 1 // Garante que a escala seja em números inteiros
                            }
                        },
                        x: {
                            ticks: {
                                color: 'var(--text-tertiary)'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false // Oculta a legenda, pois só há um dataset
                        }
                    }
                }
            });
        };

        // [NOVO] Função para mostrar o modal com o gráfico de análise do grupo
        window.handleShowGroupAnalytics = async (groupId, groupName) => {
            const modalId = 'groupAnalyticsModal';
            // Remove modal antigo se existir
            document.getElementById(modalId)?.remove();

            const modalHtml = `
                <div id="${modalId}" class="modal-overlay">
                    <div class="modal-content large">
                        <button class="modal-close-btn">&times;</button>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-right: 30px; flex-wrap: wrap; gap: 10px;">
                            <h3 style="margin-bottom: 0; margin-right: auto;">Análise de Utilizadores - Grupo "${groupName}"</h3>
                            
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <!-- [NOVO] Seletor de Período -->
                                <select id="analyticsPeriodSelect" style="padding: 6px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--background-dark); color: var(--text-primary); font-size: 13px;">
                                    <option value="all">Todo o Período</option>
                                    <option value="30d">Últimos 30 Dias</option>
                                    <option value="7d">Últimos 7 Dias</option>
                                    <option value="24h">Últimas 24 Horas</option>
                                </select>

                                <button id="exportAnalyticsBtn" class="btn-secondary" style="padding: 6px 12px; font-size: 13px;" disabled title="Exportar Excel">
                                    <i class="fas fa-file-excel"></i> Excel
                                </button>
                                <button id="exportAnalyticsPdfBtn" class="btn-secondary" style="padding: 6px 12px; font-size: 13px;" disabled title="Exportar PDF">
                                    <i class="fas fa-file-pdf"></i> PDF
                                </button>
                            </div>
                        </div>
                        <div id="analyticsChartContainer" style="position: relative; height: 400px; width: 100%;">
                            <p id="chartLoadingText" style="text-align: center; padding-top: 100px;">A carregar dados do gráfico...</p>
                            <canvas id="groupAnalyticsChart"></canvas>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            const modalOverlay = document.getElementById(modalId);
            modalOverlay.querySelector('.modal-close-btn').onclick = () => modalOverlay.remove();
            setTimeout(() => modalOverlay.classList.remove('hidden'), 10);

            // Função interna para carregar dados com base no período
            const loadChartData = async (period) => {
                const chartContainer = modalOverlay.querySelector('#analyticsChartContainer');
                const loadingText = modalOverlay.querySelector('#chartLoadingText');
                
                // Mostra loading se não for a primeira carga
                if (groupAnalyticsChartInstance) {
                    loadingText.style.display = 'block';
                    loadingText.textContent = 'A atualizar dados...';
                }

                try {
                    const response = await apiRequest(`/api/routers/groups/${groupId}/user-distribution?period=${period}`);
                    if (!response.success || !response.data) throw new Error(response.message || 'Dados não recebidos.');
                    
                    loadingText.style.display = 'none';
                    renderGroupAnalyticsChart(response.data);
                    return response.data; // Retorna dados para exportação
                } catch (error) {
                    chartContainer.innerHTML = `<p style="color: var(--error-text); text-align: center; padding-top: 100px;">Erro ao carregar dados: ${error.message}</p>`;
                    return null;
                }
            };

            // Carregamento inicial
            let currentData = await loadChartData('all');

            // Listener para mudança de período
            const periodSelect = document.getElementById('analyticsPeriodSelect');
            if (periodSelect) {
                periodSelect.addEventListener('change', async (e) => {
                    currentData = await loadChartData(e.target.value);
                });
            }

                // Configura os botões de exportação
                const exportBtn = document.getElementById('exportAnalyticsBtn');
                const exportPdfBtn = document.getElementById('exportAnalyticsPdfBtn');
                if (exportBtn) {
                    exportBtn.disabled = false;
                    exportBtn.onclick = () => {
                        if (!currentData) return; // Garante que há dados
                        if (typeof XLSX === 'undefined') {
                            showNotification("Biblioteca XLSX não encontrada.", 'error');
                            return;
                        }
                        const data = currentData.map(item => ({
                            "Roteador": item.router_name,
                            "Total de Utilizadores": item.user_count
                        }));
                        
                        const ws = XLSX.utils.json_to_sheet(data);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Dados do Gráfico");
                        XLSX.writeFile(wb, `Analise_Grupo_${groupName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
                    };
                }

                if (exportPdfBtn) {
                    exportPdfBtn.disabled = false;
                    exportPdfBtn.onclick = () => {
                        if (!currentData) return;
                        if (!window.jspdf) {
                            showNotification("Biblioteca PDF não encontrada.", 'error');
                            return;
                        }
                        const { jsPDF } = window.jspdf;
                        const doc = new jsPDF();

                        // Título
                        doc.setFontSize(16);
                        doc.text(`Análise de Utilizadores - Grupo "${groupName}"`, 14, 20);
                        doc.setFontSize(10);
                        doc.text(`Data: ${new Date().toLocaleString()}`, 14, 28);

                        // Tabela
                        const tableData = currentData.map(item => [item.router_name, item.user_count]);
                        
                        doc.autoTable({
                            startY: 35,
                            head: [['Roteador', 'Total de Utilizadores']],
                            body: tableData,
                        });

                        doc.save(`Analise_Grupo_${groupName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
                    };
                }
        };

        // --- INICIALIZAÇÃO E LISTENERS ---
        loadPageData();
        populatePrefixSelector();

        checkStatusBtn.addEventListener('click', handleCheckAllStatus);

        // [NOVO] Adiciona o listener para o botão de exportar
        const exportBtn = document.getElementById('exportExcelBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportRoutersToExcel);
        }

        
        routerForm.addEventListener('submit', handleRouterFormSubmit);
        routerModal.querySelector('.modal-close-btn').addEventListener('click', () => routerModal.classList.add('hidden'));
        routerModal.querySelector('#cancelRouterBtn').addEventListener('click', () => routerModal.classList.add('hidden'));

        discoverRoutersBtn.addEventListener('click', handleDiscoverRouters);
        discoverForm.addEventListener('submit', handleBatchAddSubmit);
        discoverModal.querySelector('.modal-close-btn').addEventListener('click', () => discoverModal.classList.add('hidden'));
        discoverModal.querySelector('#cancelDiscoverBtn').addEventListener('click', () => discoverModal.classList.add('hidden'));
        
        addGroupBtn.addEventListener('click', openModalForCreateGroup);
        groupForm.addEventListener('submit', handleGroupFormSubmit);
        groupModal.querySelector('.modal-close-btn').addEventListener('click', () => groupModal.classList.add('hidden'));
        groupModal.querySelector('#cancelGroupBtn').addEventListener('click', () => groupModal.classList.add('hidden'));
        document.getElementById('groupPrefix').addEventListener('change', handlePrefixChangeAndFilter);

        // [NOVO] Inicia a atualização automática a cada 10 segundos
        // [REMOVIDO] A atualização automática foi desativada nesta página conforme solicitado,
        // para não interferir na verificação manual e na paginação.
        // [REMOVIDO] A atualização automática foi desativada nesta página (admin_dashboard) conforme solicitado.
        // Ela permanece ativa apenas na página dedicada de monitoramento (/pages/router_status.html).
        // if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        // autoRefreshInterval = setInterval(() => loadPageData(true), 10000);

        // Limpa o intervalo ao sair da página (se a SPA suportar navegação sem reload)
        window.addEventListener('beforeunload', () => {
            if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        });
    // Função global para forçar verificação de status de um roteador individual
    window.refreshSingleRouter = async function(routerId) {
        // Busca o roteador pelo ID
        const router = allRouters.find(r => r.id === routerId);
        if (!router) {
            showNotification('Roteador não encontrado.', 'error');
            return;
        }
        // Mostra preloader local
        const row = routersTableBody.querySelector(`tr[data-router-id="${routerId}"]`);
        let statusCell, latencyEl, uptimeEl, availEl, downtimeEl, lastSeenEl;
        if (row) {
            statusCell = row.cells[2];
            latencyEl = document.getElementById(`latency-${routerId}`);
            uptimeEl = document.getElementById(`uptime-${routerId}`);
            availEl = document.getElementById(`availability-${routerId}`);
            downtimeEl = document.getElementById(`downtime-${routerId}`);
            lastSeenEl = document.getElementById(`last-seen-${routerId}`);
            if (statusCell) statusCell.innerHTML = 'Verificando...';
            if(latencyEl) latencyEl.textContent = '...';
            if(uptimeEl) uptimeEl.textContent = '...';
            if(availEl) availEl.textContent = '...';
            if(downtimeEl) downtimeEl.textContent = '...';
        }
        try {
            const pingResponse = await apiRequest(`/api/routers/${routerId}/ping`, 'POST', { period: document.getElementById('availabilityPeriodSelect')?.value || '24h' });
            Object.assign(router, pingResponse);
            // Atualiza status visual
            if (row && pingResponse && pingResponse.status) {
                if (pingResponse.is_maintenance) {
                    statusCell.innerHTML = `<span class="status-dot status-maintenance"></span> Manutenção`;
                } else {
                    statusCell.innerHTML = `<span class="status-dot status-${pingResponse.status}"></span> ${pingResponse.status}`;
                }
                if (pingResponse.latency !== null && pingResponse.latency !== undefined) {
                    latencyEl.textContent = `${pingResponse.latency} ms`;
                    if (pingResponse.latency < 50) latencyEl.style.color = '#10b981';
                    else if (pingResponse.latency < 150) latencyEl.style.color = '#f59e0b';
                    else latencyEl.style.color = '#ef4444';
                } else {
                    latencyEl.textContent = '-'; latencyEl.style.color = '';
                }
                if (row && row.cells[4]) {
                    row.cells[4].textContent = pingResponse.last_seen ? new Date(pingResponse.last_seen).toLocaleString('pt-BR') : 'Nunca';
                }
                if (lastSeenEl) {
                    lastSeenEl.textContent = pingResponse.last_seen ? new Date(pingResponse.last_seen).toLocaleString('pt-BR') : 'Nunca';
                }
                if (pingResponse.status === 'online') {
                    if (pingResponse.availability !== null && pingResponse.availability !== undefined) {
                        availEl.textContent = `${pingResponse.availability}%`;
                    } else {
                        availEl.textContent = '-';
                    }
                    downtimeEl.textContent = '-';
                    if (pingResponse.uptime_seconds !== null && pingResponse.uptime_seconds !== undefined && typeof formatUptime === 'function') {
                        uptimeEl.textContent = formatUptime(pingResponse.uptime_seconds);
                    } else {
                        uptimeEl.textContent = '-';
                    }
                } else {
                    availEl.textContent = '-';
                    uptimeEl.textContent = '-';
                    if (pingResponse.status_changed_at && typeof formatDowntime === 'function') {
                        downtimeEl.textContent = formatDowntime(pingResponse.status_changed_at);
                    }
                }
            }
            showNotification('Status atualizado com sucesso.', 'success');
        } catch (error) {
            if (row) {
                if (statusCell) statusCell.innerHTML = `<span class="status-dot status-offline"></span> erro`;
                if(latencyEl) latencyEl.textContent = '-';
                if(uptimeEl) uptimeEl.textContent = '-';
                if(availEl) availEl.textContent = '-';
                if(downtimeEl) downtimeEl.textContent = '-';
            }
            router.status = 'offline';
            showNotification(`Erro ao atualizar status: ${error.message}`, 'error');
        }
    };
};
    // Fim da função global refreshSingleRouter
