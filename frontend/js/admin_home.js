// Ficheiro: js/admin_home.js
if (window.initHomePage) {
    console.warn("Tentativa de carregar admin_home.js múltiplas vezes.");
} else {
    window.initHomePage = async () => {
        
        // Função para buscar e preencher os dados de um card específico
        const fetchCardData = async (endpoint, totalId, activeId = null, inactiveId = null) => {
            try {
                const response = await apiRequest(endpoint);
                // [CORRIGIDO] Algumas rotas da API retornam o array diretamente, outras dentro de um objeto { data: [...] }.
                // Esta linha lida com ambos os casos de forma robusta.
                const data = response.data || response;
                
                if (document.getElementById(totalId)) {
                    document.getElementById(totalId).textContent = data.length;
                }

                if (activeId) {
                    const activeCount = data.filter(item => item.is_active).length;
                    const activeElement = document.getElementById(activeId);
                    if (activeElement) activeElement.textContent = activeCount;
                }

                if (inactiveId) {
                    const inactiveCount = data.filter(item => !item.is_active).length;
                    const inactiveElement = document.getElementById(inactiveId);
                    if (inactiveElement) {
                        inactiveElement.textContent = inactiveCount;
                    }
                }

            } catch (error) {
                console.error(`Erro ao carregar dados para ${totalId}:`, error);
                if (document.getElementById(totalId)) {
                    document.getElementById(totalId).textContent = 'Erro';
                }
            }
        };

        // Função para buscar dados de utilizadores do hotspot
        const fetchHotspotUsers = async () => {
            try {
                const response = await apiRequest('/api/hotspot/total-users');
                // [CORRIGIDO] A API pode retornar o objeto de estatísticas diretamente ou dentro de 'data'.
                // Esta abordagem lida com ambos os casos.
                const stats = response.data || response;
                // [CORRIGIDO] Usa os IDs corretos do HTML e preenche ambos os campos
                const totalElement = document.getElementById('usersTotal');
                const last30DaysElement = document.getElementById('usersLast30Days');

                if (totalElement) totalElement.textContent = stats.total;
                if (last30DaysElement) last30DaysElement.textContent = stats.last30days;

            } catch (error) {
                console.error("Erro ao carregar total de utilizadores do hotspot:", error);
                // [CORRIGIDO] Atualiza o elemento correto em caso de erro
                const totalElement = document.getElementById('usersTotal');
                if (totalElement) totalElement.textContent = 'Erro';
                const last30DaysElement = document.getElementById('usersLast30Days');
                if (last30DaysElement) last30DaysElement.textContent = 'Erro';
            }
        };

        // Inicia o carregamento de todos os dados em paralelo
        fetchCardData('/api/campaigns', 'campaignsTotal', 'campaignsActive', 'campaignsInactive');
        fetchCardData('/api/banners', 'bannersTotal', 'bannersActive', 'bannersInactive');
        fetchCardData('/api/templates', 'templatesTotal');
        fetchHotspotUsers();

        // [NOVO] Integração do Dashboard Analítico
        // Verifica se o utilizador tem permissão para ver dados analíticos
        if (window.currentUserProfile && (window.currentUserProfile.role === 'master' || window.currentUserProfile.permissions['analytics.read'])) {
            try {
                
                // Busca o HTML da página analítica
                const response = await fetch('/pages/analytics_dashboard.html');
                if (response.ok) {
                    const html = await response.text();
                    
                    // Cria um container para o conteúdo analítico
                    const container = document.createElement('div');
                    container.innerHTML = html;
                    
                    // Adiciona um título separador
                    const separator = document.createElement('div');
                    separator.className = 'section-header';
                    separator.style.marginTop = '40px';
                    separator.innerHTML = '<h3>Análise Detalhada</h3>';
                    
                    const contentArea = document.querySelector('.content-area');
                    if (contentArea) {
                        contentArea.appendChild(separator);
                        // Move o conteúdo do container para a área principal
                        while (container.firstChild) {
                            contentArea.appendChild(container.firstChild);
                        }
                        
                        // Inicializa o script do analítico (que já está carregado no admin_dashboard.html)
                        if (window.initAnalyticsDashboard) {
                            window.initAnalyticsDashboard();
                        } else {
                            console.error("Função initAnalyticsDashboard não encontrada.");
                        }
                    }
                }
            } catch (e) {
                console.error("Erro ao carregar analytics_dashboard.html:", e);
            }
        }
    };
}
