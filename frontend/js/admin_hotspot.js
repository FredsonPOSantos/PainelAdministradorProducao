// Ficheiro: js/admin_hotspot.js
if (window.initHotspotPage) {
    console.warn("Tentativa de carregar admin_hotspot.js múltiplas vezes.");
} else {
    window.initHotspotPage = () => {

        // --- ELEMENTOS DO DOM ---
        const filterForm = document.getElementById('hotspotFilterForm');
        const resultsTable = document.getElementById('hotspotResultsTable');
        const resultsBody = resultsTable.querySelector('tbody');
        const totalCountSpan = document.getElementById('totalUsersCount');
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        const exportCsvBtn = document.getElementById('exportCsvBtn');
        const exportXlsxBtn = document.getElementById('exportXlsxBtn');

        let currentResults = []; // Armazena os resultados da última pesquisa

        // --- FUNÇÕES DE INICIALIZAÇÃO ---

        // [MODIFICADO] A função agora verifica a função (role) do utilizador
        const populateFilters = async () => {
            // Garante que o perfil do utilizador foi carregado
            if (!window.currentUserProfile) {
                console.warn("Perfil do utilizador não encontrado em initHotspotPage. A aguardar...");
                // Tenta novamente após um curto período, caso o fetchUserProfile ainda não tenha terminado
                setTimeout(populateFilters, 500);
                return;
            }

            const userRole = window.currentUserProfile.role;
            const routerSelect = document.getElementById('routerFilter');
            const groupSelect = document.getElementById('groupFilter');
            const campaignSelect = document.getElementById('campaignFilter');
            
            // Seletores dos containers dos filtros (para esconder se for 'estetica')
            const routerFilterGroup = document.getElementById('routerFilterGroup');
            const groupFilterGroup = document.getElementById('groupFilterGroup');


            try {
                if (userRole === 'master' || userRole === 'gestao') {
                    const [routers, groups, campaigns] = await Promise.all([
                        apiRequest('/api/routers'),
                        apiRequest('/api/routers/groups'),
                        apiRequest('/api/campaigns')
                    ]);

                    routers.forEach(r => { // [CORRIGIDO] A API retorna o array diretamente
                        routerSelect.innerHTML += `<option value="${r.id}">${r.name}</option>`;
                    });

                    groups.forEach(g => { // [CORRIGIDO] A API retorna o array diretamente
                        groupSelect.innerHTML += `<option value="${g.id}">${g.name}</option>`;
                    });

                    const campaignsResponse = await apiRequest('/api/campaigns');
                    campaignsResponse.forEach(c => { // [CORRIGIDO] A API retorna o array diretamente
                        campaignSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
                    });
                } else if (userRole === 'estetica') {
                    
                    if (routerFilterGroup) routerFilterGroup.style.display = 'none';
                    if (routerSelect) routerSelect.disabled = true;
                    
                    if (groupFilterGroup) groupFilterGroup.style.display = 'none';
                    if (groupSelect) groupSelect.disabled = true;

                    const campaignsResponse = await apiRequest('/api/campaigns');
                    campaignsResponse.forEach(c => { // [CORRIGIDO] A API retorna o array diretamente
                        campaignSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
                    });
                }

            } catch (error) {
                // Este erro não deve mais acontecer para 'estetica', pois evitamos a chamada
                console.error("Erro ao popular filtros:", error);
                if (!error.message.includes("Acesso negado")) {
                    showNotification("Não foi possível carregar os filtros. Tente recarregar a página.", 'error');
                }
            }
        };

        // --- FUNÇÕES DE LÓGICA ---

        const handleSearch = async (event) => {
            event.preventDefault();
            window.showPagePreloader('A pesquisar dados...');
            const formData = new FormData(filterForm);
            const params = new URLSearchParams();

            // Mapeia os IDs do formulário para os nomes dos parâmetros da API
            const fieldMapping = {
                'startDate': 'startDate', 'endDate': 'endDate',
                'lastLoginStart': 'lastLoginStart', 'lastLoginEnd': 'lastLoginEnd',
                'routerFilter': 'routerId', 'groupFilter': 'groupId',
                'campaignFilter': 'campaignId'
            };

            for (const fieldId in fieldMapping) {
                // [MODIFICADO] Verifica se o elemento existe E não está desativado
                const element = document.getElementById(fieldId);
                if (element && element.value && !element.disabled) {
                    params.append(fieldMapping[fieldId], element.value);
                }
            }

            resultsBody.innerHTML = `<tr><td colspan="10" style="text-align:center;">A pesquisar...</td></tr>`;

            try {
                // A rota /api/hotspot/users já foi corrigida no backend para aceitar 'estetica'
                const response = await apiRequest(`/api/hotspot/users?${params.toString()}`);
                // [CORRIGIDO] A API pode retornar o array diretamente ou dentro de 'data'.
                const results = response.data || response;
                currentResults = results; // Guarda os resultados para exportação
                displayResults(results);
            } catch (error) {
                console.error("Erro na pesquisa:", error);
                resultsBody.innerHTML = `<tr><td colspan="10" style="text-align:center;">Erro ao realizar a pesquisa.</td></tr>`;
            } finally {
                window.hidePagePreloader();
            }
        };

        const displayResults = (results) => {
            resultsBody.innerHTML = '';
            totalCountSpan.textContent = results.length;

            if (results.length === 0) {
                resultsBody.innerHTML = `<tr><td colspan="10" style="text-align:center;">Nenhum resultado encontrado.</td></tr>`;
                resultsTable.querySelector('thead').innerHTML = ''; // Limpa cabeçalhos
                return;
            }

            // Cria os cabeçalhos da tabela dinamicamente a partir do primeiro resultado
            const headers = Object.keys(results[0]);
            const headerRow = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
            resultsTable.querySelector('thead').innerHTML = headerRow;
            
            // Preenche as linhas da tabela
            results.forEach(user => {
                const row = document.createElement('tr');
                headers.forEach(header => {
                    const cell = document.createElement('td');
                    cell.textContent = user[header] === null ? 'N/A' : user[header];
                    row.appendChild(cell);
                });
                resultsBody.appendChild(row);
            });
        };

        // --- FUNÇÕES DE EXPORTAÇÃO ---

        const exportToCSV = () => {
            if (currentResults.length === 0) {
                showNotification("Não há dados para exportar.", 'error');
                return;
            }
            const headers = Object.keys(currentResults[0]);
            const csvRows = [
                headers.join(','),
                ...currentResults.map(row => 
                    headers.map(header => JSON.stringify(row[header], (key, value) => value === null ? '' : value)).join(',')
                )
            ];
            const csvString = csvRows.join('\n');
            const blob = new Blob([csvString], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('href', url);
            a.setAttribute('download', 'relatorio_hotspot.csv');
            a.click();
        };
        
        const exportToXLSX = () => {
             if (currentResults.length === 0) {
                showNotification("Não há dados para exportar.", 'error');
                return;
            }
            // A biblioteca SheetJS (xlsx) deve estar carregada no HTML principal
            if(typeof XLSX === 'undefined') {
                showNotification("Erro: A biblioteca de exportação para Excel não foi carregada.", 'error');
                return;
            }
            const worksheet = XLSX.utils.json_to_sheet(currentResults);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Utilizadores");
            XLSX.writeFile(workbook, "relatorio_hotspot.xlsx");
        };


        // --- EVENT LISTENERS ---
        filterForm.addEventListener('submit', handleSearch);
        clearFiltersBtn.addEventListener('click', () => {
            filterForm.reset();
            // Re-habilita e limpa filtros que podem ter sido desativados
            if (window.currentUserProfile && window.currentUserProfile.role !== 'estetica') {
                 if (document.getElementById('routerFilter')) document.getElementById('routerFilter').disabled = false;
                 if (document.getElementById('groupFilter')) document.getElementById('groupFilter').disabled = false;
            }
            currentResults = [];
            displayResults([]);
        });
        exportCsvBtn.addEventListener('click', exportToCSV);
        exportXlsxBtn.addEventListener('click', exportToXLSX);

        // --- INICIALIZAÇÃO ---
        populateFilters();
    };
}
