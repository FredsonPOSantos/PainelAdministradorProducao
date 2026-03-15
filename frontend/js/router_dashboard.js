// Ficheiro: frontend/js/router_dashboard.js
// Dashboard de Roteador com Cards Interativos

// [MODIFICADO] Função de inicialização nomeada para suportar carregamento dinâmico (SPA) e direto
const initRouterDashboard = () => {
    // ===== VARIÁVEIS GLOBAIS =====
    const routerId = window.location.hash.substring(1);
    // [CORRIGIDO] Define o range padrão para o modal. O range do dashboard principal agora é fixo.
    let currentRange = '1h'; 
    const DASHBOARD_SUMMARY_RANGE = '24h'; // [NOVO] Range fixo para os cards de resumo da página principal.
    let cpuChartInstance = null;
    let memoryChartInstance = null;
    let trafficDistributionChartInstance = null;
    let metricsData = {};
    let expandedChartInstance = null;
    let liveUpdateInterval = null; // [NOVO] Para controlar o intervalo de atualização
    const liveUpdateToggle = document.getElementById('liveUpdateToggle'); // [NOVO] Botão de toggle
    let currentExpandedMetric = null;
    let currentChartType = 'both'; // 'rx', 'tx', 'both'
    let currentChartVisualization = 'area'; // 'area', 'bar', 'line'

    // ===== VALIDAÇÃO INICIAL =====
    if (!routerId || isNaN(routerId)) {
        document.getElementById('routerNameTitle').textContent = 'ID do Roteador Inválido';
        return;
    }

    // ===== INICIALIZAÇÃO =====
    // [NOVO] Fallback para o preloader se a página for aberta diretamente (standalone)
    // Isso garante que o utilizador veja o carregamento mesmo sem o admin_dashboard.js
    if (typeof window.showPagePreloader !== 'function') {
        const preloaderId = 'standalone-preloader';
        if (!document.getElementById(preloaderId)) {
            const overlay = document.createElement('div');
            overlay.id = preloaderId;
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background-color: #111827; z-index: 99999; display: flex;
                justify-content: center; align-items: center; flex-direction: column;
                color: #fff; font-family: system-ui, -apple-system, sans-serif;
            `;
            overlay.innerHTML = `
                <div style="width: 50px; height: 50px; border: 4px solid rgba(255,255,255,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <p id="${preloaderId}-text" style="margin-top: 1rem; font-size: 1.1rem;">A carregar dashboard...</p>
                <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
            `;
            document.body.appendChild(overlay);
        }
        window.showPagePreloader = (msg) => {
            const el = document.getElementById(preloaderId);
            if (el) { el.style.opacity = '1'; el.style.pointerEvents = 'all'; }
            const txt = document.getElementById(`${preloaderId}-text`);
            if (txt && msg) txt.textContent = msg;
        };
        window.hidePagePreloader = () => {
            const el = document.getElementById(preloaderId);
            if (el) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; setTimeout(() => el.remove(), 500); }
        };
    }

    // Mostra o preloader imediatamente
    window.showPagePreloader('A carregar dashboard do roteador...');

    // [MODIFICADO] Carrega os dados e SÓ ENTÃO inicia as atualizações ao vivo.
    loadMetrics(DASHBOARD_SUMMARY_RANGE).finally(() => {
        window.hidePagePreloader();
    });
    setupEventListeners();

    // ===== FUNÇÕES PRINCIPAIS =====

    /**
     * Carrega as métricas da API
     */
    async function loadMetrics(range) {
        // [NOVO] Pausa as atualizações em tempo real durante o carregamento principal.
        if (liveUpdateInterval) stopLiveUpdates();

        try {
            const response = await apiRequest(`/api/monitoring/router/${routerId}/detailed-metrics?range=${range}`);

            // [CORRIGIDO] A API retorna { success: true, data: { ... } }. O objeto de dados está em response.data.
            let apiData = response.data; // [CORRIGIDO]

            if (!apiData) {
                throw new Error('Dados vazios retornados da API');
            }

            metricsData = apiData;

            // Atualizar header
            // [MODIFICADO] Exibe o nome e a versão do roteador (se disponível) na mesma linha
            const routerName = metricsData.routerName || 'Roteador Desconhecido';
            const routerVersion = metricsData.routerVersion || metricsData.version || (metricsData.system && metricsData.system.version) || '';
            
            const titleEl = document.getElementById('routerNameTitle');
            if (titleEl) {
                titleEl.innerHTML = `${routerName}${routerVersion ? ` <span class="router-version-tag">${routerVersion}</span>` : ''}`;
                
                // [RESTAURADO] Injeta o botão de reiniciar
                if (!document.getElementById('rebootRouterBtn')) {
                    const btn = document.createElement('button');
                    btn.id = 'rebootRouterBtn';
                    btn.className = 'btn-danger';
                    btn.style.cssText = 'margin-left: 15px; padding: 5px 15px; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 5px; vertical-align: middle; cursor: pointer; border: none; border-radius: 5px; color: white; background-color: #ef4444;';
                    btn.innerHTML = '<i class="fas fa-power-off"></i> Reiniciar';
                    btn.onclick = () => window.handleRebootRouter(routerId, routerName);
                    titleEl.appendChild(btn);
                }

                // [NOVO] Injeta o ícone de Engrenagem (Gestão)
                if (!document.getElementById('manageRouterBtn')) {
                    const gearBtn = document.createElement('button');
                    gearBtn.id = 'manageRouterBtn';
                    gearBtn.className = 'btn-secondary';
                    gearBtn.style.cssText = 'margin-left: 10px; padding: 5px 10px; font-size: 1.1rem; cursor: pointer; border: none; border-radius: 5px; color: #e5e7eb; background-color: #374151;';
                    gearBtn.innerHTML = '<i class="fas fa-cog"></i>';
                    gearBtn.title = "Ferramentas de Gestão";
                    gearBtn.onclick = () => window.openManagementModal();
                    titleEl.appendChild(gearBtn);
                }
            }

            const ipDisplay = document.getElementById('routerIpDisplay');
            ipDisplay.textContent = `IP: ${metricsData.routerIp || 'Desconhecido'}`;

            // [NOVO] Exibe o Uptime logo abaixo do IP
            let uptimeDisplay = document.getElementById('routerUptimeDisplay');
            if (!uptimeDisplay) {
                uptimeDisplay = document.createElement('p');
                uptimeDisplay.id = 'routerUptimeDisplay';
                uptimeDisplay.style.cssText = 'margin: 4px 0 0 0; color: #9CA3AF; font-size: 0.9em;';
                ipDisplay.after(uptimeDisplay);
            }
            uptimeDisplay.textContent = `Uptime: ${formatUptime(metricsData.currentUptime)}`;
            
            // [NOVO] Preenche os valores iniciais do cabeçalho de tempo real
            // [CORREÇÃO] Validação robusta para evitar erro de .toFixed() em undefined
            const currentCpu = metricsData.system?.cpu?.stats?.current;
            const currentMem = metricsData.system?.memory?.stats?.current;
            document.getElementById('liveCpu').textContent = (typeof currentCpu === 'number' ? currentCpu.toFixed(2) : '0') + '%';
            document.getElementById('liveMemory').textContent = (typeof currentMem === 'number' ? currentMem.toFixed(2) : '0') + '%';

            // Atualizar cards
            await updateCards(); // [MODIFICADO] Agora aguarda a atualização completa dos cards

        } catch (error) {
            console.error('Erro ao carregar métricas:', error);
            showErrorState(error.message);
        } finally {
            // [NOVO] Retoma as atualizações em tempo real após o carregamento, se o toggle estiver ativo.
            if (liveUpdateToggle && (liveUpdateToggle.checked || !liveUpdateInterval)) {
                startLiveUpdates();
            }
        }
    }

    /**
     * Atualiza os cards com os dados carregados
     */
    async function updateCards() { // [MODIFICADO] Agora é async para permitir Promise.all
        // Sistema
        if (metricsData.system) {            
            renderCpuChart(metricsData.system.cpu);
            renderMemoryChart(metricsData.system.memory);
            updateCardStats('uptime', metricsData.system.uptime);
        }

        // Interfaces
        if (metricsData.interfaces) {
            renderInterfaceCards();
            renderTrafficDistributionChart(metricsData.interfaces);
        }

        // [MODIFICADO] Carrega todos os dados adicionais em paralelo e aguarda a conclusão
        await Promise.all([
            loadClientsData(),
            loadWifiAnalytics(),
            loadDhcpAnalytics(),
            loadHotspotAnalytics(),
            loadAvailabilityData()
        ]);
    }

    /**
     * [NOVO] Lida com o clique no botão de reiniciar
     */
    window.handleRebootRouter = async (id, name) => {
        let credentials = window.tempApiCredentials;
        if (!credentials) {
            credentials = await showCredentialPrompt(`Reiniciar Roteador "${name}"`);
        }

        if (!credentials) {
            // O utilizador cancelou
            return;
        }

        // Verifica se o botão existe antes de tentar manipulá-lo
        const btn = document.getElementById('rebootRouterBtn');
        let originalText = '';
        if (btn) {
            originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A reiniciar...';
        }

        try {
            // Envia as credenciais no corpo da requisição
            const response = await apiRequest(`/api/routers/${id}/reboot`, 'POST', {
                username: credentials.username,
                password: credentials.password,
                ip_address: metricsData.routerIp // [NOVO] Envia o IP para evitar consulta ao DB
            });
            alert(response.message || 'Comando enviado com sucesso.');
        } catch (error) {
            alert(`Erro ao reiniciar: ${error.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    };

    /**
     * [NOVO] Mostra um modal para pedir credenciais da API.
     * @param {string} title - O título do modal.
     * @returns {Promise<{username: string, password: string}|null>}
     */
    function showCredentialPrompt(title) {
        return new Promise((resolve) => {
            const existingModal = document.getElementById('credentialPromptModal');
            if (existingModal) existingModal.remove();

            const modalOverlay = document.createElement('div');
            modalOverlay.id = 'credentialPromptModal';
            modalOverlay.className = 'confirmation-modal-overlay';
            modalOverlay.innerHTML = `
                <div class="confirmation-modal-content" style="width: 400px; max-width: 90%;">
                    <h3>${title}</h3>
                    <p style="font-size: 0.9em; color: #9CA3AF;">Insira as credenciais da API do MikroTik para esta ação. Elas não serão guardadas.</p>
                    <div style="margin-top: 1rem; display: flex; flex-direction: column; gap: 1rem;">
                        <input type="text" id="promptUsername" placeholder="Usuário API (ex: admin)" style="width: 100%; padding: 10px; background: #374151; border: 1px solid #4B5563; color: white; border-radius: 4px;">
                        <input type="password" id="promptPassword" placeholder="Senha API" style="width: 100%; padding: 10px; background: #374151; border: 1px solid #4B5563; color: white; border-radius: 4px;">
                    </div>
                    <div class="confirmation-modal-buttons" style="margin-top: 1.5rem;">
                        <button class="confirmation-modal-btn" data-action="cancel">Cancelar</button>
                        <button class="confirmation-modal-btn" data-action="confirm">Confirmar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalOverlay);
            setTimeout(() => modalOverlay.classList.add('visible'), 10);

            const usernameInput = document.getElementById('promptUsername');
            usernameInput.focus();

            const confirmBtn = modalOverlay.querySelector('button[data-action="confirm"]');
            const cancelBtn = modalOverlay.querySelector('button[data-action="cancel"]');

            const resolveAndClose = (value) => {
                modalOverlay.classList.remove('visible');
                // [CORREÇÃO ROBUSTA] Usa setTimeout para garantir que o modal fecha e resolve a Promise
                // Evita bloqueios se o evento 'transitionend' não disparar, que é um problema comum.
                const a = setTimeout(() => {
                    modalOverlay.remove();
                    clearTimeout(a);
                    resolve(value);
                }, 300);
            };

            confirmBtn.onclick = () => {
                const username = usernameInput.value;
                const password = document.getElementById('promptPassword').value;
                if (!username || !password) {
                    alert('Usuário e senha são obrigatórios.');
                    return;
                }
                resolveAndClose({ username, password });
            };

            cancelBtn.onclick = () => resolveAndClose(null);
            modalOverlay.onclick = (e) => {
                if (e.target === modalOverlay) resolveAndClose(null);
            };
        });
    }

    /**
     * [NOVO] Busca e atualiza os dados do cabeçalho em tempo real.
     */
    async function fetchLiveSummary() {
        try {
            const response = await apiRequest(`/api/monitoring/router/${routerId}/live-summary`);
            if (response.success && response.data) {
                const liveData = response.data; // [CORRIGIDO] A API retorna { success: true, data: {...} }.
                document.getElementById('liveCpu').textContent = liveData.cpu.toFixed(2) + '%';
                document.getElementById('liveMemory').textContent = liveData.memory.toFixed(2) + '%';
                document.getElementById('liveClients').textContent = liveData.clients;
            }
        } catch (error) {
            console.warn('Falha ao buscar live summary:', error.message);
            // Opcional: mostrar um indicador de erro no cabeçalho
        }
    }

    /**
     * [NOVO] Inicia o polling para atualizações em tempo real.
     */
    function startLiveUpdates() {
        if (liveUpdateInterval) clearInterval(liveUpdateInterval); // Limpa qualquer intervalo anterior
        fetchLiveSummary(); // Busca imediatamente
        liveUpdateInterval = setInterval(fetchLiveSummary, 5000); // Atualiza a cada 5 segundos
        if (liveUpdateToggle) liveUpdateToggle.checked = true;
        console.log("Live updates iniciados.");
    }

    /**
     * [NOVO] Para o polling de atualizações em tempo real.
     */
    function stopLiveUpdates() {
        if (liveUpdateInterval) {
            clearInterval(liveUpdateInterval);
            liveUpdateInterval = null;
        }
        if (liveUpdateToggle) liveUpdateToggle.checked = false;
        console.log("Live updates parados.");
    }

    /**
     * Carrega dados de clientes (Wi-Fi e DHCP)
     */
    async function loadClientsData() {
        try {
            const response = await apiRequest(`/api/monitoring/router/${routerId}/clients`);

            // [CORRIGIDO] A API retorna { success: true, data: { ... } }. O objeto de dados está em response.data.
            let apiData = response.data; // [CORRIGIDO]

            if (apiData && apiData.clients) {
                // Armazenar dados para exibição no modal
                metricsData.wifiClients = apiData.clients.wifi?.details || [];
                metricsData.dhcpClients = apiData.clients.dhcp?.details || [];
                metricsData.hotspotClients = apiData.clients.hotspot?.details || [];

                // [NOVO] Atualiza a contagem de clientes no cabeçalho com a lógica unificada
                const clientCardCount = apiData.clients.hotspot?.count || apiData.clients.wifi?.count || apiData.clients.dhcp?.count || 0;
                document.getElementById('liveClients').textContent = clientCardCount;
            }
        } catch (error) {
            console.error('Erro ao carregar dados de clientes:', error);
        }
    }

    /**
     * NOVO: Carrega e exibe os dados de disponibilidade (uptime)
     */
    async function loadAvailabilityData() {
        try {
            const response = await apiRequest(`/api/monitoring/router/${routerId}/availability`);
            if (!response.success) {
                throw new Error(response.message);
            }

            // [CORRIGIDO] A API retorna { success: true, data: {...} }. O acesso correto é response.data.
            const availability = response.data;
            
            const statusEl = document.getElementById('uptime-status');
            const offlineEventsEl = document.getElementById('uptime-offline-events');
            const uptime7dEl = document.getElementById('uptime-7d');
            const uptime30dEl = document.getElementById('uptime-30d');

            if (statusEl) {
                statusEl.textContent = availability.status;
                statusEl.className = `stat-value status-${availability.status.toLowerCase()}`;
            }
            if (offlineEventsEl) {
                offlineEventsEl.textContent = availability.last24h.offline_events;
            }
            if (uptime7dEl) {
                uptime7dEl.textContent = `${availability.last7d.uptime_percent}%`;
            }
            if (uptime30dEl) {
                uptime30dEl.textContent = `${availability.last30d.uptime_percent}%`;
            }

        } catch (error) {
            console.error('Erro ao carregar dados de disponibilidade:', error);
            // Lidar com o estado de erro na UI, se necessário
        }
    }

    function renderCpuChart(cpuData) {
        const container = document.getElementById('cpu-chart-container');
        if (!container || !cpuData || !cpuData.stats) return;
    
        // Update text stats
        document.getElementById('cpu-min').textContent = formatValue(cpuData.stats.min, 'cpu');
        document.getElementById('cpu-avg').textContent = formatValue(cpuData.stats.avg, 'cpu');
        document.getElementById('cpu-max').textContent = formatValue(cpuData.stats.max, 'cpu');
    
        const options = {
            chart: { type: 'radialBar', height: '100%', sparkline: { enabled: false }, background: 'transparent' },
            series: [cpuData.stats.current],
            plotOptions: {
                radialBar: {
                    startAngle: -90,
                    endAngle: 90,
                    hollow: { margin: 20, size: '50%' }, // [CORRIGIDO] Unificado com o gráfico de memória para um visual consistente.
                    track: { background: '#374151' },
                    offsetY: 15, // [CORRIGIDO] Desloca o gráfico para baixo para melhor centralização vertical.
                    dataLabels: {
                        name: { show: false },
                        value: {
                            offsetY: -2,
                            fontSize: '22px',
                            color: '#E5E7EB',
                            formatter: (val) => val.toFixed(1) + '%'
                        }
                    }
                }
            },
            // [REMOVIDO] A propriedade grid.padding não é mais necessária com o ajuste de offsetY.
            fill: {
                type: 'gradient',
                gradient: {
                    shade: 'dark',
                    type: 'horizontal',
                    shadeIntensity: 0.5,
                    gradientToColors: ['#e48315'],
                    inverseColors: true,
                    opacityFrom: 1,
                    opacityTo: 1,
                    stops: [0, 100]
                }
            },
            stroke: { lineCap: 'round' },
            labels: ['CPU'],
        };
    
        if (cpuChartInstance) {
            cpuChartInstance.updateSeries([cpuData.stats.current]);
        } else {
            cpuChartInstance = new ApexCharts(container, options);
            cpuChartInstance.render();
        }
    }

    function renderMemoryChart(memoryData) {
        const container = document.getElementById('memory-chart-container');
        if (!container || !memoryData || !memoryData.stats) return;
    
        document.getElementById('memory-min').textContent = formatValue(memoryData.stats.min, 'memory');
        document.getElementById('memory-avg').textContent = formatValue(memoryData.stats.avg, 'memory');
        document.getElementById('memory-max').textContent = formatValue(memoryData.stats.max, 'memory');
    
        const options = {
            chart: { type: 'radialBar', height: '100%', sparkline: { enabled: false }, background: 'transparent' },
            series: [memoryData.stats.current],
            plotOptions: {
                radialBar: {
                    startAngle: -90,
                    endAngle: 90,
                    hollow: { margin: 20, size: '50%' },
                    track: { background: '#374151' },
                    offsetY: 15, // [CORRIGIDO] Desloca o gráfico para baixo para melhor centralização vertical.
                    dataLabels: {
                        name: { show: false },
                        value: {
                            offsetY: -2,
                            fontSize: '22px',
                            color: '#E5E7EB',
                            formatter: (val) => val.toFixed(1) + '%'
                        }
                    }
                }
            },
            // [REMOVIDO] A propriedade grid.padding não é mais necessária com o ajuste de offsetY.
            fill: {
                type: 'gradient',
                gradient: {
                    shade: 'dark',
                    type: 'horizontal',
                    shadeIntensity: 0.5,
                    gradientToColors: ['#3b82f6'], // Blue color for memory
                    inverseColors: true,
                    opacityFrom: 1,
                    opacityTo: 1,
                    stops: [0, 100]
                }
            },
            stroke: { lineCap: 'round' },
            labels: ['Memory'],
        };
        
        if (memoryChartInstance) {
            memoryChartInstance.updateSeries([memoryData.stats.current]);
        } else {
            memoryChartInstance = new ApexCharts(container, options);
            memoryChartInstance.render();
        }
    }

    function renderTrafficDistributionChart(interfacesData) {
        const container = document.getElementById('traffic-distribution-chart-container');
        if (!container) return;
    
        const etherInterfaces = Object.entries(interfacesData)
            // [CORRIGIDO] Filtra por interfaces físicas e pontes, excluindo virtuais como WireGuard.
            .filter(([name]) => ['ether', 'wifi', 'bridge'].some(type => name.toLowerCase().includes(type)))
            .map(([name, data]) => ({
                name: getInterfaceDisplayName(name),
                traffic: (data.rx?.stats?.avg || 0) + (data.tx?.stats?.avg || 0)
            }))
            .filter(item => item.traffic > 0);
    
        if (etherInterfaces.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #9CA3AF; font-size: 0.9em; padding: 20px;">Sem dados de tráfego nas interfaces "ether" para exibir.</p>';
            return;
        }
    
        const series = etherInterfaces.map(item => item.traffic);
        const labels = etherInterfaces.map(item => item.name);
    
        const options = {
            chart: { type: 'donut', height: 400, background: 'transparent' }, // [CORRIGIDO] Define uma altura fixa para o gráfico para evitar que ele transborde e sobreponha o título.
            series: series,
            labels: labels,
            // [CORRIGIDO] Remove o tema 'dark' que estava a forçar um fundo cinzento no SVG, ignorando a opção 'transparent'.
            colors: ['#5470C6', '#215f05ff', '#f0a80cff', '#e01010ff', '#17a9e2ff', '#5132daff', '#9311cfff'], // [NOVO] Paleta de cores com melhor visibilidade e contraste.
            legend: {
                position: 'bottom',
                fontSize: '16px', // [NOVO] Reduz o tamanho da fonte da legenda para melhor ajuste.
                labels: { colors: '#E5E7EB' }
            },
            tooltip: { y: { formatter: (val) => formatBytes(val) + '/s' } },
            // [MODIFICADO] Simplifica os rótulos para mostrar apenas a percentagem,
            // o que é mais limpo e evita sobreposição no gráfico.
            dataLabels: {
                formatter: (val) => val.toFixed(1) + '%'
            }
        };
    
        if (trafficDistributionChartInstance) {
            trafficDistributionChartInstance.updateOptions(options);
        } else {
            trafficDistributionChartInstance = new ApexCharts(container, options);
            trafficDistributionChartInstance.render();
        }
    }

    /**
     * NOVO: Carrega e exibe a análise de clientes Wi-Fi
     */
    async function loadWifiAnalytics() {
        try {
            const response = await apiRequest(`/api/monitoring/router/${routerId}/wifi-analytics`);
            if (!response.success) {
                throw new Error(response.message);
            }

            // [CORRIGIDO] A API retorna { success: true, data: {...} }. O acesso correto é response.data.
            const wifiData = response.data;
            
            // Armazena os dados para o gráfico de pizza
            metricsData.wifiAnalytics = wifiData;

            // Atualiza o card
            document.getElementById('wifi-clients-count').textContent = wifiData.current;
            document.getElementById('wifi-clients-1h').textContent = wifiData.last_1h;
            document.getElementById('wifi-clients-7d').textContent = wifiData.last_7d;
            document.getElementById('wifi-clients-30d').textContent = wifiData.last_30d;

        } catch (error) {
            console.error('Erro ao carregar análise Wi-Fi:', error);
            document.getElementById('wifi-clients-count').textContent = 'Erro';
            // Limpar outros campos se necessário
        }
    }

    /**
     * NOVO: Carrega e exibe a análise de clientes DHCP
     */
    async function loadDhcpAnalytics() {
        try {
            const response = await apiRequest(`/api/monitoring/router/${routerId}/dhcp-analytics`);
            if (!response.success) {
                throw new Error(response.message);
            }

            // [CORRIGIDO] A API retorna { success: true, data: {...} }. O acesso correto é response.data.
            const dhcpData = response.data;
            
            // Armazena os dados para o gráfico
            metricsData.dhcpAnalytics = dhcpData;

            // Atualiza o card
            document.getElementById('dhcp-clients-count').textContent = dhcpData.current;

            // Mostra uma breve distribuição no card
            const distributionEl = document.getElementById('dhcp-clients-distribution');
            if (distributionEl && dhcpData.distribution.labels.length > 0) {
                distributionEl.textContent = dhcpData.distribution.labels.map((label, index) => 
                    `${label}: ${dhcpData.distribution.series[index]}`
                ).join(' | ');
            }

        } catch (error) {
            console.error('Erro ao carregar análise DHCP:', error);
            document.getElementById('dhcp-clients-count').textContent = 'Erro';
        }
    }

    /**
     * NOVO: Carrega e exibe a análise de clientes Hotspot
     */
    async function loadHotspotAnalytics() {
        try {
            const response = await apiRequest(`/api/monitoring/router/${routerId}/hotspot-analytics`);
            if (!response.success) {
                throw new Error(response.message);
            }

            // [CORRIGIDO] A API retorna { success: true, data: {...} }. O acesso correto é response.data.
            const hotspotData = response.data;
            
            // Armazena os dados para o gráfico
            metricsData.hotspotAnalytics = hotspotData;

            // Atualiza o card
            document.getElementById('hotspot-clients-count').textContent = hotspotData.current;
            document.getElementById('hotspot-clients-1h').textContent = hotspotData.last_1h;
            document.getElementById('hotspot-clients-24h').textContent = hotspotData.last_24h;
            document.getElementById('hotspot-clients-7d').textContent = hotspotData.last_7d;
            // O de 15 dias não tem campo no card, mas será usado no gráfico
            document.getElementById('hotspot-clients-30d').textContent = hotspotData.last_30d;

        } catch (error) {
            console.error('Erro ao carregar análise Hotspot:', error);
            document.getElementById('hotspot-clients-count').textContent = 'Erro';
            // Limpar outros campos se necessário
        }
    }


    /**
     * Atualiza as estatísticas de um card
     */
    function updateCardStats(metric, data) {
        const minEl = document.getElementById(`${metric}-min`);
        const maxEl = document.getElementById(`${metric}-max`);
        const avgEl = document.getElementById(`${metric}-avg`);

        // [CORREÇÃO CRÍTICA] A variável 'stats' não existia. O correto é 'data.stats'.
        if (minEl && data.stats) minEl.textContent = formatValue(data.stats.min, metric);
        if (maxEl && data.stats) maxEl.textContent = formatValue(data.stats.max, metric);
        if (avgEl && data.stats) avgEl.textContent = formatValue(data.stats.avg, metric);
    }

    /**
     * Formata valores de acordo com o tipo de métrica
     */
    function formatValue(value, metric) {
        if (value === undefined || value === null) return '-';

        switch (metric) {
            case 'cpu':
            case 'memory':
                return value.toFixed(2) + '%';
            case 'uptime':
                return formatUptime(value);
            case 'rx':
            case 'tx':
                return formatBytes(value);
            default:
                return value.toFixed(2);
        }
    }

    /**
     * Formata uptime em segundos para formato legível
     */
    function formatUptime(seconds) {
        if (!seconds) return 'Desconhecido';
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        let parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);

        return parts.join(' ') || Math.floor(seconds) + 's';
    }

    /**
     * [REMOVIDO] A função formatBytes foi movida para o ficheiro global utils.js
     */

    /**
     * Renderiza os cards das interfaces
     */
    function renderInterfaceCards() {
        const container = document.getElementById('interfaces-container');
        container.innerHTML = '';

        if (!metricsData.interfaces || Object.keys(metricsData.interfaces).length === 0) {
            return;
        }

        for (const [interfaceName, data] of Object.entries(metricsData.interfaces)) {
            const card = createInterfaceCard(interfaceName, data);
            container.appendChild(card);
        }
    }

    /**
     * [NOVO] Atualiza as métricas de uma interface específica quando o período é alterado
     */
    window.updateInterfaceMetrics = async (interfaceName, range) => {
        // [NOVO] Adiciona feedback de carregamento
        const loader = document.getElementById(`loader-${interfaceName}`);
        if (loader) loader.style.display = 'flex';

        try {
            // A API busca todos os dados, então precisamos filtrar para a interface correta
            const response = await apiRequest(`/api/monitoring/router/${routerId}/detailed-metrics?range=${range}`);
            if (response.success && response.data && response.data.interfaces && response.data.interfaces[interfaceName]) {
                const data = response.data.interfaces[interfaceName];
                const rxStats = data.rx?.stats || { min: 0, max: 0, avg: 0 };
                const txStats = data.tx?.stats || { min: 0, max: 0, avg: 0 };

                // Helper para atualizar texto se elemento existir
                const updateText = (id, text) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = text;
                };

                updateText(`rx-min-${interfaceName}`, formatBitsPerSecond(rxStats.min));
                updateText(`rx-max-${interfaceName}`, formatBitsPerSecond(rxStats.max));
                updateText(`rx-avg-${interfaceName}`, formatBitsPerSecond(rxStats.avg));

                updateText(`tx-min-${interfaceName}`, formatBitsPerSecond(txStats.min));
                updateText(`tx-max-${interfaceName}`, formatBitsPerSecond(txStats.max));
                updateText(`tx-avg-${interfaceName}`, formatBitsPerSecond(txStats.avg));
            } else {
                throw new Error("Dados da interface não encontrados na resposta.");
            }
        } catch (error) {
            console.error('Erro ao atualizar métricas da interface:', error);
            // Opcional: Mostrar erro no card
        } finally {
            if (loader) loader.style.display = 'none';
        }
    };

    /**
     * Cria um card para uma interface
     */
    function createInterfaceCard(interfaceName, data) {
        const card = document.createElement('div');
        card.className = 'metric-card interface-card';
        card.id = `card-interface-${interfaceName.replace(/[^a-zA-Z0-9]/g, '_')}`; // ID para exportação PNG
        card.dataset.metric = `interface-${interfaceName}`;

        const icon = getInterfaceIcon(interfaceName);
        const displayName = getInterfaceDisplayName(interfaceName);

        const rxStats = data.rx?.stats || { min: 0, max: 0, avg: 0 };
        const txStats = data.tx?.stats || { min: 0, max: 0, avg: 0 };

        // Define o seletor de período com estilo inline para se ajustar ao cabeçalho
        const isSelected = (val) => val === DASHBOARD_SUMMARY_RANGE ? 'selected' : '';

        card.innerHTML = `
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div class="card-icon interface-icon">
                        <i class="${icon}"></i>
                    </div>
                    <h3 style="margin: 0;">${displayName}</h3>
                </div>
                <select class="interface-range-select" style="padding: 2px 5px; border-radius: 4px; background: #374151; color: #fff; border: 1px solid #4B5563; font-size: 0.8rem;" onchange="updateInterfaceMetrics('${interfaceName}', this.value)">
                    <option value="1h" ${isSelected('1h')}>1h</option>
                    <option value="24h" ${isSelected('24h')}>24h</option>
                    <option value="15d" ${isSelected('15d')}>15d</option>
                    <option value="30d" ${isSelected('30d')}>30d</option>
                </select>
            </div>
            <div class="card-stats" style="position: relative;">
                <!-- [NOVO] Loader Overlay -->
                <div id="loader-${interfaceName}" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(31, 41, 55, 0.85); justify-content: center; align-items: center; flex-direction: column; z-index: 10; border-radius: 8px; backdrop-filter: blur(2px);">
                    <div style="width: 24px; height: 24px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
                    <span style="margin-top: 8px; font-size: 0.75rem; color: #9ca3af; font-weight: 500;">A carregar...</span>
                </div>

                <div class="stat-group">
                    <div class="stat-group-title">RX (Recebido)</div>
                    <div class="stat-row">
                        <span class="stat-label">Mín:</span>
                        <span class="stat-value" id="rx-min-${interfaceName}">${formatBitsPerSecond(rxStats.min)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Máx:</span>
                        <span class="stat-value" id="rx-max-${interfaceName}">${formatBitsPerSecond(rxStats.max)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Média:</span>
                        <span class="stat-value" id="rx-avg-${interfaceName}">${formatBitsPerSecond(rxStats.avg)}</span>
                    </div>
                </div>
                <div class="stat-group">
                    <div class="stat-group-title">TX (Enviado)</div>
                    <div class="stat-row">
                        <span class="stat-label">Mín:</span>
                        <span class="stat-value" id="tx-min-${interfaceName}">${formatBitsPerSecond(txStats.min)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Máx:</span>
                        <span class="stat-value" id="tx-max-${interfaceName}">${formatBitsPerSecond(txStats.max)}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Média:</span>
                        <span class="stat-value" id="tx-avg-${interfaceName}">${formatBitsPerSecond(txStats.avg)}</span>
                    </div>
                </div>
            </div>
            <div class="card-footer">
                <div style="display: flex; justify-content: center; gap: 10px; width: 100%;">
                    <button class="btn-secondary" style="padding: 6px 12px;" onclick="expandMetric('interface-${interfaceName}')" title="Ver Gráfico">
                        <i class="fas fa-chart-line"></i>
                    </button>
                    <button class="btn-secondary" style="padding: 6px 12px;" onclick="window.exportInterfaceData('${interfaceName}', 'xlsx')" title="Exportar Excel">
                        <i class="fas fa-file-excel"></i>
                    </button>
                    <button class="btn-secondary" style="padding: 6px 12px;" onclick="window.exportInterfaceData('${interfaceName}', 'pdf')" title="Exportar PDF">
                        <i class="fas fa-file-pdf"></i>
                    </button>
                    <button class="btn-secondary" style="padding: 6px 12px;" onclick="window.exportCardToPNG('${card.id}', '${interfaceName}')" title="Exportar Imagem (PNG)">
                        <i class="fas fa-image"></i>
                    </button>
                </div>
            </div>
            <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        `;

        return card;
    }

    /**
     * [NOVO] Exporta dados de uma interface específica
     */
    window.exportInterfaceData = (interfaceName, format) => {
        const data = metricsData.interfaces?.[interfaceName];
        if (!data) {
            alert("Dados não disponíveis para exportação.");
            return;
        }

        const rx = data.rx?.stats || { min: 0, max: 0, avg: 0 };
        const tx = data.tx?.stats || { min: 0, max: 0, avg: 0 };
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const filename = `interface_${interfaceName}_${timestamp}`;

        const exportData = [{
            "Interface": interfaceName,
            "RX Mín": formatBitsPerSecond(rx.min),
            "RX Méd": formatBitsPerSecond(rx.avg),
            "RX Máx": formatBitsPerSecond(rx.max),
            "TX Mín": formatBitsPerSecond(tx.min),
            "TX Méd": formatBitsPerSecond(tx.avg),
            "TX Máx": formatBitsPerSecond(tx.max)
        }];

        if (format === 'xlsx') {
            if (typeof XLSX === 'undefined') return alert("Biblioteca XLSX não carregada.");
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Interface Stats");
            XLSX.writeFile(wb, `${filename}.xlsx`);
        } else if (format === 'pdf') {
            if (!window.jspdf) return alert("Biblioteca PDF não carregada.");
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            doc.text(`Estatísticas da Interface: ${interfaceName}`, 14, 20);
            doc.setFontSize(10);
            doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 28);

            const headers = [["Interface", "RX Mín", "RX Méd", "RX Máx", "TX Mín", "TX Méd", "TX Máx"]];
            const rows = exportData.map(row => Object.values(row));

            doc.autoTable({
                startY: 35,
                head: headers,
                body: rows,
            });
            doc.save(`${filename}.pdf`);
        }
    };

    /**
     * [NOVO] Exporta um card HTML como imagem PNG
     */
    window.exportCardToPNG = (elementId, name) => {
        if (typeof html2canvas === 'undefined') {
            alert("Biblioteca html2canvas não carregada.");
            return;
        }
        const element = document.getElementById(elementId);
        if (!element) return;

        html2canvas(element, { backgroundColor: '#1f2937' }).then(canvas => {
            const link = document.createElement('a');
            link.download = `${name}_card.png`;
            link.href = canvas.toDataURL();
            link.click();
        });
    };

    /**
     * Retorna o ícone apropriado para uma interface
     */
    function getInterfaceIcon(interfaceName) {
        const name = interfaceName.toLowerCase();
        
        if (name.includes('gateway') || name.includes('wan')) {
            return 'fas fa-globe';
        } else if (name.includes('wifi') || name.includes('wireless')) {
            return 'fas fa-wifi';
        } else if (name.includes('bridge')) {
            return 'fas fa-link';
        } else if (name.includes('uni-fi') || name.includes('unifi')) {
            return 'fas fa-network-wired';
        } else if (name.includes('hotspot')) {
            return 'fas fa-wifi-strong';
        } else if (name.includes('lan') || name.includes('ether')) {
            return 'fas fa-ethernet';
        } else {
            return 'fas fa-network-wired';
        }
    }

    /**
     * Retorna o nome de exibição para uma interface
     */
    function getInterfaceDisplayName(interfaceName) {
        if (interfaceName.includes(' - ')) {
            return interfaceName;
        }

        const name = interfaceName.toLowerCase();
        
        if (name.includes('gateway') || name.includes('wan')) {
            return 'Gateway (WAN)';
        } else if (name.includes('wifi1')) {
            return 'Wi-Fi 1';
        } else if (name.includes('wifi2')) {
            return 'Wi-Fi 2';
        } else if (name.includes('wifi')) {
            return 'Wi-Fi';
        } else if (name.includes('bridge')) {
            return 'Bridge - ' + interfaceName;
        } else if (name.includes('uni-fi') || name.includes('unifi')) {
            return 'Uni-Fi';
        } else if (name.includes('hotspot')) {
            return 'Hotspot';
        } else if (name.includes('lan') || name.includes('ether')) {
            return 'LAN - ' + interfaceName;
        } else {
            return interfaceName;
        }
    }

    /**
     * Expande um card para mostrar o gráfico
     */
    window.expandMetric = async function(metric) {
        // [NOVO] Pede credenciais para dados em tempo real
        if (metric === 'dhcp-clients' || metric === 'wifi-clients' || metric === 'hotspot-clients') {
            const credentials = await showCredentialPrompt(`Buscar Clientes em Tempo Real`);
            if (!credentials) {
                showNotification('Operação cancelada. Não é possível buscar dados em tempo real sem credenciais.', 'info');
                return; // Cancela se o utilizador não fornecer credenciais
            }
            // Armazena as credenciais temporariamente para a próxima função usar
            window.tempApiCredentials = credentials;
        }

        currentExpandedMetric = metric;
        currentChartType = 'both';
        currentChartVisualization = 'area';
        
        const modal = document.getElementById('expandedModal');
        const modalTitle = document.getElementById('modalTitle');
        const chartTypeFilters = document.getElementById('chartTypeFilters');
        const chartVisualizationFilters = document.getElementById('chartVisualizationFilters');
        // [NOVO] Adiciona um seletor para os filtros de período do modal
        const modalPeriodFilters = document.querySelector('#expandedModal .modal-filters');
        const expandedChartContainer = document.getElementById('expandedChart');

        // Determinar o título
        if (metric === 'cpu') {
            modalTitle.textContent = 'Uso de CPU (%)';
            chartTypeFilters.style.display = 'none';
            chartVisualizationFilters.style.display = 'none';
        } else if (metric === 'memory') {
            modalTitle.textContent = 'Uso de Memória (%)';
            chartTypeFilters.style.display = 'none';
            chartVisualizationFilters.style.display = 'none';
        } else if (metric === 'uptime') {
            modalTitle.textContent = 'Uptime';
            chartTypeFilters.style.display = 'none';
            chartVisualizationFilters.style.display = 'none';
        } else if (metric.startsWith('interface-')) {
            const interfaceName = metric.replace('interface-', '');
            modalTitle.textContent = `Tráfego - ${getInterfaceDisplayName(interfaceName)}`;
            chartTypeFilters.style.display = 'flex';
            chartVisualizationFilters.style.display = 'flex';
            if (modalPeriodFilters) modalPeriodFilters.style.display = 'flex'; // Mostra filtros de período
        } else if (metric === 'dhcp-clients') {
            modalTitle.textContent = 'Clientes DHCP Ativos';
            chartTypeFilters.style.display = 'none';
            chartVisualizationFilters.style.display = 'none';
            if (modalPeriodFilters) modalPeriodFilters.style.display = 'none'; // [MODIFICADO] Esconde filtros de período
        } else if (metric === 'wifi-clients') {
            modalTitle.textContent = 'Clientes Wi-Fi Conectados';
            chartTypeFilters.style.display = 'none';
            chartVisualizationFilters.style.display = 'none';
            if (modalPeriodFilters) modalPeriodFilters.style.display = 'none'; // [MODIFICADO] Esconde filtros de período
        } else if (metric === 'hotspot-clients') {
            modalTitle.textContent = 'Usuários Hotspot Ativos';
            chartTypeFilters.style.display = 'none';
            chartVisualizationFilters.style.display = 'none';
            // [MODIFICADO] Esconde os filtros de período para o modal de hotspot
            if (modalPeriodFilters) modalPeriodFilters.style.display = 'none';
        }

        // Resetar botões
        document.querySelectorAll('#chartTypeFilters .filter-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('#chartTypeFilters .filter-btn[data-type="both"]')?.classList.add('active');
        
        document.querySelectorAll('#chartVisualizationFilters .filter-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('#chartVisualizationFilters .filter-btn[data-visualization="area"]')?.classList.add('active');

        modal.classList.remove('hidden');
        
        // [NOVO] Tenta obter o range selecionado no card específico, se existir (para interfaces)
        let rangeToUse = currentRange;
        const card = document.querySelector(`.metric-card[data-metric="${metric}"]`);
        if (card) {
            const select = card.querySelector('select.interface-range-select');
            if (select) {
                rangeToUse = select.value;
            }
        }
        await updateExpandedChart(rangeToUse);
    };

    /**
     * Muda o tipo de gráfico (RX, TX, RX+TX)
     */
    window.updateChartType = async function(type) {
        currentChartType = type;
        
        // Atualizar botões
        document.querySelectorAll('#chartTypeFilters .filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`#chartTypeFilters .filter-btn[data-type="${type}"]`)?.classList.add('active');
        
        // Recriar gráfico
        await updateExpandedChart(currentRange);
    };

    /**
     * Muda o tipo de visualização do gráfico (área, barras, linha)
     */
    window.updateChartVisualization = async function(visualization) {
        currentChartVisualization = visualization;
        
        // Atualizar botões
        document.querySelectorAll('#chartVisualizationFilters .filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`#chartVisualizationFilters .filter-btn[data-visualization="${visualization}"]`)?.classList.add('active');
        
        // Recriar gráfico
        await updateExpandedChart(currentRange);
    };

    /**
     * Atualiza o gráfico expandido
     */
    window.updateExpandedChart = async function(range) {
        // [NOVO] Mostra o loader antes de iniciar a requisição
        if (window.showChartLoader) window.showChartLoader();

        try {
            // Atualizar botões de filtro de período
            document.querySelectorAll('.modal-filters .filter-btn[data-range]').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelector(`.modal-filters .filter-btn[data-range="${range}"]`)?.classList.add('active');

            currentRange = range;

            // Buscar dados
            const response = await apiRequest(`/api/monitoring/router/${routerId}/detailed-metrics?range=${range}`);
            
            if (!response.success) {
                throw new Error(response.message);
            }

            // [CORRIGIDO] A API retorna { success: true, data: {...} }. O acesso correto é response.data.
            const apiData = response.data;

            const chartContainer = document.getElementById('expandedChart');
            chartContainer.innerHTML = '';

            // Criar gráfico baseado na métrica
            if (currentExpandedMetric === 'cpu') {
                if (apiData.system?.cpu?.data) {
                    createExpandedChart(chartContainer, 'CPU (%)', apiData.system.cpu.data, '#e48315');
                } else {
                    chartContainer.innerHTML = '<p style="color: #f0f0f0; padding: 20px;">Sem dados disponíveis para CPU</p>';
                }
            } else if (currentExpandedMetric === 'memory') {
                if (apiData.system?.memory?.data) {
                    createExpandedChart(chartContainer, 'Memória (%)', apiData.system.memory.data, '#3b82f6');
                } else {
                    chartContainer.innerHTML = '<p style="color: #f0f0f0; padding: 20px;">Sem dados disponíveis para Memória</p>';
                }
            } else if (currentExpandedMetric === 'uptime') {
                if (apiData.system?.uptime?.data) {
                    createExpandedChart(chartContainer, 'Uptime (segundos)', apiData.system.uptime.data, '#10b981');
                } else {
                    chartContainer.innerHTML = '<p style="color: #f0f0f0; padding: 20px;">Sem dados disponíveis para Uptime</p>';
                }
            } else if (currentExpandedMetric.startsWith('interface-')) {
                const interfaceName = currentExpandedMetric.replace('interface-', '');
                const interfaceData = apiData.interfaces?.[interfaceName];                
                if (interfaceData) { // [MODIFICADO]
                    createDualChart(chartContainer, interfaceName, interfaceData);
                } else {
                    chartContainer.innerHTML = '<p style="color: #f0f0f0; padding: 20px;">Sem dados disponíveis para esta interface</p>';
                }
            } else if (currentExpandedMetric === 'wifi-clients' || currentExpandedMetric === 'dhcp-clients' || currentExpandedMetric === 'hotspot-clients') {
                // [MODIFICADO] Busca dados em tempo real do MikroTik
                const clientType = currentExpandedMetric.replace('-clients', '');
                // chartContainer.innerHTML = '<p style="color: #f0f0f0; padding: 20px;">A buscar dados em tempo real do roteador...</p>'; // [REMOVIDO] Redundante com o loader
    
                if (!window.tempApiCredentials) {
                    chartContainer.innerHTML = `<p style="color: #ff6b6b; padding: 20px;">Erro: Credenciais de API não fornecidas.</p>`;
                    return;
                }
    
                let endpoint = '';
                if (clientType === 'wifi') endpoint = `/api/routers/${routerId}/wifi-clients`;
                else if (clientType === 'dhcp') endpoint = `/api/routers/${routerId}/dhcp-leases`;
                else if (clientType === 'hotspot') endpoint = `/api/routers/${routerId}/hotspot-active`;
    
                try {
                    const response = await apiRequest(endpoint, 'POST', window.tempApiCredentials);
                    
                    if (!response.success) throw new Error(response.message);
    
                    const clientData = response.data || [];
                    
                    if (clientData.length > 0) {
                        createClientList(chartContainer, clientData, clientType);
                    } else {
                        chartContainer.innerHTML = `<p style="color: #f0f0f0; padding: 20px;">Nenhum cliente ${clientType} ativo encontrado no roteador.</p>`;
                    }
    
                } catch (realtimeError) {
                    console.error(`Erro ao buscar dados em tempo real para ${clientType}:`, realtimeError);
                    let errorMsg = realtimeError.message;
                    if (errorMsg.includes('404')) {
                        errorMsg = "Funcionalidade não encontrada no servidor (404). Verifique se o backend foi atualizado e reiniciado.";
                    }
                    chartContainer.innerHTML = `<p style="color: #ff6b6b; padding: 20px;">Falha ao buscar dados: ${errorMsg}</p>`;
                } finally {
                    delete window.tempApiCredentials;
                }
            }

        } catch (error) {
            console.error('Erro ao atualizar gráfico:', error);
            document.getElementById('expandedChart').innerHTML = `<p style="color: #ff6b6b; padding: 20px;">Erro: ${error.message}</p>`;
        } finally {
            // [NOVO] Esconde o loader quando terminar (sucesso ou erro)
            if (window.hideChartLoader) window.hideChartLoader();
        }
    };

    /**
     * Cria um gráfico expandido
     */
    function createExpandedChart(container, title, data, color) {
        const chartDiv = document.createElement('div');
        chartDiv.id = 'expandedChartContent';
        chartDiv.style.width = '100%';
        chartDiv.style.height = '500px';
        container.appendChild(chartDiv);

        const options = {
            chart: {
                type: currentChartVisualization,
                height: 500,
                zoom: { enabled: true },
                toolbar: { show: true }
            },
            series: [{
                name: title,
                data: data
            }],
            xaxis: {
                type: 'datetime',
                labels: { 
                    style: { colors: '#a0a0a0' },
                    datetimeUTC: false 
                }
            },
            yaxis: {
                labels: { style: { colors: '#a0a0a0' } }
            },
            stroke: { curve: 'smooth', width: 2 },
            colors: [color],
            theme: { mode: 'dark' },
            dataLabels: { enabled: false },
            tooltip: {
                x: { format: 'dd MMM yyyy - HH:mm' },
                theme: 'dark'
            }
        };

        if (expandedChartInstance) {
            expandedChartInstance.destroy();
        }

        expandedChartInstance = new ApexCharts(chartDiv, options);
        expandedChartInstance.render();
    }

    /**
     * Cria um gráfico com duas séries (RX e TX)
     */
    function createDualChart(container, interfaceName, interfaceData) {
        const chartDiv = document.createElement('div');
        chartDiv.id = 'expandedChartContent';
        chartDiv.style.width = '100%';
        chartDiv.style.height = '500px';
        container.appendChild(chartDiv);

        // Preparar dados baseado no tipo selecionado
        let series = [];
        
        if (currentChartType === 'both') {
            series = [
                {
                    name: 'RX (Recebido)',
                    data: interfaceData.rx.data
                },
                {
                    name: 'TX (Enviado)',
                    data: interfaceData.tx.data
                }
            ];
        } else if (currentChartType === 'rx') {
            series = [
                {
                    name: 'RX (Recebido)',
                    data: interfaceData.rx.data
                }
            ];
        } else if (currentChartType === 'tx') {
            series = [
                {
                    name: 'TX (Enviado)',
                    data: interfaceData.tx.data
                }
            ];
        }

        const options = {
            chart: {
            type: currentChartVisualization,
            height: 500,
            zoom: { enabled: true },
            toolbar: { show: true }
            },
            series: series,
            xaxis: {
            type: 'datetime',
            labels: { 
                style: { colors: '#a0a0a0' },
                datetimeUTC: false
            }
            },
            yaxis: {
            labels: { 
                style: { colors: '#a0a0a0' },
                formatter: function(value) {
                return formatBytes(value);
                }
            }
            },
            stroke: { curve: 'smooth', width: 2 },
            colors: currentChartType === 'rx' ? ['#3b82f6'] : currentChartType === 'tx' ? ['#10b981'] : ['#3b82f6', '#10b981'],
            theme: { mode: 'dark' },
            dataLabels: { enabled: false },
            tooltip: {
            x: { format: 'dd MMM yyyy - HH:mm' },
            y: {
                formatter: function(value) {
                return formatBytes(value);
                }
            },
            theme: 'dark'
            }
        };

        if (expandedChartInstance) {
            expandedChartInstance.destroy();
        }

        expandedChartInstance = new ApexCharts(chartDiv, options);
        expandedChartInstance.render();
    }

    /**
     * [NOVO] Exporta a lista de clientes para Excel
     */
    function exportClientsToExcel(clients, type) {
        if (typeof XLSX === 'undefined') {
            alert("Biblioteca XLSX não carregada. Por favor, recarregue a página.");
            return;
        }

        let data = [];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        let filename = `clientes_${type}_${timestamp}.xlsx`;

        if (type === 'dhcp') {
            data = clients.map(c => ({
                'MAC Address': c['mac-address'] || c.mac_address || 'N/A',
                'IP Address': c.address || 'N/A',
                'Host Name': c['host-name'] || c.host_name || 'N/A',
                'Status': c.status || 'N/A',
                'Server': c.server || 'N/A'
            }));
        } else if (type === 'hotspot') {
            data = clients.map(c => ({
                'User': c.user || 'N/A',
                'MAC Address': c['mac-address'] || c.mac_address || 'N/A',
                'IP Address': c.address || 'N/A',
                'Uptime': c.uptime || 'N/A',
                'Server': c.server || 'N/A'
            }));
        } else { // wifi
            data = clients.map(c => ({
                'MAC Address': c['mac-address'] || c.mac_address || 'N/A',
                'IP Address': c.last_ip || c.address || 'N/A',
                'Uptime': c.uptime || 'N/A',
                'Interface': c.interface || 'N/A',
                'Signal': c['signal-strength'] || c.signal_strength || 'N/A'
            }));
        }

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `Clientes ${type.toUpperCase()}`);
        XLSX.writeFile(wb, filename);
    }

    /**
     * [NOVO] Exporta a lista de clientes para CSV
     */
    function exportClientsToCSV(clients, type) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        let filename = `clientes_${type}_${timestamp}.csv`;
        let headers = [];
        let rows = [];

        if (type === 'dhcp') {
            headers = ['MAC Address', 'IP Address', 'Host Name', 'Status', 'Server'];
            rows = clients.map(c => [c['mac-address'], c.address, c['host-name'], c.status, c.server]);
        } else if (type === 'hotspot') {
            headers = ['User', 'MAC Address', 'IP Address', 'Uptime', 'Server'];
            rows = clients.map(c => [c.user, c['mac-address'], c.address, c.uptime, c.server]);
        } else {
            headers = ['MAC Address', 'IP Address', 'Uptime', 'Interface', 'Signal'];
            rows = clients.map(c => [c['mac-address'], c.last_ip || c.address, c.uptime, c.interface, c['signal-strength']]);
        }

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(val => `"${val || 'N/A'}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    }

    /**
     * [NOVO] Exporta a lista de clientes para PDF
     */
    function exportClientsToPDF(clients, type) {
        if (!window.jspdf) return alert("Biblioteca PDF não carregada.");
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

        doc.text(`Relatório de Clientes ${type.toUpperCase()}`, 14, 20);
        
        // Reutiliza a lógica do Excel para gerar os dados
        // Mas precisamos de arrays de arrays para o autoTable
        // Simplificação: Chama a função de Excel modificada ou cria dados aqui.
        // Vamos criar dados simples aqui para garantir funcionamento.
        // (Implementação simplificada para brevidade, segue a mesma lógica do Excel)
        // ... (Lógica similar ao Excel mas passando para doc.autoTable)
        alert("Exportação PDF iniciada (implementação básica).");
    }

    /**
     * Cria uma lista de clientes no modal
     */
    function createClientList(container, clients, type) {
        container.innerHTML = ''; // Limpa o container

        // [NOVO] Botão de Exportação
        const actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 10px;';
        
        const createBtn = (icon, title, onClick) => {
            const btn = document.createElement('button');
            btn.className = 'btn-secondary';
            btn.style.padding = '6px 12px';
            btn.title = title;
            btn.innerHTML = `<i class="fas ${icon}"></i>`;
            btn.onclick = onClick;
            return btn;
        };

        actionsDiv.appendChild(createBtn('fa-file-excel', 'Exportar Excel', () => exportClientsToExcel(clients, type)));
        actionsDiv.appendChild(createBtn('fa-file-csv', 'Exportar CSV', () => exportClientsToCSV(clients, type)));
        // actionsDiv.appendChild(createBtn('fa-file-pdf', 'Exportar PDF', () => exportClientsToPDF(clients, type))); // PDF requer formatação de tabela específica
        
        container.appendChild(actionsDiv);

        const table = document.createElement('table');
        table.className = 'client-table';

        // [MODIFICADO] Adiciona coluna de Ações
        let headers = ['MAC Address', 'IP Address', 'Uptime', 'Ações'];
        if (type === 'dhcp') headers = ['MAC Address', 'IP Address', 'Host Name', 'Status', 'Ações'];
        if (type === 'hotspot') headers = ['User', 'MAC Address', 'IP Address', 'Uptime', 'Ações'];

        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        headers.forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });

        // Corpo da tabela
        const tbody = table.createTBody();
        clients.forEach(client => {
            const row = tbody.insertRow();
            // A ordem e os campos dependem do que a API retorna para 'details'
            const mac = client['mac-address'] || client.mac_address || 'N/A';
            const ip = client.address || 'N/A';
            const uptime = client.uptime || 'N/A';
            const host = client['host-name'] || 'N/A';
            const user = client.user || 'N/A';
            const id = client['.id']; // ID interno do MikroTik

            // Botão de Kick
            // [CORREÇÃO] Usa 'btn-delete' para ícone vermelho
            const kickBtn = `<button class="btn-delete" onclick="handleKickClient('${type}', '${id}', '${mac}')" title="Desconectar"><i class="fas fa-power-off"></i></button>`;

            // [CORREÇÃO] Adiciona a classe 'action-buttons' à célula da tabela para estilizar o botão corretamente
            if (type === 'dhcp') row.innerHTML = `<td>${mac}</td><td>${ip}</td><td>${host}</td><td>${client.status || 'N/A'}</td><td class="action-buttons">${kickBtn}</td>`;
            else if (type === 'hotspot') row.innerHTML = `<td>${user}</td><td>${mac}</td><td>${ip}</td><td>${uptime}</td><td class="action-buttons">${kickBtn}</td>`;
            else row.innerHTML = `<td>${mac}</td><td>${ip}</td><td>${uptime}</td><td class="action-buttons">${kickBtn}</td>`;
        });

        container.appendChild(table);
    }

    /**
     * [NOVO] Lida com a ação de desconectar (Kick)
     */
    window.handleKickClient = async (type, clientId, mac) => {
        if (!confirm(`Tem a certeza que deseja desconectar o cliente ${mac}?`)) return;

        // Usa credenciais temporárias se disponíveis, senão pede
        let credentials = window.tempApiCredentials;
        if (!credentials) {
            credentials = await showCredentialPrompt("Confirmar Desconexão");
            if (!credentials) return;
        }

        try {
            const response = await apiRequest(`/api/routers/${routerId}/kick-client`, 'POST', {
                ...credentials,
                type,
                clientId
            });
            if (response.success) {
                alert('Cliente desconectado com sucesso.');
                // Atualiza a lista
                expandMetric(`${type}-clients`);
            } else {
                alert('Erro: ' + response.message);
            }
        } catch (error) {
            alert('Erro ao desconectar: ' + error.message);
        }
    };

    /**
     * [NOVO] Abre o Modal de Gestão Avançada
     */
    window.openManagementModal = () => {
        // [MODIFICADO] Abre diretamente sem pedir senha inicial
        const rName = (metricsData && metricsData.routerName) ? metricsData.routerName : 'Roteador';
        const safeRName = rName.replace(/'/g, "\\'"); // [CORREÇÃO] Escapa aspas simples para evitar erros no onclick

        const modalId = 'managementModal';
        document.getElementById(modalId)?.remove();

        const modalHtml = `
            <div id="${modalId}" class="modal-overlay hidden" style="z-index: 9999;">
                <div class="modal-content large" style="max-width: 800px; padding: 0; display: flex; flex-direction: column; max-height: 90vh; overflow: hidden;">
                    
                    <!-- Header Integrado com Abas -->
                    <div class="modal-header" style="display: flex; justify-content: space-between; align-items: flex-start; background: var(--background-dark); padding: 20px 25px 0 25px; margin: 0; border-bottom: 1px solid var(--border-color);">
                        <div style="flex: 1;">
                            <h3 style="margin: 0 0 15px 0; color: var(--text-primary); font-size: 1.25rem;"><i class="fas fa-tools" style="margin-right: 8px; color: var(--primary-color);"></i>Gestão Avançada - ${rName}</h3>
                            <div class="tab-nav" style="border-bottom: none; display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: -1px;">
                                <button class="tab-link active" onclick="switchMgmtTab(event, 'diag')" style="padding: 10px 15px; background: var(--background-medium); border: 1px solid var(--border-color); border-bottom: 1px solid var(--background-medium); border-radius: 6px 6px 0 0; color: var(--primary-color); font-weight: bold; cursor: pointer;">Diagnóstico</button>
                                <button class="tab-link" onclick="switchMgmtTab(event, 'wifi')" style="padding: 10px 15px; background: transparent; border: 1px solid transparent; border-bottom: none; border-radius: 6px 6px 0 0; color: var(--text-secondary); cursor: pointer;">Wi-Fi</button>
                                <button class="tab-link" onclick="switchMgmtTab(event, 'health')" style="padding: 10px 15px; background: transparent; border: 1px solid transparent; border-bottom: none; border-radius: 6px 6px 0 0; color: var(--text-secondary); cursor: pointer;">Hardware</button>
                                <button class="tab-link" onclick="switchMgmtTab(event, 'backup')" style="padding: 10px 15px; background: transparent; border: 1px solid transparent; border-bottom: none; border-radius: 6px 6px 0 0; color: var(--text-secondary); cursor: pointer;">Backup</button>
                                <button class="tab-link" onclick="switchMgmtTab(event, 'system')" style="padding: 10px 15px; background: transparent; border: 1px solid transparent; border-bottom: none; border-radius: 6px 6px 0 0; color: var(--text-secondary); cursor: pointer;">Sistema</button>
                            </div>
                        </div>
                        <button class="modal-close-btn" style="background: none; border: none; color: var(--text-secondary); font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
                    </div>
                    
                    <!-- Container Scrollável para o Conteúdo -->
                    <div class="mgmt-tabs-container" style="flex: 1; overflow-y: auto; padding: 25px; background: var(--background-medium);">
                        
                        <!-- Aba Diagnóstico -->
                        <div id="tab-diag" class="mgmt-tab-content" style="display: block;">
                            <h4 style="color: var(--text-primary); margin-bottom: 10px;">Ferramenta de Ping</h4>
                            <div class="input-group" style="display:flex; gap:10px; align-items:center; margin-bottom: 15px; max-width: 100%;">
                                <input type="text" id="pingTarget" placeholder="IP ou Domínio (ex: 8.8.8.8)" style="flex:1; max-width: none; margin: 0;">
                                <button class="btn-primary" onclick="runPing()" style="width: auto; margin: 0;"><i class="fas fa-play"></i> Executar</button>
                            </div>
                            <pre id="pingResult" style="background: var(--background-dark); padding:15px; border-radius:6px; min-height:150px; color:#10b981; font-family:monospace; margin-top:10px; border: 1px solid var(--border-color); overflow: auto;"></pre>
                        </div>

                        <!-- Aba Wi-Fi -->
                        <div id="tab-wifi" class="mgmt-tab-content hidden" style="display: none;">
                            <h4 style="color: var(--text-primary); margin-bottom: 10px;">Configuração de Redes Sem Fio</h4>
                            <div style="margin-bottom: 15px;"><button class="btn-secondary" onclick="listWifiInterfaces()" style="width: auto;"><i class="fas fa-sync-alt"></i> Carregar Interfaces Wi-Fi</button></div>
                            <div id="wifiList" style="margin-top:15px; display:flex; flex-direction:column; gap:10px;">
                                <p style="color: var(--text-secondary); text-align:center; padding: 20px;">Clique no botão acima para listar as redes e alterar o SSID.</p>
                            </div>
                        </div>

                        <!-- Aba Hardware -->
                        <div id="tab-health" class="mgmt-tab-content hidden" style="display: none;">
                            <div style="margin-bottom: 15px;"><button class="btn-secondary" onclick="checkHealth()" style="width: auto;"><i class="fas fa-sync-alt"></i> Atualizar Leitura</button></div>
                            <div id="healthResult" style="margin-top:15px; display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:15px;">
                                <p style="color: var(--text-secondary);">Carregando...</p>
                            </div>
                        </div>

                        <!-- Aba Backup -->
                        <div id="tab-backup" class="mgmt-tab-content hidden" style="display: none;">
                            <div class="input-group" style="display:flex; gap:10px; margin-bottom:20px; align-items:center; max-width: 100%;">
                                <input type="text" id="backupName" placeholder="Nome do Backup (opcional)" style="flex:1; max-width: none; margin: 0;">
                                <button class="btn-primary" onclick="createBackup()" style="width: auto; margin: 0;"><i class="fas fa-save"></i> Criar Backup</button>
                            </div>
                            <div id="backupList" class="table-container" style="max-height: 300px;"></div>
                        </div>

                        <!-- Aba Sistema -->
                        <div id="tab-system" class="mgmt-tab-content hidden" style="display: none;">
                            <h4 style="color: var(--text-primary); margin-bottom: 15px;">Ações do Sistema</h4>
                            <div class="form-actions" style="justify-content: flex-start; border-top:none; padding-top:0; flex-direction: column; align-items: flex-start; gap: 15px;">
                                <button class="btn-secondary" style="width: auto;" onclick="window.handleRebootRouter('${routerId}', '${safeRName}')"><i class="fas fa-power-off"></i> Reiniciar Roteador</button>
                                
                                <div style="width: 100%; height: 1px; background: var(--border-color); margin: 10px 0;"></div>
                                <h5 style="color: #ef4444; margin: 0;">Zona de Perigo</h5>
                                <button class="btn-danger" style="width: auto; background-color: #dc2626; color: white;" title="CUIDADO EXTREMO: Esta ação apagará todas as configurações e isolará o roteador da rede!" onclick="window.handleResetConfig('${routerId}')"><i class="fas fa-exclamation-triangle"></i> Resetar Configuração (Factory Reset)</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modal = document.getElementById(modalId);
        
        if (!modal) return;

        modal.querySelector('.modal-close-btn').onclick = () => {
            modal.remove();
            window.tempApiCredentials = null; // [SEGURANÇA] Limpa credenciais ao fechar
        };
        
        // [CORREÇÃO] Usa requestAnimationFrame para garantir que a classe é removida no próximo ciclo de pintura
        // Isso é mais fiável que setTimeout para transições CSS
        requestAnimationFrame(() => {
            modal.classList.remove('hidden');
            // [CORREÇÃO FORÇADA] Define estilos inline para garantir visibilidade, ignorando problemas de CSS/Cache
            modal.style.opacity = '1';
            modal.style.visibility = 'visible';
        });

        // Funções internas do modal
        window.switchMgmtTab = (event, tab) => {
            const modalContainer = document.getElementById('managementModal');
            if (!modalContainer) return;
            
            // [CORREÇÃO] Força a ocultação com display: none para garantir a troca isolada
            modalContainer.querySelectorAll('.mgmt-tab-content').forEach(el => {
                el.classList.add('hidden');
                el.style.display = 'none';
            });
            
            // Mostra apenas o conteúdo da aba clicada
            const targetContent = modalContainer.querySelector(`#tab-${tab}`);
            if (targetContent) {
                targetContent.classList.remove('hidden');
                targetContent.style.display = 'block';
            }

            // Remove os estilos de ativo das outras abas
            modalContainer.querySelectorAll('.tab-link').forEach(el => {
                el.classList.remove('active');
                el.style.color = 'var(--text-secondary)';
                el.style.background = 'transparent';
                el.style.borderColor = 'transparent';
                el.style.borderBottomColor = 'transparent';
            });
            
            // Adiciona o estilo de ativo na aba clicada
            const btn = event.currentTarget;
            if (btn) {
                btn.classList.add('active'); 
                btn.style.color = 'var(--primary-color)';
                btn.style.background = 'var(--background-medium)';
                btn.style.border = '1px solid var(--border-color)';
                btn.style.borderBottom = '1px solid var(--background-medium)';
                btn.style.fontWeight = 'bold';
            }
            
            if (tab === 'health') checkHealth();
            if (tab === 'backup') listBackups();
            if (tab === 'wifi') listWifiInterfaces(); // Carrega automaticamente se já autenticado
        };

        // [NOVO] Helper para garantir autenticação antes de ações
        const ensureAuth = async (actionName) => {
            if (window.tempApiCredentials) return true;
            const creds = await showCredentialPrompt(actionName);
            if (creds) {
                window.tempApiCredentials = creds;
                return true;
            }
            return false;
        };

        window.runPing = async () => {
            if (!await ensureAuth("Autenticação para Ping")) return;
            const target = document.getElementById('pingTarget').value;
            // [NOVO] Validação no frontend para evitar requisição inútil e o erro 'missing =address='
            if (!target || target.trim() === '') {
                const out = document.getElementById('pingResult');
                out.textContent = 'Por favor, insira um IP ou domínio para executar o ping.';
                out.style.color = '#f59e0b'; // Cor de aviso
                return;
            }
            const out = document.getElementById('pingResult');
            out.textContent = 'Executando ping...';
            out.style.color = '#e5e7eb'; // Cor de texto padrão
            try {
                const res = await apiRequest(`/api/routers/${routerId}/diagnostics`, 'POST', { ...window.tempApiCredentials, tool: 'ping', target });
                if (res.success) {
                    // [MODIFICADO] Lógica de formatação restaurada para exibir todos os detalhes
                    out.textContent = res.data.map(p => {
                        // Objeto de resumo final (contém 'packet-loss')
                        if (p['packet-loss']) { 
                            return `\n--- Estatísticas ---\nEnviados: ${p.sent}, Recebidos: ${p.received}, Perda: ${p['packet-loss']}\nMin/Avg/Max RTT: ${p['min-rtt'] || 'N/A'}/${p['avg-rtt'] || 'N/A'}/${p['max-rtt'] || 'N/A'}`;
                        }
                        // Linhas de resposta individuais
                        const parts = [];
                        if (p.seq !== undefined) parts.push(`Seq: ${p.seq}`);
                        if (p.host) parts.push(`Host: ${p.host}`);
                        if (p.size) parts.push(`Size: ${p.size}`);
                        if (p.ttl) parts.push(`TTL: ${p.ttl}`);
                        if (p.time) parts.push(`Time: ${p.time}`);
                        if (p.status && p.status !== 'timeout') parts.push(`Status: ${p.status}`); // Só mostra status se for relevante
                        return parts.join(', ');
                    }).join('\n');
                    out.style.color = '#10b981'; // Verde para sucesso
                } else {
                    out.textContent = 'Erro: ' + res.message;
                    out.style.color = '#ef4444'; // Vermelho para erro
                }
            } catch (e) { 
                out.textContent = 'Erro: ' + e.message; 
                out.style.color = '#ef4444'; // Vermelho para erro
            }
        };

        // [NOVO] Listar e Editar Wi-Fi
        window.listWifiInterfaces = async () => {
            if (!await ensureAuth("Gestão de Wi-Fi")) return;
            const div = document.getElementById('wifiList');
            div.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> A carregar interfaces sem fio...</div>';
            try {
                const res = await apiRequest(`/api/routers/${routerId}/wifi-config`, 'POST', { ...window.tempApiCredentials, action: 'list' });
                if (res.success && res.data.length > 0) {
                    div.innerHTML = res.data.map(iface => {
                        const safeId = String(iface.id).replace(/[^a-zA-Z0-9]/g, ''); // Remove asteriscos do ID para usar no HTML
                        return `
                        <div style="background: var(--background-dark); padding: 15px; border-radius: 6px; border: 1px solid var(--border-color); display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                            <div style="flex: 1; min-width: 150px;">
                                <strong style="color: var(--text-primary); font-size: 1.1em;"><i class="fas fa-wifi" style="color: var(--primary-color); margin-right:5px;"></i> ${iface.name}</strong> 
                                <br><small style="color: var(--text-secondary);">Driver: ${iface.type}</small>
                            </div>
                            <div style="flex: 2; display: flex; gap: 10px; min-width: 250px;">
                                <input type="text" id="ssid_input_${safeId}" value="${iface.ssid}" placeholder="Nome da Rede (SSID)" style="flex: 1; padding: 8px 12px; background: var(--background-medium); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 4px; font-weight: bold; margin: 0; max-width: none;">
                                <button class="btn-primary" onclick="changeSsid('${iface.id}', 'ssid_input_${safeId}')" title="Aplicar Novo SSID" style="width: auto; margin: 0;"><i class="fas fa-save"></i> Salvar</button>
                            </div>
                        </div>
                    `}).join('');
                } else {
                    div.innerHTML = '<p style="text-align:center; padding:20px; color:#f59e0b;"><i class="fas fa-exclamation-circle"></i> Nenhuma interface Wi-Fi encontrada neste roteador.</p>';
                }
            } catch (e) { div.innerHTML = '<p style="color:#ef4444; text-align:center;">Erro: ' + e.message + '</p>'; }
        };

        window.changeSsid = async (interfaceId, inputId) => {
            if (!await ensureAuth("Alterar SSID")) return;
            const newSsid = document.getElementById(inputId).value.trim();
            if (!newSsid) return alert('O SSID não pode estar vazio.');
            
            try {
                const res = await apiRequest(`/api/routers/${routerId}/wifi-config`, 'POST', { 
                    ...window.tempApiCredentials, action: 'set_ssid', interfaceId, ssid: newSsid 
                });
                alert(res.message);
            } catch (e) { alert('Erro: ' + e.message); }
        };

        window.checkHealth = async () => {
            if (!await ensureAuth("Ler Sensores de Hardware")) return;
            const div = document.getElementById('healthResult');
            div.innerHTML = '<p>A ler sensores...</p>';
            try {
                const res = await apiRequest(`/api/routers/${routerId}/hardware-health`, 'POST', window.tempApiCredentials);
                if (res.success && Array.isArray(res.data) && res.data.length > 0) {
                    // [MODIFICADO] Normalização de dados para suportar diferentes formatos de resposta do MikroTik
                    let healthData = {};
                    
                    // Verifica se é o formato novo (lista de objetos com name/value)
                    // Ex: [{name: 'cpu-temperature', value: 60, type: 'C'}]
                    const isNewFormat = res.data.some(item => item.name && item.value !== undefined);
                    
                    if (isNewFormat) {
                        res.data.forEach(item => {
                            if (item.name) {
                                healthData[item.name] = item.value;
                            }
                        });
                    } else {
                        // Assume formato antigo (objeto único com propriedades)
                        // Ex: [{voltage: 24, temperature: 30}]
                        healthData = res.data[0];
                    }

                    let healthHTML = '';
                    let hasData = false;

                    // Verifica se há dados de voltagem
                    if (healthData.voltage) {
                        let voltageDisplay = healthData.voltage;
                        if (!String(voltageDisplay).toLowerCase().includes('v')) voltageDisplay += 'V';
                        healthHTML += `
                            <div class="stat-card" style="background: var(--background-dark); padding:20px; text-align:center; border-radius: 8px; border: 1px solid var(--border-color); flex-direction: column; justify-content: center;">
                                <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 5px;">Voltagem</h3>
                                <p style="font-size:1.8rem; color: var(--primary-color); font-weight: bold; margin: 0;">${voltageDisplay}</p>
                            </div>
                        `;
                        hasData = true;
                    }

                    // Verifica se há dados de temperatura (procura por 'temperature' ou 'cpu-temperature')
                    const tempValue = healthData.temperature || healthData['cpu-temperature'];
                    if (tempValue) {
                        let tempDisplay = tempValue;
                        if (!String(tempDisplay).includes('C')) tempDisplay += '°C';
                        healthHTML += `
                            <div class="stat-card" style="background: var(--background-dark); padding:20px; text-align:center; border-radius: 8px; border: 1px solid var(--border-color); flex-direction: column; justify-content: center;">
                                <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 5px;">Temperatura</h3>
                                <p style="font-size:1.8rem; color: #e48315; font-weight: bold; margin: 0;">${tempDisplay}</p>
                            </div>
                        `;
                        hasData = true;
                    }

                    // Renderiza o HTML se algum dado foi encontrado
                    div.innerHTML = hasData ? healthHTML : '<p>Sem dados de sensores de voltagem ou temperatura disponíveis para este modelo.</p>';

                } else {
                    div.innerHTML = '<p>Sem dados de sensores disponíveis para este modelo.</p>';
                }
            } catch (e) { div.innerHTML = '<p style="color:red">Erro ao ler sensores.</p>'; }
        };

        window.listBackups = async () => {
            if (!await ensureAuth("Listar Backups")) return;
            const div = document.getElementById('backupList');
            div.innerHTML = 'Carregando...';
            try {
                const res = await apiRequest(`/api/routers/${routerId}/backups`, 'POST', { ...window.tempApiCredentials, action: 'list' });
                if (res.success && res.data.length > 0) {
                    div.innerHTML = '<table class="client-table" style="width: 100%; border-collapse: collapse;"><thead><tr style="text-align: left; border-bottom: 1px solid var(--border-color);"><th>Nome</th><th>Tamanho</th><th>Data</th><th style="text-align: right;">Ações</th></tr></thead><tbody>' + 
                    res.data.map(f => `
                        <tr style="border-bottom: 1px solid var(--border-color);">
                            <td style="padding: 10px 5px;">${f.name}</td>
                            <td style="padding: 10px 5px;">${f.size ? (f.size / 1024).toFixed(1) + ' KB' : 'N/A'}</td>
                            <td style="padding: 10px 5px;">${f['creation-time'] || f['last-modified'] || 'N/A'}</td>
                            <td class="action-buttons" style="padding: 10px 5px; display: flex; justify-content: flex-end; gap: 5px;">
                                <button class="btn-primary" style="width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center;" onclick="restoreBackup('${f.name.replace(/'/g, "\\'")}')" title="Restaurar"><i class="fas fa-undo"></i></button>
                                <button class="btn-delete" style="width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center;" onclick="deleteBackup('${String(f['.id'] || f.name).replace(/'/g, "\\'")}')" title="Excluir"><i class="fas fa-trash-alt"></i></button>
                            </td>
                        </tr>
                    `).join('') + '</tbody></table>';
                } else {
                    div.innerHTML = '<p>Nenhum backup encontrado no roteador.</p>';
                }
            } catch (e) { div.innerHTML = 'Erro: ' + e.message; }
        };

        window.createBackup = async () => {
            if (!await ensureAuth("Criar Backup")) return;
            const name = document.getElementById('backupName').value;
            try {
                const res = await apiRequest(`/api/routers/${routerId}/backups`, 'POST', { ...window.tempApiCredentials, action: 'create', fileName: name });
                alert(res.message);
                listBackups();
            } catch (e) { alert('Erro: ' + e.message); }
        };

        window.restoreBackup = async (name) => {
            if(!confirm(`ATENÇÃO: Restaurar o backup "${name}" irá reiniciar o roteador e sobrescrever as configurações atuais. Continuar?`)) return;
            if (!await ensureAuth("Restaurar Backup")) return;
            try {
                const res = await apiRequest(`/api/routers/${routerId}/backups`, 'POST', { ...window.tempApiCredentials, action: 'restore', fileName: name });
                alert(res.message);
            } catch (e) { alert('Erro: ' + e.message); }
        };

        window.deleteBackup = async (id) => {
            if (!id || id === 'undefined') {
                alert('Erro: ID do backup inválido ou não encontrado.');
                return;
            }
            if(!confirm('Excluir este backup?')) return;
            if (!await ensureAuth("Excluir Backup")) return;
            try {
                await apiRequest(`/api/routers/${routerId}/backups`, 'POST', { ...window.tempApiCredentials, action: 'delete', fileName: id });
                listBackups();
            } catch (e) { alert('Erro: ' + e.message); }
        };

        // [NOVO] Função de Reset
        window.handleResetConfig = async (id) => {
            // Fallback de segurança caso a função showConfirmationModal não esteja carregada
            const confirmFunc = typeof showConfirmationModal === 'function' 
                ? async () => await showConfirmationModal('ATENÇÃO EXTREMA: Esta ação irá APAGAR TODAS AS CONFIGURAÇÕES do roteador, incluindo regras de rede, Hotspot e comunicação com o painel. O roteador ficará isolado com configurações de fábrica.\n\nDeseja REALMENTE prosseguir?', 'PERIGO: Reset de Fábrica')
                : async () => confirm('ATENÇÃO EXTREMA: Esta ação apaga TUDO. Deseja prosseguir?');

            const confirmed = await confirmFunc();
            if (!confirmed) return;

            if (!await ensureAuth("Reset de Fábrica")) return;

            try {
                const res = await apiRequest(`/api/routers/${id}/reset-config`, 'POST', window.tempApiCredentials);
                alert(res.message);
            } catch (e) { alert('Erro fatal: ' + e.message); }
        };
    };

    /**
     * NOVO: Cria um gráfico de barras para a análise de clientes Wi-Fi
     */
    function createWifiBarChart(container, title, analyticsData) {
        container.innerHTML = ''; // Limpa o container
        const chartDiv = document.createElement('div');
        chartDiv.id = 'expandedChartContent';
        chartDiv.style.width = '100%';
        chartDiv.style.height = '500px';
        container.appendChild(chartDiv);

        const seriesData = [
            analyticsData.last_1h,
            analyticsData.last_7d,
            analyticsData.last_30d
        ];
        const labels = ['Última 1h', 'Últimos 7d', 'Últimos 30d'];

        const options = {
            chart: {
                type: 'bar',
                height: 500,
                toolbar: { show: true }
            },
            series: [{
                name: 'Clientes Únicos',
                data: seriesData
            }],
            plotOptions: {
                bar: {
                    distributed: true, // Cores diferentes por barra
                    horizontal: false,
                }
            },
            xaxis: {
                categories: labels,
                labels: { style: { colors: '#a0a0a0' } }
            },
            yaxis: {
                labels: { style: { colors: '#a0a0a0' } }
            },
            colors: ['#3b82f6', '#10b981', '#e48315'],
            theme: { mode: 'dark' },
            legend: { show: false }, // Não precisa de legenda para uma única série
            tooltip: { theme: 'dark' }
        };

        if (expandedChartInstance) expandedChartInstance.destroy();
        expandedChartInstance = new ApexCharts(chartDiv, options);
        expandedChartInstance.render();
    }

    /**
     * NOVO: Cria um gráfico de pizza para a análise de clientes Wi-Fi
     */
    function createGenericDistributionChart(container, title, analyticsData) {
        container.innerHTML = ''; // Limpa o container
        const chartDiv = document.createElement('div');
        chartDiv.id = 'expandedChartContent';
        chartDiv.style.width = '100%';
        chartDiv.style.height = '500px';
        container.appendChild(chartDiv);
        
        // [CORREÇÃO] Simplificado para ser sempre um gráfico de pizza, que é o ideal para distribuição.
        // A complexidade de tentar mudar o tipo de gráfico estava a causar o erro "Cannot read properties of null (reading 'hidden')".
        const options = {
            chart: {
                type: 'pie', // Força o tipo para 'pie'
                height: 500,
                toolbar: { show: true }
            },
            series: analyticsData.distribution.series,
            labels: analyticsData.distribution.labels,
            colors: ['#3b82f6', '#10b981', '#e48315', '#f59e0b', '#ec4899'], // Mais cores
            theme: { mode: 'dark' },
            legend: {
                position: 'bottom',
                labels: {
                    colors: '#a0a0a0'
                }
            },
            tooltip: {
                y: {
                    formatter: function (val) {
                        return val + " clientes"
                    }
                },
                theme: 'dark'
            },
            responsive: [{
                breakpoint: 480,
                options: {
                    chart: {
                        width: 200
                    },
                    legend: {
                        position: 'bottom'
                    }
                }
            }]
        };

        if (expandedChartInstance) {
            expandedChartInstance.destroy();
        }

        expandedChartInstance = new ApexCharts(chartDiv, options);
        expandedChartInstance.render();

        // Mostra os filtros de visualização para este tipo de gráfico
        // [CORREÇÃO] Esconde os filtros de visualização, já que o gráfico agora é sempre de pizza.
        document.getElementById('chartVisualizationFilters').style.display = 'none';
    }

    /**
     * NOVO: Cria um gráfico de barras para a análise de clientes Hotspot
     */
    function createHotspotBarChart(container, title, analyticsData) {
        container.innerHTML = ''; // Limpa o container
        const chartDiv = document.createElement('div');
        chartDiv.id = 'expandedChartContent';
        chartDiv.style.width = '100%';
        chartDiv.style.height = '500px';
        container.appendChild(chartDiv);

        const seriesData = [
            analyticsData.last_1h,
            analyticsData.last_24h,
            analyticsData.last_7d,
            analyticsData.last_15d,
            analyticsData.last_30d
        ];
        const labels = ['Última 1h', 'Últimas 24h', 'Últimos 7d', 'Últimos 15d', 'Últimos 30d'];

        const options = {
            chart: {
                type: 'bar',
                height: 500,
                toolbar: { show: true }
            },
            series: [{
                name: 'Clientes Únicos',
                data: seriesData
            }],
            plotOptions: {
                bar: {
                    distributed: true, // Cores diferentes por barra
                    horizontal: false,
                }
            },
            xaxis: {
                categories: labels,
                labels: { style: { colors: '#a0a0a0' } }
            },
            yaxis: {
                labels: { style: { colors: '#a0a0a0' } }
            },
            colors: ['#3b82f6', '#10b981', '#e48315', '#9333ea', '#f59e0b'],
            theme: { mode: 'dark' },
            legend: { show: false }, // Não precisa de legenda para uma única série
            tooltip: { theme: 'dark' }
        };

        if (expandedChartInstance) expandedChartInstance.destroy();
        expandedChartInstance = new ApexCharts(chartDiv, options);
        expandedChartInstance.render();
    }

    /**
     * Fecha o gráfico expandido
     */
    window.closeExpandedChart = function() {
        const modal = document.getElementById('expandedModal');
        modal.classList.add('hidden');
        if (expandedChartInstance) {
            expandedChartInstance.destroy();
            expandedChartInstance = null;
        }
    };

    /**
     * [REMOVIDO] As funções `togglePeriodSelector` e `setupPeriodSelectors` foram removidas.
     * A interação de filtro de período foi centralizada no modal principal, que é aberto
     * ao clicar no ícone de engrenagem ou no botão "Ver Gráfico"/"Análise".
     */

    /**
     * Configura os event listeners
     */
    function setupEventListeners() {
        // Fechar modal ao clicar fora
        // [CORREÇÃO] Verifica se o elemento existe antes de adicionar listener para evitar crash
        const expandedModal = document.getElementById('expandedModal');
        if (expandedModal) {
            expandedModal.addEventListener('click', (e) => {
                if (e.target.id === 'expandedModal') {
                    closeExpandedChart();
                }
            });
        }

        // [NOVO] Listener para o botão de toggle de live update
        if (liveUpdateToggle) {
            liveUpdateToggle.addEventListener('change', () => {
                if (liveUpdateToggle.checked) {
                    startLiveUpdates();
                } else {
                    stopLiveUpdates();
                }
            });
        }
    }

    /**
     * Mostra estado de erro
     */
    function showErrorState(message) {
        document.getElementById('routerNameTitle').textContent = 'Erro ao carregar dados';
        console.error(message);
    }
};

// [NOVO] Executa a inicialização imediatamente se o DOM já estiver pronto (SPA), caso contrário espera o evento.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRouterDashboard);
} else {
    initRouterDashboard();
}
