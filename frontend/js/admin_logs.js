// Ficheiro: frontend/js/admin_logs.js

// [REFEITO] O script agora se auto-inicializa para evitar problemas de timing.

// Adiciona uma "guarda" para prevenir que o script seja executado mais de uma vez durante a mesma visualização de página.
if (document.body.dataset.logsPageInitialized) {
    console.warn("Tentativa de inicializar admin_logs.js múltiplas vezes. Execução ignorada.");
} else {
    document.body.dataset.logsPageInitialized = "true";

    // --- O código que estava dentro de window.initLogsPage() vem para cá ---

    // Elementos do DOM
    const tabs = document.querySelectorAll('.tab-link');
    const activityContent = document.getElementById('activity-content');
    const systemContent = document.getElementById('system-content');

    let currentActiveTab = 'activity';

    // --- Funções de Inicialização ---

    function initialize() {
        setupTabListeners();
        buildSystemLogView();
        loadLogsForActiveTab();
    }

    function setupTabListeners() {
        if (!tabs.length) return;
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                if (tabName === currentActiveTab) return;

                // Atualiza estado visual
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                const targetContent = document.getElementById(`${tabName}-content`);
                if (targetContent) targetContent.classList.add('active');
                else console.error(`Conteúdo da aba '${tabName}-content' não encontrado!`);

                currentActiveTab = tabName;
                loadLogsForActiveTab();
            });
        });
    }

    // Constrói a estrutura HTML para a aba de logs de sistema
    function buildSystemLogView() {
        if (!systemContent) return; // Proteção extra
        
        systemContent.innerHTML = `
            <div class="filters" style="display: flex; gap: 10px; margin-bottom: 20px; align-items: center;">
                <input type="text" id="system-keyword" placeholder="Pesquisar por mensagem, URL..." style="flex-grow: 1;">
                <input type="date" id="system-startDate">
                <input type="date" id="system-endDate">
                <button id="system-filterBtn" class="btn-primary">Filtrar</button>
                <button id="system-exportBtn" class="btn-secondary">Exportar</button>
            </div>
            <div class="table-container">
                <table id="systemLogsTable">
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Mensagem de Erro</th>
                            <th>Endpoint</th>
                            <th>Utilizador</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        // Adiciona listeners aos novos filtros
        const filterBtn = document.getElementById('system-filterBtn');
        const exportBtn = document.getElementById('system-exportBtn');
        
        if(filterBtn) filterBtn.addEventListener('click', loadSystemLogs);
        if(exportBtn) exportBtn.addEventListener('click', () => exportLogs('system'));
    }

    // --- Funções de Carregamento de Dados ---

    function loadLogsForActiveTab() {
        if (currentActiveTab === 'activity') {
            loadActivityLogs();
        } else {
            loadSystemLogs();
        }
    }

    async function loadActivityLogs() {
        const tableBody = document.querySelector('#activityLogsTable tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '<tr><td colspan="9">A carregar...</td></tr>';

        const keyword = document.getElementById('activity-keyword')?.value || '';
        const startDate = document.getElementById('activity-startDate')?.value || '';
        const endDate = document.getElementById('activity-endDate')?.value || '';

        try {
            const logs = await apiRequest(`/api/logs/activity?keyword=${keyword}&startDate=${startDate}&endDate=${endDate}`);
            renderActivityLogs(logs);
        } catch (error) {
            tableBody.innerHTML = `<tr><td colspan="9">Erro ao carregar logs: ${error.message}</td></tr>`;
        }
    }

    async function loadSystemLogs() {
        const tableBody = document.querySelector('#systemLogsTable tbody');
        if (!tableBody) return;
        tableBody.innerHTML = '<tr><td colspan="5">A carregar...</td></tr>';

        const keyword = document.getElementById('system-keyword')?.value || '';
        const startDate = document.getElementById('system-startDate')?.value || '';
        const endDate = document.getElementById('system-endDate')?.value || '';

        try {
            const logs = await apiRequest(`/api/logs/system?keyword=${keyword}&startDate=${startDate}&endDate=${endDate}`);
            renderSystemLogs(logs);
        } catch (error) {
            tableBody.innerHTML = `<tr><td colspan="5">Erro ao carregar logs: ${error.message}</td></tr>`;
        }
    }

    // --- Funções de Renderização ---

    function renderActivityLogs(logs) {
        const tableBody = document.querySelector('#activityLogsTable tbody');
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        if (!logs || logs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="9">Nenhum log de atividade encontrado.</td></tr>';
            return;
        }
        logs.forEach(log => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${log.id}</td>
                <td>${new Date(log.timestamp).toLocaleString()}</td>
                <td>${log.user_email || 'N/A'}</td>
                <td>${log.ip_address || 'N/A'}</td>
                <td>${log.action || ''}</td>
                <td><span class="status-${(log.status || '').toLowerCase()}">${log.status}</span></td>
                <td title="${log.description || ''}" class="error-message-cell">${log.description || ''}</td>
                <td>${log.target_type || ''}</td>
                <td>${log.target_id || ''}</td>
            `;
        });
    }

    function renderSystemLogs(logs) {
        const tableBody = document.querySelector('#systemLogsTable tbody');
        if (!tableBody) return;

        tableBody.innerHTML = '';
        if (!logs || logs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5">Nenhum log de sistema encontrado.</td></tr>';
            return;
        }
        logs.forEach(log => {
            const row = tableBody.insertRow();
            const logString = JSON.stringify(log).replace(/"/g, '&quot;');
            row.innerHTML = `
                <td>${new Date(log.timestamp).toLocaleString()}</td>
                <td class="error-message-cell" title="${log.error_message}">${log.error_message}</td>
                <td><span class="http-method-${(log.request_method || 'N/A').toUpperCase()}">${log.request_method || 'N/A'}</span> ${log.request_url || 'N/A'}</td>
                <td>${log.user_email || 'N/A'}</td>
                <td><button class="btn-secondary" onclick="showErrorDetails(${logString})">Detalhes</button></td>
            `;
        });
    }

    // --- Funções Auxiliares ---

    window.showErrorDetails = (log) => {
        const modal = document.createElement('div');
        modal.className = 'confirmation-modal-overlay visible';
        modal.innerHTML = `
            <div class="confirmation-modal-content" style="width: 80%; max-width: 800px; text-align: left;">
                <h3>Detalhes do Erro #${log.id}</h3>
                <p><strong>Timestamp:</strong> ${new Date(log.timestamp).toLocaleString()}</p>
                <p><strong>Mensagem:</strong> ${log.error_message}</p>
                <p><strong>Endpoint:</strong> ${log.request_method} ${log.request_url}</p>
                <p><strong>Utilizador:</strong> ${log.user_email || 'N/A'}</p>
                
                <h4>Corpo da Requisição:</h4>
                <pre style="background: #1f2937; padding: 10px; border-radius: 5px; max-height: 150px; overflow-y: auto;"><code>${log.request_body ? JSON.stringify(JSON.parse(log.request_body), null, 2) : 'N/A'}</code></pre>
                
                <h4>Stack Trace:</h4>
                <pre style="background: #1f2937; padding: 10px; border-radius: 5px; max-height: 300px; overflow-y: auto;"><code>${log.stack_trace || 'Não disponível'}</code></pre>
                
                <div class="confirmation-modal-buttons" style="justify-content: flex-end;">
                    <button class="btn-primary" data-action="close">Fechar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('[data-action="close"]').onclick = () => modal.remove();
    };

    async function exportLogs(type) {
        if (typeof XLSX === 'undefined') {
            showNotification("Erro: Biblioteca de exportação (XLSX) não carregada.", "error");
            return;
        }

        const buttonId = type === 'activity' ? 'activity-exportBtn' : 'system-exportBtn';
        const btn = document.getElementById(buttonId);
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'A gerar...';

        try {
            const keyword = document.getElementById(`${type}-keyword`)?.value || '';
            const startDate = document.getElementById(`${type}-startDate`)?.value || '';
            const endDate = document.getElementById(`${type}-endDate`)?.value || '';
            
            const logs = await apiRequest(`/api/logs/${type}?keyword=${keyword}&startDate=${startDate}&endDate=${endDate}`);
            
            if (!logs || logs.length === 0) {
                showNotification("Não há dados para exportar com os filtros atuais.", "info");
                return;
            }

            const worksheet = XLSX.utils.json_to_sheet(logs);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, `Logs de ${type}`);
            XLSX.writeFile(workbook, `Relatorio_Logs_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`);

        } catch (error) {
            showNotification(`Erro ao exportar: ${error.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    // Adiciona listeners aos filtros da aba de atividade (que já existem no HTML)
    const actFilterBtn = document.getElementById('activity-filterBtn');
    const actExportBtn = document.getElementById('activity-exportBtn');
    
    if(actFilterBtn) actFilterBtn.addEventListener('click', loadActivityLogs);
    if(actExportBtn) actExportBtn.addEventListener('click', () => exportLogs('activity'));

    // Inicia a página
    initialize();
}