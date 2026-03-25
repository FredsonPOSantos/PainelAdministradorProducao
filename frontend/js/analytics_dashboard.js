// Ficheiro: frontend/js/analytics_dashboard.js

if (window.initAnalyticsDashboard) {
    console.warn("Tentativa de carregar analytics_dashboard.js múltiplas vezes.");
} else {
    window.initAnalyticsDashboard = () => {

        // [NOVO] Reutiliza o Preloader (Autocarro) para mostrar carregamento
        const preloader = document.getElementById('page-preloader');
        if (preloader) {
            const loadingText = preloader.querySelector('.loading-text');
            if (loadingText) loadingText.textContent = 'A carregar dados analíticos...';
            preloader.classList.remove('loaded'); // Mostra o preloader
        }

        // [NOVO] Variável para guardar a instância do gráfico e evitar duplicados
        let loginsChartInstance = null;
        let hotspotActivityChartInstance = null; // Renomeado
        let hotspotRegistrationsChartInstance = null; // Novo gráfico para registos
        let ticketsChartInstance = null; // [NOVO]
        let lgpdChartInstance = null; // [NOVO]
        let adminActivityChartInstance = null; // [NOVO] Instância para o novo gráfico
        let rafflesChartInstance = null; // [NOVO]
        let campaignsChartInstance = null; // [NOVO]
        let serverHealthChartInstance = null; // [NOVO]
        let routerGroupPieChartInstance = null; // [NOVO]
        let routerDistributionBarChartInstance = null; // [NOVO]

        // [NOVO] Cache para os dados da página
        let analyticsPageData = {};

        // [NOVO] Mapeia a métrica do card para a sua permissão de detalhe correspondente
        const metricToPermissionMap = {
            'logins': 'analytics.details.logins',
            'hotspotUsers': 'analytics.details.hotspot_users',
            'routers': 'analytics.details.routers',
            'tickets': 'analytics.details.tickets',
            'lgpd': 'analytics.details.lgpd',
            'adminActivity': 'analytics.details.admin_activity',
            'raffles': 'analytics.details.raffles',
            'campaigns': 'analytics.details.campaigns',
            'serverHealth': 'analytics.details.server_health'
        };

        const exportFullPdfBtn = document.getElementById('exportFullPdfBtn');

        const fillCard = (id, value) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value ?? '0';
            }
        };

        // Função para renderizar as tabelas de forma segura e eficiente
        const renderTable = (tbodyId, data, columns, emptyMessage) => {
            const tbody = document.getElementById(tbodyId);
            if (!tbody) return;

            tbody.innerHTML = ''; // Limpa o corpo da tabela
            if (data.length > 0) {
                data.forEach(rowData => {
                    const tr = document.createElement('tr');
                    for (const column of columns) { // [CORRIGIDO] Usa um laço 'for...of' em vez de 'forEach'
                        const td = document.createElement('td');
                        let cellValue = rowData[column.key] ?? 'N/A';

                        // [NOVO] Formatação de data para a tabela
                        if (column.type === 'datetime' && cellValue !== 'N/A') {
                            cellValue = new Date(cellValue).toLocaleString('pt-BR', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                            });
                        }
                        // [NOVO] Adiciona classe de status para colorir
                        if (column.key === 'status') {
                            const statusClass = cellValue === 'online' ? 'status-success' : 'status-failure';
                            const statusSpan = document.createElement('span');
                            statusSpan.className = statusClass;
                            statusSpan.textContent = cellValue;
                            td.innerHTML = ''; // Limpa o textContent
                            td.appendChild(statusSpan);
                            tr.appendChild(td); // Adiciona a célula atual antes de continuar
                            continue; // [CORRIGIDO] 'continue' agora é válido dentro do laço 'for...of'
                        }
                        // [NOVO] Formatação para booleano
                        if (column.type === 'boolean' && cellValue !== 'N/A') {
                            cellValue = cellValue ? 'Sim' : 'Não';
                        }

                        td.textContent = cellValue;
                        tr.appendChild(td);
                    }
                    tbody.appendChild(tr);
                });
            } else {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = columns.length;
                td.style.textAlign = 'center';
                td.textContent = emptyMessage;
                tr.appendChild(td);
                tbody.appendChild(tr);
            }
        };

        // Função para mostrar a secção de detalhe correta
        const showDetailSection = (metric) => {
            // [NOVO] Verificação de permissão antes de mostrar os detalhes
            const requiredPermission = metricToPermissionMap[metric];
            if (requiredPermission && !window.currentUserProfile?.permissions[requiredPermission]) {
                document.querySelectorAll('.analytics-detail-section').forEach(section => {
                    section.classList.add('hidden');
                });
                const activeSection = document.getElementById(`details-${metric}`);
                if (activeSection) {
                    activeSection.classList.remove('hidden');
                    activeSection.innerHTML = `<div class="section-header"><h4>Acesso Negado</h4></div><p style="text-align:center; padding: 20px;">Você não tem permissão para ver estes detalhes.</p>`;
                }
                return;
            }

            document.querySelectorAll('.analytics-detail-section').forEach(section => {
                section.classList.add('hidden');
            });
            const activeSection = document.getElementById(`details-${metric}`);
            if (activeSection) {
                activeSection.classList.remove('hidden');
                // Aqui você chamaria a função para carregar os dados detalhados
                if (metric === 'logins') {
                    // Carrega dados e ativa o botão de 30 dias por padrão
                    loadLoginDetails(30);
                }
                if (metric === 'hotspotUsers') {
                    // Por padrão, carrega a primeira sub-aba (Atividade)
                    loadHotspotActivityDetails(30);
                    loadHotspotRegistrationDetails(30, false); // Pré-carrega a outra aba em segundo plano

                    // Adiciona listeners para as sub-abas
                    const subTabContainer = document.querySelector('#details-hotspotUsers .sub-tab-nav');
                    if (subTabContainer) {
                        subTabContainer.addEventListener('click', (e) => {
                            if (e.target.matches('.sub-tab-btn')) {
                                const subTabName = e.target.dataset.subtab;
                                document.querySelectorAll('#details-hotspotUsers .sub-tab-btn').forEach(btn => btn.classList.remove('active'));
                                document.querySelectorAll('#details-hotspotUsers .sub-tab-content').forEach(content => content.classList.remove('active'));
                                e.target.classList.add('active');
                                document.getElementById(`hotspot-details-${subTabName}`).classList.add('active');
                            }
                        });
                    }
                }
                if (metric === 'routers') {
                    initRoutersSection();
                }
                if (metric === 'tickets') {
                    loadTicketDetails(30);
                }
                if (metric === 'lgpd') {
                    loadLgpdDetails(30);
                }
                if (metric === 'adminActivity') {
                    loadAdminActivityDetails(30);
                }
                if (metric === 'raffles') { // [NOVO]
                    loadRafflesDetails(30);
                }
                if (metric === 'campaigns') { // [NOVO]
                    loadCampaignsDetails();
                }
                if (metric === 'serverHealth') { // [NOVO]
                    loadServerHealthDetails();
                }
            }
        };

        const loadAnalyticsData = async () => {
            try {
                // [NOVO] Define indicadores de carregamento nos cards e tabelas
                const loadingText = '...';
                const cardsToLoad = [
                    'loginsSuccess', 'loginsFailure', 'hotspotUsersTotal', 'hotspotUsersMarketing',
                    'routersOnline', 'routersOffline', 'ticketsOpen', 'ticketsTotal',
                    'lgpdPending', 'lgpdCompleted', 'adminActions24h', 'adminMostActive',
                    'rafflesActive', 'rafflesParticipants30d', 'campaignsActive', 'campaignsTotalViews',
                    'serverUptime'
                ];
                cardsToLoad.forEach(id => fillCard(id, loadingText));

                const radiusStatusEl = document.getElementById('radiusStatus');
                if (radiusStatusEl) {
                    radiusStatusEl.textContent = loadingText;
                    radiusStatusEl.className = '';
                }

                const routerActivityBody = document.getElementById('routerActivityBody');
                if (routerActivityBody) {
                    routerActivityBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">A carregar dados...</td></tr>';
                }

                const response = await apiRequest('/api/dashboard/analytics');

                if (!response || !response.success) {
                    throw new Error(response.message || 'Falha ao carregar dados analíticos.');
                }
                
                // [CORRIGIDO] A API retorna { success: true, data: { ... } }. O objeto de dados está em response.data.
                const data = response.data;
                analyticsPageData = data; // [NOVO] Armazena todos os dados

                // Preenche os cards principais
                fillCard('loginsSuccess', data.logins.success);
                fillCard('loginsFailure', data.logins.failure);
                fillCard('hotspotUsersTotal', data.hotspotUsers.total);
                fillCard('hotspotUsersMarketing', data.hotspotUsers.marketing);
                fillCard('routersOnline', data.routers.online);
                fillCard('routersOffline', data.routers.offline);
                fillCard('ticketsOpen', data.tickets.open);
                fillCard('ticketsTotal', data.tickets.total);
                fillCard('lgpdPending', data.lgpd.pending);
                fillCard('lgpdCompleted', data.lgpd.completed);
                // [NOVO] Preenche o card de atividade do admin
                fillCard('adminActions24h', data.adminActivity.actionsLast24h);
                fillCard('adminMostActive', data.adminActivity.mostActiveAdmin);
                // [NOVO] Preenche o card de sorteios
                fillCard('rafflesActive', data.raffles.active);
                fillCard('rafflesParticipants30d', data.raffles.participantsLast30d);
                // [NOVO] Preenche o card de campanhas
                fillCard('campaignsActive', data.campaigns.active);
                fillCard('campaignsTotalViews', data.campaigns.totalViews);
                // [NOVO] Preenche o card de saúde do servidor
                const uptimeMs = data.serverHealth.uptime;
                const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
                const hours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
                fillCard('serverUptime', `${days}d ${hours}h ${minutes}m`);

                if (radiusStatusEl) {
                    const status = data.serverHealth.radiusStatus;
                    radiusStatusEl.textContent = status;
                    radiusStatusEl.className = status === 'online' ? 'status-success' : 'status-failure';
                }



                

                // Preenche a tabela de atividade por roteador (usando a nova função)
                renderTable('routerActivityBody', data.routerActivity || [], [
                    { key: 'fullname' },
                    { key: 'email' },
                    { key: 'last_login', type: 'datetime' }
                ], 'Nenhuma atividade encontrada.');

                // [NOVO] Desativa os cards se o utilizador não tiver permissão para ver os detalhes
                document.querySelectorAll('.stat-card.clickable').forEach(card => {
                    const metric = card.dataset.metric;
                    const requiredPermission = metricToPermissionMap[metric];
                    if (requiredPermission && !window.currentUserProfile?.permissions[requiredPermission]) {
                        card.classList.add('disabled');
                        card.title = 'Você não tem permissão para ver os detalhes.';
                    } else {
                        card.classList.remove('disabled');
                        card.title = '';
                    }
                });
            } catch (error) {
                console.error('[loadAnalyticsData] ERRO FINAL:', error);
                showNotification(`Erro ao carregar dados: ${error.message}`, 'error');
            } finally {
                // [NOVO] Esconde o Preloader após o carregamento (sucesso ou erro)
                if (preloader) {
                    setTimeout(() => {
                        preloader.classList.add('loaded');
                        // Restaura o texto original após a transição
                        setTimeout(() => {
                            const loadingText = preloader.querySelector('.loading-text');
                            if (loadingText) loadingText.textContent = 'A carregar o sistema...';
                        }, 800);
                    }, 500); // Pequeno delay para garantir que o utilizador veja o autocarro
                }
            }
        };

        // Função para carregar detalhes de login (exemplo)
        const loadLoginDetails = async (periodInDays) => {
            const tbody = document.getElementById('loginsDetailBody');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">A carregar detalhes...</td></tr>';
            
            // [NOVO] Atualiza a classe 'active' nos botões de filtro
            const filterContainer = document.querySelector('#details-logins .filter-buttons');
            if (filterContainer) {
                filterContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                filterContainer.querySelector(`button[data-period="${periodInDays}"]`)?.classList.add('active');
            }

            try {
                // Você precisará criar este endpoint no seu backend
                const response = await apiRequest(`/api/dashboard/analytics/logins?period=${periodInDays}`);
                if (!response.success && response.status === 404) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--warning-text);">Funcionalidade em desenvolvimento.</td></tr>';
                    console.warn(`Endpoint /api/dashboard/analytics/logins não encontrado (404).`);
                    return; // Interrompe a execução para não tentar renderizar dados inexistentes
                }
                const data = response.data;

                // Renderiza a tabela de detalhes
                renderTable('loginsDetailBody', data.latest_logins, [
                    { key: 'user_email' },
                    { key: 'timestamp', type: 'datetime' }, // [NOVO] Adiciona tipo para formatação
                    { key: 'status' }, // Pode adicionar um tipo 'status' para colorir no futuro
                    { key: 'ip_address' }
                ], 'Nenhum login encontrado no período.');

                // Renderiza o gráfico (preparado para o futuro)
                renderLoginsChart(data.logins_by_day);

            } catch (error) {
                showNotification(`Erro ao carregar detalhes de login: ${error.message}`, 'error');
            }
        };

        // Função para renderizar o gráfico de logins (exemplo com Chart.js)
        const renderLoginsChart = (chartData) => {
            const canvas = document.getElementById('loginsChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            // [NOVO] Destrói o gráfico anterior antes de desenhar um novo
            if (loginsChartInstance) {
                loginsChartInstance.destroy();
            }


            // O backend deve retornar um objeto com 'labels' (dias) e 'data' (contagens)
            // Ex: { labels: ['01/01', '02/01'], data: [10, 15] }
            const labels = chartData?.labels || [];
            const data = chartData?.data || [];

            loginsChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Acessos por Dia',
                        data: data,
                        borderColor: 'var(--primary-color)',
                        backgroundColor: 'rgba(10, 132, 255, 0.2)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: 'var(--text-secondary)'
                            }
                        },
                        x: {
                            ticks: {
                                color: 'var(--text-secondary)'
                            }
                        }
                    }
                }
            });
        };

        // [RENOMEADO] Função para carregar detalhes de ATIVIDADE de utilizadores
        const loadHotspotActivityDetails = async (periodInDays) => {
            // [CORRIGIDO] Aponta para o tbody correto da aba de Atividade.
            const tbody = document.getElementById('hotspotUsersActivityBody');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">A carregar detalhes...</td></tr>';

            // [CORRIGIDO] Aponta para o container de filtros compartilhado
            const filterContainer = document.querySelector('#details-hotspotUsers .filter-buttons');
            if (filterContainer) {
                filterContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                filterContainer.querySelector(`button[data-period="${periodInDays}"]`)?.classList.add('active');
            }

            try {
                const response = await apiRequest(`/api/dashboard/analytics/hotspot-users?period=${periodInDays}`);
                if (!response.success) {
                    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--warning-text);">${response.message || 'Funcionalidade em desenvolvimento.'}</td></tr>`;
                    console.warn(`Endpoint /api/dashboard/analytics/hotspot-users não encontrado ou com erro.`);
                    return;
                }
                const data = response.data;

                renderTable('hotspotUsersActivityBody', data.latest_users, [
                    { key: 'fullname' },
                    { key: 'email' },
                    { key: 'created_at', type: 'datetime' },
                    { key: 'accepts_marketing', type: 'boolean' }
                ], 'Nenhuma atividade de utilizador encontrada no período.');

                renderHotspotActivityChart(data.users_by_day); // Corrigido

            } catch (error) {
                showNotification(`Erro ao carregar detalhes de utilizadores: ${error.message}`, 'error');
            }
        };

        // [RENOMEADO] Função para renderizar o gráfico de ATIVIDADE de utilizadores
        const renderHotspotActivityChart = (chartData) => {
            const canvas = document.getElementById('hotspotUsersActivityChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            if (hotspotActivityChartInstance) {
                hotspotActivityChartInstance.destroy();
            }

            const labels = chartData?.labels || [];
            const data = chartData?.data || [];

            hotspotActivityChartInstance = new Chart(ctx, {
                type: 'bar', // Gráfico de barras para variar
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Usuários Ativos por Dia',
                        data: data,
                        backgroundColor: 'rgba(175, 82, 222, 0.5)', // Cor roxa do card
                        borderColor: 'rgba(175, 82, 222, 1)',
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
                                stepSize: 1 // Força a contagem em inteiros
                            }
                        }
                    }
                }
            });
        };

        // [NOVO] Função para carregar detalhes de REGISTOS de utilizadores
        const loadHotspotRegistrationDetails = async (periodInDays, marketingOnly) => {
            const tbody = document.getElementById('hotspotRegistrationsBody');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">A carregar detalhes...</td></tr>';

            // [CORRIGIDO] Aponta para o container de filtros compartilhado
            const filterContainer = document.querySelector('#details-hotspotUsers .filter-buttons');
            if (filterContainer) {
                filterContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                filterContainer.querySelector(`button[data-period="${periodInDays}"]`)?.classList.add('active');
            }

            try {
                const response = await apiRequest(`/api/dashboard/analytics/hotspot-registrations?period=${periodInDays}&marketing=${marketingOnly}`);
                if (!response.success) {
                    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--warning-text);">${response.message || 'Funcionalidade em desenvolvimento.'}</td></tr>`;
                    return;
                }
                const data = response.data;

                renderTable('hotspotRegistrationsBody', data.latest_users, [
                    { key: 'fullname' },
                    { key: 'email' },
                    { key: 'created_at', type: 'datetime' },
                    { key: 'accepts_marketing', type: 'boolean' }
                ], 'Nenhum novo registro encontrado no período.');

                renderHotspotRegistrationsChart(data.registrations_by_day);

            } catch (error) {
                showNotification(`Erro ao carregar detalhes de registos: ${error.message}`, 'error');
            }
        };

        // [NOVO] Função para renderizar o gráfico de REGISTOS
        const renderHotspotRegistrationsChart = (chartData) => {
            const canvas = document.getElementById('hotspotRegistrationsChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            if (hotspotRegistrationsChartInstance) {
                hotspotRegistrationsChartInstance.destroy();
            }

            const labels = chartData?.labels || [];
            const data = chartData?.data || [];

            hotspotRegistrationsChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Novos Registos por Dia',
                        data: data,
                        backgroundColor: 'rgba(88, 86, 214, 0.2)',
                        borderColor: 'rgba(88, 86, 214, 1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    }
                }
            });
        };

        // [NOVO] Listener para o checkbox de marketing
        const marketingCheckbox = document.getElementById('marketingFilterCheckbox');
        if (marketingCheckbox) {
            marketingCheckbox.addEventListener('change', (e) => {
                const period = document.querySelector('#details-hotspotUsers .filter-buttons button.active')?.dataset.period || 30;
                loadHotspotRegistrationDetails(period, marketingCheckbox.checked);
            });
        }

        // [NOVO] Função para renderizar o gráfico de pizza de distribuição de utilizadores
        const renderRouterGroupPieChart = (chartData) => {
            const canvas = document.getElementById('routerGroupPieChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            if (routerGroupPieChartInstance) {
                routerGroupPieChartInstance.destroy();
            }

            const labels = chartData?.labels || [];
            const data = chartData?.data || [];

            routerGroupPieChartInstance = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Usuários',
                        data: data,
                        backgroundColor: [
                            '#4299e1', '#38a169', '#dd6b20', '#c53030',
                            '#805ad5', '#319795', '#718096', '#d69e2e'
                        ],
                        borderColor: 'var(--background-medium)',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { 
                                color: '#ffffff', // [CORRIGIDO] Cor branca para melhor visibilidade no fundo escuro
                                padding: 20
                            }
                        }
                    }
                }
            });
        };

        // [NOVO] Função para renderizar o gráfico de barras de distribuição por roteador
        const renderRouterDistributionBarChart = (chartData) => {
            const canvas = document.getElementById('routerDistributionBarChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            if (routerDistributionBarChartInstance) {
                routerDistributionBarChartInstance.destroy();
            }

            const labels = chartData?.labels || [];
            const data = chartData?.data || [];

            routerDistributionBarChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Usuários',
                        data: data,
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        };

        // [NOVO] Função para carregar a tabela de atividade por roteador (com filtro)
        const loadRouterActivityDetails = async (routerName) => {
            const tbody = document.getElementById('routerActivityBody');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">A carregar usuários...</td></tr>';

            try {
                // [CORRIGIDO] Usa a rota correta que já existe
                const response = await apiRequest(`/api/dashboard/router-users?routerName=${routerName}`);
                if (!response.success) throw new Error(response.message);

                renderTable('routerActivityBody', response.data, [
                    { key: 'fullname' },
                    { key: 'email' },
                    { key: 'last_login', type: 'datetime' }
                ], 'Nenhum usuário encontrado para este roteador.');

            } catch (error) {
                showNotification(`Erro ao carregar usuários do roteador: ${error.message}`, 'error');
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--warning-text);">Falha ao carregar dados.</td></tr>';
            }
        };

        // [NOVO] Função principal para inicializar toda a seção de Roteadores
        const initRoutersSection = async () => {
            // [REMOVIDO] A tabela de status foi removida pois era duplicada.

            // [NOVO] Renderiza o gráfico de pizza com os dados já carregados
            if (analyticsPageData.userDistributionByGroup) {
                renderRouterGroupPieChart(analyticsPageData.userDistributionByGroup);

                // [NOVO] Adiciona botões de exportação para o gráfico de pizza
                const pieChartContainer = document.getElementById('routerGroupPieChart').parentElement;
                if (pieChartContainer && !pieChartContainer.querySelector('.export-buttons')) {
                    const exportButtons = document.createElement('div');
                    exportButtons.className = 'export-buttons';
                    exportButtons.style.cssText = 'position: absolute; top: 0; right: 0; display: flex; gap: 5px;';
                    exportButtons.innerHTML = `
                        <button class="btn-secondary btn-sm" id="exportPieExcel"><i class="fas fa-file-excel"></i></button>
                        <button class="btn-secondary btn-sm" id="exportPiePdf"><i class="fas fa-file-pdf"></i></button>
                    `;
                    pieChartContainer.style.position = 'relative'; // Necessário para o posicionamento absoluto
                    pieChartContainer.prepend(exportButtons);

                    document.getElementById('exportPieExcel').onclick = () => {
                        const data = analyticsPageData.userDistributionByGroup.labels.map((label, index) => ({
                            "Grupo": label,
                            "Utilizadores": analyticsPageData.userDistributionByGroup.data[index]
                        }));
                        const ws = XLSX.utils.json_to_sheet(data);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Distribuicao por Grupo");
                        XLSX.writeFile(wb, `Distribuicao_Utilizadores_por_Grupo.xlsx`);
                    };

                    document.getElementById('exportPiePdf').onclick = () => {
                        const { jsPDF } = window.jspdf;
                        const doc = new jsPDF();
                        doc.text("Distribuição de Utilizadores por Grupo", 14, 20);
                        const tableData = analyticsPageData.userDistributionByGroup.labels.map((label, index) => [
                            label,
                            analyticsPageData.userDistributionByGroup.data[index]
                        ]);
                        doc.autoTable({
                            startY: 25,
                            head: [['Grupo', 'Nº de Utilizadores']],
                            body: tableData,
                        });
                        doc.save('Distribuicao_Utilizadores_por_Grupo.pdf');
                    };
                }
            }
            // [NOVO] Renderiza o gráfico de barras com os dados já carregados
            if (analyticsPageData.userDistributionByRouter) {
                renderRouterDistributionBarChart(analyticsPageData.userDistributionByRouter);

                // [NOVO] Adiciona botões de exportação para o gráfico de barras
                const barChartContainer = document.getElementById('routerDistributionBarChart').parentElement;
                if (barChartContainer && !barChartContainer.querySelector('.export-buttons')) {
                    const exportButtons = document.createElement('div');
                    exportButtons.className = 'export-buttons';
                    exportButtons.style.cssText = 'position: absolute; top: 0; right: 0; display: flex; gap: 5px;';
                    exportButtons.innerHTML = `
                        <button class="btn-secondary btn-sm" id="exportBarExcel" title="Exportar Excel"><i class="fas fa-file-excel"></i></button>
                        <button class="btn-secondary btn-sm" id="exportBarPdf" title="Exportar PDF"><i class="fas fa-file-pdf"></i></button>
                    `;
                    barChartContainer.style.position = 'relative';
                    barChartContainer.prepend(exportButtons);

                    // [CORREÇÃO] Implementação da lógica de exportação para Excel
                    document.getElementById('exportBarExcel').onclick = () => {
                        if (!analyticsPageData.userDistributionByRouter) return;
                        const data = analyticsPageData.userDistributionByRouter.labels.map((label, index) => ({
                            "Roteador": label,
                            "Utilizadores": analyticsPageData.userDistributionByRouter.data[index]
                        }));
                        const ws = XLSX.utils.json_to_sheet(data);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Top Roteadores");
                        XLSX.writeFile(wb, `Top_Roteadores_por_Usuarios.xlsx`);
                    };

                    // [CORREÇÃO] Implementação da lógica de exportação para PDF
                    document.getElementById('exportBarPdf').onclick = () => {
                        if (!analyticsPageData.userDistributionByRouter) return;
                        const { jsPDF } = window.jspdf;
                        const doc = new jsPDF();
                        doc.text("Top Roteadores por Usuários", 14, 20);
                        const tableData = analyticsPageData.userDistributionByRouter.labels.map((label, index) => [
                            label,
                            analyticsPageData.userDistributionByRouter.data[index]
                        ]);
                        doc.autoTable({
                            startY: 25,
                            head: [['Roteador', 'Nº de Utilizadores']],
                            body: tableData,
                        });
                        doc.save('Top_Roteadores_por_Usuarios.pdf');
                    };
                }
            }
            loadRouterActivityDetails('all'); // Carrega inicialmente para todos

            // Popula o dropdown de filtro
            const select = document.getElementById('routerFilterSelect');
            if (select) {
                try {
                    const response = await apiRequest('/api/routers'); // Reutiliza a rota existente
                    
                    // [CORRIGIDO] A API /api/routers retorna um array diretamente.
                    // O código anterior esperava { success: true, data: [...] } e falhava.
                    const routers = Array.isArray(response) ? response : (response.data || []);

                    routers.forEach(router => {
                        const option = new Option(router.name, router.name);
                        select.add(option);
                    });
                    
                    select.onchange = (e) => loadRouterActivityDetails(e.target.value);
                } catch (error) {
                    console.error("Falha ao popular filtro de roteadores:", error);
                }
            }
        };

        // [NOVO] Função para carregar detalhes de Tickets de Suporte
        const loadTicketDetails = async (periodInDays) => {
            const tbody = document.getElementById('ticketsDetailBody');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">A carregar tickets...</td></tr>';

            const filterContainer = document.querySelector('#details-tickets .filter-buttons');
            if (filterContainer) {
                filterContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                filterContainer.querySelector(`button[data-period="${periodInDays}"]`)?.classList.add('active');
            }

            try {
                const response = await apiRequest(`/api/dashboard/analytics/tickets?period=${periodInDays}`);
                if (!response.success) throw new Error(response.message);

                const data = response.data;

                renderTable('ticketsDetailBody', data.latest_tickets, [
                    { key: 'id' },
                    { key: 'title' },
                    { key: 'status' },
                    { key: 'created_at', type: 'datetime' }
                ], 'Nenhum ticket encontrado no período.');

                renderTicketsChart(data.tickets_by_day);

            } catch (error) {
                showNotification(`Erro ao carregar detalhes dos tickets: ${error.message}`, 'error');
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--warning-text);">Falha ao carregar dados.</td></tr>';
            }
        };

        // [NOVO] Função para renderizar o gráfico de Tickets
        const renderTicketsChart = (chartData) => {
            const canvas = document.getElementById('ticketsChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            if (ticketsChartInstance) {
                ticketsChartInstance.destroy();
            }

            ticketsChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartData.labels,
                    datasets: [
                        {
                            label: 'Tickets Abertos',
                            data: chartData.opened,
                            borderColor: 'var(--warning-color)',
                            backgroundColor: 'rgba(255, 159, 10, 0.2)',
                            tension: 0.3,
                            fill: true,
                        },
                        {
                            label: 'Tickets Fechados',
                            data: chartData.closed,
                            borderColor: 'var(--success-color)',
                            backgroundColor: 'rgba(48, 209, 88, 0.2)',
                            tension: 0.3,
                            fill: true,
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1,
                                color: 'var(--text-secondary)'
                            }
                        },
                        x: {
                            ticks: {
                                color: 'var(--text-secondary)'
                            }
                        }
                    }
                }
            });
        };

        // [NOVO] Função para carregar detalhes de Pedidos LGPD
        const loadLgpdDetails = async (periodInDays) => {
            const tbody = document.getElementById('lgpdDetailBody');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">A carregar pedidos...</td></tr>';

            const filterContainer = document.querySelector('#details-lgpd .filter-buttons');
            if (filterContainer) {
                filterContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                filterContainer.querySelector(`button[data-period="${periodInDays}"]`)?.classList.add('active');
            }

            try {
                const response = await apiRequest(`/api/dashboard/analytics/lgpd-requests?period=${periodInDays}`);
                if (!response.success) throw new Error(response.message);

                const data = response.data;

                renderTable('lgpdDetailBody', data.latest_requests, [
                    { key: 'user_email' },
                    { key: 'request_date', type: 'datetime' },
                    { key: 'status' },
                    { key: 'completion_date', type: 'datetime' }
                ], 'Nenhum pedido LGPD encontrado no período.');

                renderLgpdChart(data.requests_by_day);

            } catch (error) {
                showNotification(`Erro ao carregar detalhes de pedidos LGPD: ${error.message}`, 'error');
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--warning-text);">Falha ao carregar dados.</td></tr>';
            }
        };

        // [NOVO] Função para renderizar o gráfico de Pedidos LGPD
        const renderLgpdChart = (chartData) => {
            const canvas = document.getElementById('lgpdChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            if (lgpdChartInstance) {
                lgpdChartInstance.destroy();
            }

            lgpdChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Pedidos por Dia',
                        data: chartData.data,
                        backgroundColor: 'rgba(255, 69, 58, 0.5)', // Cor vermelha do card
                        borderColor: 'rgba(255, 69, 58, 1)',
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
                                stepSize: 1,
                                color: 'var(--text-secondary)'
                            }
                        },
                        x: {
                            ticks: {
                                color: 'var(--text-secondary)'
                            }
                        }
                    }
                }
            });
        };

        // [NOVO] Função para carregar detalhes de Atividade dos Administradores
        const loadAdminActivityDetails = async (periodInDays) => {
            const tbody = document.getElementById('adminActivityDetailBody');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">A carregar atividades...</td></tr>';

            const filterContainer = document.querySelector('#details-adminActivity .filter-buttons');
            if (filterContainer) {
                filterContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                filterContainer.querySelector(`button[data-period="${periodInDays}"]`)?.classList.add('active');
            }

            try {
                const response = await apiRequest(`/api/dashboard/analytics/admin-activity?period=${periodInDays}`);
                if (!response.success) throw new Error(response.message);

                const data = response.data;

                renderTable('adminActivityDetailBody', data.latest_actions, [
                    { key: 'user_email' },
                    { key: 'action' },
                    { key: 'status' },
                    { key: 'timestamp', type: 'datetime' }
                ], 'Nenhuma atividade de administrador encontrada no período.');

                renderAdminActivityChart(data.actions_by_day);

            } catch (error) {
                showNotification(`Erro ao carregar atividade dos administradores: ${error.message}`, 'error');
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--warning-text);">Falha ao carregar dados.</td></tr>';
            }
        };

        // [NOVO] Função para renderizar o gráfico de Atividade dos Administradores
        const renderAdminActivityChart = (chartData) => {
            const canvas = document.getElementById('adminActivityChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            if (adminActivityChartInstance) {
                adminActivityChartInstance.destroy();
            }

            adminActivityChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Ações por Dia',
                        data: chartData.data,
                        backgroundColor: 'rgba(50, 215, 75, 0.5)', // Cor verde do card
                        borderColor: 'rgba(50, 215, 75, 1)',
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
                                stepSize: 1,
                                color: 'var(--text-secondary)'
                            }
                        },
                        x: {
                            ticks: {
                                color: 'var(--text-secondary)'
                            }
                        }
                    }
                }
            });
        };

        // [NOVO] Função para carregar detalhes de Performance de Sorteios
        const loadRafflesDetails = async (periodInDays) => {
            const winnersTbody = document.getElementById('latestWinnersBody');
            const popularTbody = document.getElementById('popularRafflesBody');
            if (!winnersTbody || !popularTbody) return;

            winnersTbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">A carregar...</td></tr>';
            popularTbody.innerHTML = '<tr><td colspan="2" style="text-align: center;">A carregar...</td></tr>';

            const filterContainer = document.querySelector('#details-raffles .filter-buttons');
            if (filterContainer) {
                filterContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                filterContainer.querySelector(`button[data-period="${periodInDays}"]`)?.classList.add('active');
            }

            try {
                const response = await apiRequest(`/api/dashboard/analytics/raffles?period=${periodInDays}`);
                if (!response.success) throw new Error(response.message);

                const data = response.data;

                // Renderiza as duas tabelas
                renderTable('latestWinnersBody', data.latest_winners, [
                    { key: 'title' },
                    { key: 'winner_email' },
                    { key: 'draw_date', type: 'datetime' }
                ], 'Nenhum vencedor encontrado.');

                renderTable('popularRafflesBody', data.popular_raffles, [
                    { key: 'title' },
                    { key: 'participant_count' }
                ], 'Nenhum sorteio popular encontrado.');

                renderRafflesChart(data.participants_by_day);

            } catch (error) {
                showNotification(`Erro ao carregar detalhes dos sorteios: ${error.message}`, 'error');
                winnersTbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--warning-text);">Falha ao carregar.</td></tr>';
                popularTbody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: var(--warning-text);">Falha ao carregar.</td></tr>';
            }
        };

        // [NOVO] Função para renderizar o gráfico de Sorteios
        const renderRafflesChart = (chartData) => {
            const canvas = document.getElementById('rafflesChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            if (rafflesChartInstance) {
                rafflesChartInstance.destroy();
            }

            rafflesChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Novos Participantes por Dia',
                        data: chartData.data,
                        backgroundColor: 'rgba(255, 204, 0, 0.4)', // Cor amarela do card
                        borderColor: 'rgba(255, 204, 0, 1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1,
                                color: 'var(--text-secondary)'
                            }
                        }
                    }
                }
            });
        };

        // [NOVO] Função para carregar detalhes de Engajamento com Campanhas
        const loadCampaignsDetails = async () => {
            const tbody = document.getElementById('topTemplatesBody');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">A carregar...</td></tr>';

            try {
                const response = await apiRequest(`/api/dashboard/analytics/campaigns`);
                if (!response.success) throw new Error(response.message);

                const data = response.data;

                renderTable('topTemplatesBody', data.top_templates_table, [
                    { key: 'template_name' },
                    { key: 'campaign_count' },
                    { key: 'total_views' }
                ], 'Nenhum template em uso em campanhas ativas.');

                renderCampaignsChart(data.top_campaigns_chart);

            } catch (error) {
                showNotification(`Erro ao carregar detalhes das campanhas: ${error.message}`, 'error');
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--warning-text);">Falha ao carregar.</td></tr>';
            }
        };

        // [NOVO] Função para renderizar o gráfico de Campanhas
        const renderCampaignsChart = (chartData) => {
            const canvas = document.getElementById('campaignsChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            if (campaignsChartInstance) {
                campaignsChartInstance.destroy();
            }

            campaignsChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Visualizações',
                        data: chartData.data,
                        backgroundColor: 'rgba(11, 197, 234, 0.5)', // Cor ciano do card
                        borderColor: 'rgba(11, 197, 234, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    indexAxis: 'y', // Gráfico de barras horizontais para melhor leitura dos nomes
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            beginAtZero: true,
                            ticks: { color: 'var(--text-secondary)' }
                        },
                        y: {
                            ticks: { color: 'var(--text-secondary)' }
                        }
                    },
                    plugins: {
                        legend: { display: false } // O label no dataset já é suficiente
                    }
                }
            });
        };

        // [NOVO] Função para carregar detalhes de Saúde do Servidor
        const loadServerHealthDetails = async () => {
            const tbody = document.getElementById('serviceEventsBody');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">A carregar eventos...</td></tr>';

            try {
                const response = await apiRequest(`/api/dashboard/analytics/server-health`);
                if (!response.success) throw new Error(response.message);

                const data = response.data;

                renderTable('serviceEventsBody', data.service_events, [
                    { key: 'timestamp', type: 'datetime' },
                    { key: 'action' },
                    { key: 'description' }
                ], 'Nenhum evento de sistema registado.');

            } catch (error) {
                showNotification(`Erro ao carregar detalhes de saúde do servidor: ${error.message}`, 'error');
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--warning-text);">Falha ao carregar.</td></tr>';
            }
        };

        // [NOVO] Função para gerar o Relatório PDF Completo
        const generateFullReportPDF = () => {
            if (!analyticsPageData || Object.keys(analyticsPageData).length === 0) {
                showNotification('Ainda não há dados carregados para exportar.', 'warning');
                return;
            }

            if (!window.jspdf) {
                showNotification('Biblioteca PDF não carregada.', 'error');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.width;
            const margin = 14;
            let yPos = 20;

            // --- Cabeçalho ---
            doc.setFontSize(22);
            doc.setTextColor(40, 40, 40);
            doc.text("Relatório do Dashboard Analítico", margin, yPos);
            
            yPos += 10;
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, margin, yPos);
            doc.text(`Gerado por: ${window.currentUserProfile?.email || 'Sistema'}`, margin, yPos + 5);

            yPos += 15;
            doc.setLineWidth(0.5);
            doc.setDrawColor(200, 200, 200);
            doc.line(margin, yPos, pageWidth - margin, yPos);
            yPos += 10;

            // --- Resumo Executivo (Cards) ---
            doc.setFontSize(16);
            doc.setTextColor(0, 0, 0);
            doc.text("Resumo Executivo", margin, yPos);
            yPos += 10;

            const summaryData = [
                ['Métrica', 'Valor Principal', 'Detalhe'],
                ['Acessos ao Painel', `Sucesso: ${analyticsPageData.logins.success}`, `Falhas: ${analyticsPageData.logins.failure}`],
                ['Usuários Hotspot', `Total: ${analyticsPageData.hotspotUsers.total}`, `Marketing: ${analyticsPageData.hotspotUsers.marketing}`],
                ['Roteadores', `Online: ${analyticsPageData.routers.online}`, `Offline: ${analyticsPageData.routers.offline}`],
                ['Tickets de Suporte', `Abertos: ${analyticsPageData.tickets.open}`, `Total: ${analyticsPageData.tickets.total}`],
                ['Pedidos LGPD', `Pendentes: ${analyticsPageData.lgpd.pending}`, `Concluídos: ${analyticsPageData.lgpd.completed}`],
                ['Atividade Admin', `Ações (24h): ${analyticsPageData.adminActivity.actionsLast24h}`, `-`],
                ['Sorteios', `Ativos: ${analyticsPageData.raffles.active}`, `Total: ${analyticsPageData.raffles.total}`],
                ['Campanhas', `Ativas: ${analyticsPageData.campaigns.active}`, `Views: ${analyticsPageData.campaigns.totalViews}`]
            ];

            doc.autoTable({
                startY: yPos,
                head: [summaryData[0]],
                body: summaryData.slice(1),
                theme: 'grid',
                headStyles: { fillColor: [66, 153, 225], textColor: 255 },
                styles: { fontSize: 10, cellPadding: 5 },
                columnStyles: { 0: { fontStyle: 'bold' } }
            });

            yPos = doc.lastAutoTable.finalY + 15;

            // --- Top Roteadores ---
            if (analyticsPageData.userDistributionByRouter) {
                doc.setFontSize(14);
                doc.text("Top 10 Roteadores por Usuários", margin, yPos);
                yPos += 6;

                const routerData = analyticsPageData.userDistributionByRouter.labels.map((label, index) => [
                    label,
                    analyticsPageData.userDistributionByRouter.data[index]
                ]);

                doc.autoTable({
                    startY: yPos,
                    head: [['Roteador', 'Total de Usuários']],
                    body: routerData,
                    theme: 'striped',
                    headStyles: { fillColor: [45, 55, 72] }
                });
                yPos = doc.lastAutoTable.finalY + 15;
            }

            // --- Rodapé ---
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
            }

            doc.save(`Relatorio_Dashboard_Analitico_${new Date().toISOString().slice(0, 10)}.pdf`);
        };

        // Adiciona os listeners de clique aos cards
        document.querySelectorAll('.stat-card.clickable').forEach(card => {
            card.addEventListener('click', () => {
                // [NOVO] Impede o clique se o card estiver desativado por falta de permissão
                if (card.classList.contains('disabled')) {
                    showNotification('Acesso aos detalhes negado.', 'warning');
                    return;
                }
                const metric = card.dataset.metric;
                showDetailSection(metric);
            });
        });

        // [NOVO] Adiciona listener para os botões de filtro usando delegação de eventos
        const detailsContainer = document.getElementById('analytics-details-container');
        if (detailsContainer) {
            detailsContainer.addEventListener('click', (event) => {
                const button = event.target.closest('.filter-buttons button');
                if (button && button.dataset.period) {
                    // Descobre em qual seção o botão foi clicado
                    const detailSection = button.closest('.analytics-detail-section');
                    if (detailSection.id === 'details-logins') {
                        loadLoginDetails(button.dataset.period);
                    } else if (detailSection.id === 'details-hotspotUsers') {
                        // Verifica qual sub-aba está ativa
                        if (document.getElementById('hotspot-details-activity').classList.contains('active')) {
                            loadHotspotActivityDetails(button.dataset.period);
                        } else {
                            loadHotspotRegistrationDetails(button.dataset.period, marketingCheckbox.checked);
                        }
                    } else if (detailSection.id === 'details-routers') {
                        // A seção de roteadores não tem filtro de período por enquanto
                    } else if (detailSection.id === 'details-tickets') {
                        loadTicketDetails(button.dataset.period);
                    } else if (detailSection.id === 'details-lgpd') {
                        loadLgpdDetails(button.dataset.period);
                    } else if (detailSection.id === 'details-adminActivity') {
                        loadAdminActivityDetails(button.dataset.period);
                    } else if (detailSection.id === 'details-raffles') { // [NOVO]
                        loadRafflesDetails(button.dataset.period);
                    } else if (detailSection.id === 'details-campaigns') {
                        // Esta seção não tem filtro de período por enquanto
                        // loadCampaignsDetails();
                    } else if (detailSection.id === 'details-serverHealth') {
                        // Esta seção não tem filtro de período
                        // loadServerHealthDetails();
                    }
                }
            });
        }

        if (exportFullPdfBtn) {
            exportFullPdfBtn.addEventListener('click', generateFullReportPDF);
        }

        loadAnalyticsData();
    };
}