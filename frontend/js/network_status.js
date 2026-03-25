// Ficheiro: frontend/js/network_status.js

if (window.initNetworkStatusPage) {
    console.warn("Tentativa de carregar network_status.js múltiplas vezes.");
} else {
    window.initNetworkStatusPage = () => {

    // [NOVO] Fallback para o preloader se a página for aberta diretamente (standalone)
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
                <p id="${preloaderId}-text" style="margin-top: 1rem; font-size: 1.1rem;">A carregar status da rede...</p>
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

    const tableBody = document.getElementById('router-status-table-body');

    // Função para formatar segundos em um formato legível (dias, horas, minutos)
    function formatUptime(totalSeconds) {
        if (totalSeconds === null || totalSeconds === 0) {
            return 'N/A';
        }
        const days = Math.floor(totalSeconds / 86400);
        totalSeconds %= 86400;
        const hours = Math.floor(totalSeconds / 3600);
        totalSeconds %= 3600;
        const minutes = Math.floor(totalSeconds / 60);

        let uptimeString = '';
        if (days > 0) uptimeString += `${days}d `;
        if (hours > 0) uptimeString += `${hours}h `;
        if (minutes > 0) uptimeString += `${minutes}m`;

        return uptimeString.trim() || 'Menos de 1m';
    }

    // Função principal para buscar e renderizar os dados
    async function fetchAndRenderRouterStatus() {
        window.showPagePreloader('A atualizar status da rede...');
        try {
            // CORREÇÃO: Usa a função global 'apiRequest' que já trata da URL da API e da autenticação.
            const response = await apiRequest('/api/monitoring/router-status');

            if (!response.success) {
                throw new Error(response.message || 'Falha ao carregar dados da API.');
            }

            const routers = response; // [CORRIGIDO] A API retorna o array diretamente
            tableBody.innerHTML = ''; // Limpa a mensagem "A carregar dados..."

            if (routers.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum roteador encontrado.</td></tr>';
                return;
            }

            routers.forEach(router => {
                const isOnline = router.status === 'Online';
                const statusIcon = isOnline 
                    ? '<i class="fas fa-check-circle status-icon online"></i>'
                    : '<i class="fas fa-times-circle status-icon offline"></i>';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${statusIcon} ${router.status}</td>
                    <td>${router.name}</td>
                    <td>${router.ip}</td>
                    <td>${isOnline ? formatUptime(router.uptime_seconds) : 'N/A'}</td>
                    <td>${isOnline ? `${router.cpu_load}%` : 'N/A'}</td>
                    <td class="actions-cell">
                        <a href="/routers/edit/${router.id}" title="Editar Roteador"><i class="fas fa-edit"></i></a>
                        <a href="/pages/router_analytics.html#${router.id}" target="_blank" title="Análise Detalhada"><i class="fas fa-chart-line"></i></a>
                        <!-- Adicione o seu botão de apagar aqui, se necessário -->
                    </td>
                `;
                tableBody.appendChild(row);
            });

        } catch (error) {
            console.error('Falha ao buscar status dos roteadores:', error);
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red;">Falha ao carregar dados. Verifique a consola.</td></tr>`;
        } finally {
            window.hidePagePreloader();
        }
    }

    // Chama a função para carregar os dados quando a página estiver pronta
    fetchAndRenderRouterStatus();
    };
}
