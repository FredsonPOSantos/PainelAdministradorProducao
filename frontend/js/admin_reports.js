// Ficheiro: frontend/js/admin_reports.js

if (window.initReportsPage) {
    console.warn("Tentativa de carregar admin_reports.js múltiplas vezes.");
} else {
    window.initReportsPage = () => {
        console.log("A inicializar a Central de Relatórios...");

        const reportTypeSelect = document.getElementById('reportTypeSelect');
        const filtersArea = document.getElementById('reportFiltersArea');
        const filtersGrid = document.getElementById('dynamicFiltersGrid');
        const previewArea = document.getElementById('reportPreviewArea');
        const previewTable = document.getElementById('previewTable');
        const totalRecordsCount = document.getElementById('totalRecordsCount');
        
        const btnPreview = document.getElementById('generatePreviewBtn');
        const btnExcel = document.getElementById('exportExcelBtn');
        const btnCsv = document.getElementById('exportCsvBtn');
        const btnPdf = document.getElementById('exportPdfBtn');

        // [NOVO] Cria o botão de relatório completo dinamicamente
        const btnFullReport = document.createElement('button');
        btnFullReport.id = 'exportFullHotspotPdfBtn';
        btnFullReport.type = 'button'; // [CORREÇÃO] Impede que o botão submeta o formulário e recarregue a página
        btnFullReport.className = 'btn-primary';
        btnFullReport.innerHTML = '<i class="fas fa-file-pdf"></i> Relatório Gráfico Completo';
        btnFullReport.style.display = 'none'; // Escondido por padrão
        btnFullReport.style.marginLeft = '10px';
        // Insere após o botão de PDF padrão
        if(btnPdf && btnPdf.parentNode) btnPdf.parentNode.appendChild(btnFullReport);

        let currentData = []; // Armazena os dados carregados para exportação
        let currentReportConfig = null; // Configuração do relatório ativo

        // Configurações de cada tipo de relatório
        const reportConfigs = {
            'hotspot_users': {
                title: 'Utilizadores do Hotspot',
                endpoint: '/api/hotspot/users',
                filters: [
                    { id: 'startDate', label: 'Data Início (Cadastro)', type: 'date' },
                    { id: 'endDate', label: 'Data Fim (Cadastro)', type: 'date' },
                    { id: 'routerId', label: 'Roteador', type: 'select', source: '/api/routers', key: 'id', text: 'name' }
                ],
                columns: [
                    { key: 'name', label: 'Nome' },
                    { key: 'email', label: 'E-mail' },
                    { key: 'phone', label: 'Telefone' },
                    { key: 'router_name', label: 'Roteador' },
                    { key: 'created_at', label: 'Cadastro' }
                ]
            },
            'audit_logs': {
                title: 'Logs de Auditoria',
                endpoint: '/api/logs/activity',
                filters: [
                    { id: 'keyword', label: 'Palavra-chave', type: 'text', placeholder: 'Email, Ação...' },
                    { id: 'startDate', label: 'Data Início', type: 'date' },
                    { id: 'endDate', label: 'Data Fim', type: 'date' }
                ],
                columns: [
                    { key: 'timestamp', label: 'Data/Hora', type: 'datetime' },
                    { key: 'user_email', label: 'Utilizador' },
                    { key: 'action', label: 'Ação' },
                    { key: 'status', label: 'Status' },
                    { key: 'description', label: 'Descrição' }
                ]
            },
            'system_logs': {
                title: 'Logs de Sistema',
                endpoint: '/api/logs/system',
                filters: [
                    { id: 'keyword', label: 'Palavra-chave', type: 'text', placeholder: 'Erro, URL...' },
                    { id: 'startDate', label: 'Data Início', type: 'date' },
                    { id: 'endDate', label: 'Data Fim', type: 'date' }
                ],
                columns: [
                    { key: 'timestamp', label: 'Data/Hora', type: 'datetime' },
                    { key: 'error_message', label: 'Mensagem' },
                    { key: 'request_url', label: 'Endpoint' },
                    { key: 'user_email', label: 'Utilizador' }
                ]
            },
            'dhcp_history': { // [NOVO] Relatório DHCP
                title: 'Histórico de Dispositivos Conectados (DHCP Leases)',
                endpoint: '/api/routers/reports/dhcp-history',
                filters: [
                    { id: 'startDate', label: 'Visto a partir de (Data e Hora)', type: 'datetime-local' },
                    { id: 'endDate', label: 'Visto até (Data e Hora)', type: 'datetime-local' },
                    { id: 'routerId', label: 'Roteador', type: 'select', source: '/api/routers', key: 'id', text: 'name' }
                ],
                columns: [
                    { key: 'mac_address', label: 'Endereço MAC' },
                    { key: 'host_name', label: 'Dispositivo' },
                    { key: 'ip_address', label: 'Último IP' },
                    { key: 'router_name', label: 'Roteador' },
                    { key: 'first_seen', label: 'Primeira Vez Visto', type: 'datetime' },
                    { key: 'last_seen', label: 'Última Vez Visto', type: 'datetime' }
                ]
            },
            'routers': {
                title: 'Inventário e Performance de Roteadores',
                endpoint: '/api/routers/report', // [MODIFICADO] Usa a nova rota de relatório detalhado
                filters: [], // Sem filtros por enquanto, lista tudo
                columns: [
                    { key: 'name', label: 'Nome' },
                    { key: 'ip_address', label: 'IP' },
                    { key: 'status', label: 'Status Atual' },
                    { key: 'availability_30d', label: 'Disp. (30d)' }, // [NOVO]
                    { key: 'first_activity', label: 'Primeira Atividade' }, // [NOVO]
                    { key: 'observacao', label: 'Observação' }
                ]
            },
            'router_uptime': { // [NOVO] Relatório de Disponibilidade por Período
                title: 'Disponibilidade de Roteadores (Período)',
                endpoint: '/api/routers/uptime-report',
                filters: [
                    { id: 'startDate', label: 'Data Início', type: 'date' },
                    { id: 'endDate', label: 'Data Fim', type: 'date' },
                    { id: 'routerId', label: 'Roteador', type: 'select', source: '/api/routers', key: 'id', text: 'name' }
                ],
                columns: [
                    { key: 'name', label: 'Roteador' },
                    { key: 'ip', label: 'IP' },
                    { key: 'uptime_formatted', label: 'Tempo Online' },
                    { key: 'availability', label: 'Disponibilidade (%)' },
                    { key: 'period', label: 'Período Analisado' }
                ]
            },
            'archived_logs': { // [NOVO] Relatório de Arquivos de Log
                title: 'Arquivos de Log Antigos (Backup)',
                endpoint: '/api/logs/archives',
                filters: [],
                columns: [
                    { key: 'name', label: 'Nome do Arquivo' },
                    { key: 'size', label: 'Tamanho' },
                    { key: 'created_at', label: 'Data Criação', type: 'datetime' }
                ],
                actions: [ // [MODIFICADO] Agora suporta múltiplas ações (array)
                    {
                        label: 'Baixar',
                        icon: 'fas fa-download',
                        class: 'btn-secondary btn-sm',
                        handler: async (row) => {
                            try {
                                const token = localStorage.getItem('adminToken');
                            const isDev = window.location.port === '8184' || window.location.hostname === 'localhost';
                            const baseUrl = isDev ? `http://${window.location.hostname}:3000` : '';
                            const response = await fetch(`${baseUrl}/api/logs/archives/${row.name}`, {
                                    headers: { 'Authorization': `Bearer ${token}` }
                                });
                                if (!response.ok) throw new Error('Erro ao baixar arquivo');
                                const blob = await response.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = row.name;
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                            } catch (e) {
                                showNotification('Erro ao baixar arquivo: ' + e.message, 'error');
                            }
                        }
                    },
                    {
                        label: 'Excluir',
                        icon: 'fas fa-trash',
                        class: 'btn-danger btn-sm',
                        handler: async (row) => {
                            if (!confirm(`Tem certeza que deseja excluir o arquivo "${row.name}"? Esta ação não pode ser desfeita.`)) return;
                            try {
                                await apiRequest(`/api/logs/archives/${row.name}`, 'DELETE');
                                showNotification('Arquivo excluído com sucesso.', 'success');
                                fetchData(); // Recarrega a lista
                            } catch (e) {
                                showNotification('Erro ao excluir: ' + e.message, 'error');
                            }
                        }
                    }
                ]
            },
            'raffles': {
                title: 'Sorteios Realizados',
                endpoint: '/api/raffles',
                filters: [],
                columns: [
                    { key: 'raffle_number', label: 'Número' },
                    { key: 'title', label: 'Título' },
                    { key: 'created_at', label: 'Data Criação', type: 'datetime' },
                    { key: 'winner_name', label: 'Vencedor' }
                ]
            },
            'lgpd_requests': {
                title: 'Pedidos LGPD',
                endpoint: '/api/lgpd/requests',
                filters: [],
                columns: [
                    { key: 'user_email', label: 'E-mail' },
                    { key: 'request_date', label: 'Data Pedido', type: 'datetime' },
                    { key: 'status', label: 'Status' },
                    { key: 'completion_date', label: 'Conclusão', type: 'datetime' }
                ]
            },
            'lgpd_logs': {
                title: 'Logs de Atividade LGPD',
                endpoint: '/api/lgpd/logs',
                filters: [],
                columns: [
                    { key: 'timestamp', label: 'Data/Hora', type: 'datetime' },
                    { key: 'user_email', label: 'Administrador' },
                    { key: 'action', label: 'Ação' },
                    { key: 'description', label: 'Descrição' }
                ]
            },
            'router_clients': {
                title: 'Clientes Conectados (Por Roteador)',
                endpoint: '/api/monitoring/router/:routerId/clients', // Endpoint dinâmico
                filters: [
                    { id: 'routerId', label: 'Selecione o Roteador', type: 'select', source: '/api/routers', key: 'id', text: 'name', required: true }
                ],
                // Nota: Este endpoint retorna uma estrutura complexa { dhcp:..., wifi:..., hotspot:... }
                // Precisaremos de uma lógica especial no fetchData para tratar isso ou criar um endpoint unificado no backend.
                // Para simplificar aqui, vamos assumir que o backend pode retornar uma lista plana se passarmos um parametro 'flat=true' ou tratamos no frontend.
                // Como o endpoint atual retorna objeto aninhado, vamos focar nos relatórios que retornam listas planas primeiro.
                // Vou remover este por enquanto para não quebrar a lógica genérica, mas fica a sugestão para criar um endpoint específico de relatório de clientes.
            },
            'banners': {
                title: 'Relatório de Banners',
                endpoint: '/api/banners',
                filters: [],
                columns: [
                    { key: 'name', label: 'Nome' },
                    { key: 'type', label: 'Tipo' },
                    { key: 'is_active', label: 'Ativo', type: 'boolean' },
                    { key: 'display_time_seconds', label: 'Tempo (s)' }
                ]
            },
            'campaigns': {
                title: 'Relatório de Campanhas',
                endpoint: '/api/campaigns',
                filters: [],
                columns: [
                    { key: 'name', label: 'Nome' },
                    { key: 'template_name', label: 'Template' },
                    { key: 'target_type', label: 'Alvo' },
                    { key: 'start_date', label: 'Início', type: 'date' },
                    { key: 'end_date', label: 'Fim', type: 'date' },
                    { key: 'is_active', label: 'Ativa', type: 'boolean' },
                    { key: 'view_count', label: 'Visualizações' }
                ]
            },
            'tickets': {
                title: 'Relatório Geral de Tickets',
                endpoint: '/api/tickets',
                filters: [
                    { id: 'status', label: 'Status', type: 'select', options: [{value: 'open', text: 'Aberto'}, {value: 'in_progress', text: 'Em Andamento'}, {value: 'closed', text: 'Fechado'}] }
                ],
                columns: [
                    { key: 'ticket_number', label: 'Número' },
                    { key: 'title', label: 'Assunto' },
                    { key: 'status', label: 'Status' },
                    { key: 'created_by_email', label: 'Criado Por' },
                    { key: 'created_at', label: 'Data Criação', type: 'datetime' }
                ]
            }
        };

        // --- Funções Auxiliares ---

        const renderFilters = async (config) => {
            filtersGrid.innerHTML = '';
            
            if (config.filters.length === 0) {
                filtersGrid.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1/-1; text-align: center;">Este relatório não possui filtros adicionais. Clique em "Pré-visualizar" para carregar todos os dados.</p>';
                return;
            }

            for (const filter of config.filters) {
                const group = document.createElement('div');
                group.className = 'input-group';
                
                const label = document.createElement('label');
                label.htmlFor = `filter_${filter.id}`;
                label.textContent = filter.label;
                group.appendChild(label);

                let input;
                if (filter.type === 'select') {
                    input = document.createElement('select');
                    input.innerHTML = '<option value="">Todos</option>';
                    // Carrega opções da API se necessário
                    if (filter.source) {
                        try {
                            const response = await apiRequest(filter.source);
                            const data = response.data || response; // Lida com {data: []} ou []
                            // [CORREÇÃO] Ordena alfabeticamente se for lista de roteadores
                            if (Array.isArray(data)) {
                                if (filter.source.includes('routers')) {
                                    data.sort((a, b) => a.name.localeCompare(b.name));
                                }
                                data.forEach(item => {
                                    const option = document.createElement('option');
                                    option.value = item[filter.key];
                                    option.textContent = item[filter.text];
                                    input.appendChild(option);
                                });
                            }
                        } catch (e) {
                            console.error(`Erro ao carregar opções para ${filter.id}:`, e);
                        }
                    }
                    // [NOVO] Suporte para opções estáticas
                    if (filter.options) {
                        filter.options.forEach(opt => {
                            const option = document.createElement('option');
                            option.value = opt.value;
                            option.textContent = opt.text;
                            input.appendChild(option);
                        });
                    }
                } else {
                    input = document.createElement('input');
                    input.type = filter.type;
                    if (filter.placeholder) input.placeholder = filter.placeholder;
                }
                
                input.id = `filter_${filter.id}`;
                input.name = filter.id;
                group.appendChild(input);
                filtersGrid.appendChild(group);
            }
        };

        const fetchData = async () => {
            if (!currentReportConfig) return;

            window.showPagePreloader('A gerar relatório...');
            btnPreview.disabled = true;
            
            // Coleta valores dos filtros
            const params = new URLSearchParams();
            currentReportConfig.filters.forEach(filter => {
                const el = document.getElementById(`filter_${filter.id}`);
                if (el && el.value) {
                    params.append(filter.id, el.value);
                }
            });

            try {
                const url = `${currentReportConfig.endpoint}?${params.toString()}`;
                const response = await apiRequest(url);
                
                // Normaliza a resposta (alguns endpoints retornam array direto, outros {data: []})
                let data = response.data || response;
                // [CORREÇÃO] Se for objeto paginado (ex: tickets), tenta pegar o array interno
                if (data.tickets) data = data.tickets; 
                
                if (!Array.isArray(data)) {
                    throw new Error("Formato de dados inválido recebido da API.");
                }

                currentData = data;
                renderPreview(data);
                
                // Habilita botões de exportação se houver dados
                const hasData = data.length > 0;
                btnExcel.disabled = !hasData;
                btnCsv.disabled = !hasData;
                btnPdf.disabled = !hasData;

                if (!hasData) {
                    showNotification('Nenhum registo encontrado com os filtros selecionados.', 'info');
                }

            } catch (error) {
                console.error("Erro ao gerar relatório:", error);
                showNotification(`Erro ao gerar relatório: ${error.message}`, 'error');
                previewTable.querySelector('tbody').innerHTML = `<tr><td colspan="100" style="text-align:center; color: var(--error-text);">Erro ao carregar dados.</td></tr>`;
            } finally {
                window.hidePagePreloader();
                btnPreview.disabled = false;
            }
        };

        const renderPreview = (data) => {
            previewArea.classList.remove('hidden');
            totalRecordsCount.textContent = data.length;
            
            const thead = previewTable.querySelector('thead');
            const tbody = previewTable.querySelector('tbody');
            
            // Renderiza Cabeçalhos
            thead.innerHTML = '<tr>' + currentReportConfig.columns.map(col => `<th>${col.label}</th>`).join('') + '</tr>';
            
            // Renderiza Dados (Limitado a 20 para preview)
            tbody.innerHTML = '';
            const previewData = data.slice(0, 20);
            
            previewData.forEach(row => {
                const tr = document.createElement('tr');
                currentReportConfig.columns.forEach(col => {
                    const td = document.createElement('td');
                    let val = row[col.key];
                    
                    // Formatação básica
                    if (val === null || val === undefined) val = 'N/A';
                    else if (col.type === 'datetime') val = new Date(val).toLocaleString('pt-BR');
                    else if (col.type === 'date') val = new Date(val).toLocaleDateString('pt-BR');
                    else if (col.type === 'boolean') val = val ? 'Sim' : 'Não'; // [NOVO]
                    
                    td.textContent = val;
                    tr.appendChild(td);
                });

                // [NOVO] Renderiza botão de ação se configurado (para download de logs)
                // [MODIFICADO] Suporta tanto 'rowAction' (legado/único) quanto 'actions' (array)
                const actions = currentReportConfig.actions || (currentReportConfig.rowAction ? [currentReportConfig.rowAction] : []);
                
                if (actions.length > 0) {
                    const td = document.createElement('td');
                    td.style.display = 'flex';
                    td.style.gap = '5px';
                    
                    actions.forEach(action => {
                        const btn = document.createElement('button');
                        btn.className = action.class || 'btn-secondary btn-sm';
                        btn.innerHTML = `<i class="${action.icon}"></i> ${action.label}`;
                        btn.onclick = () => action.handler(row);
                        td.appendChild(btn);
                    });
                    
                    tr.appendChild(td);
                    
                    // Adiciona cabeçalho se não existir
                    if (!thead.querySelector('th.action-col')) {
                        const th = document.createElement('th');
                        th.className = 'action-col';
                        th.textContent = 'Ações';
                        thead.querySelector('tr').appendChild(th);
                    }
                }

                tbody.appendChild(tr);
            });

            if (data.length > 20) {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td colspan="${currentReportConfig.columns.length}" style="text-align: center; font-style: italic; color: var(--text-secondary);">... e mais ${data.length - 20} registos (exporte para ver tudo) ...</td>`;
                tbody.appendChild(tr);
            }
        };

        // --- Funções de Exportação ---

        const exportToExcel = () => {
            if (!currentData.length) return;
            
            // Mapeia os dados para as colunas configuradas
            const exportData = currentData.map(row => {
                const mappedRow = {};
                currentReportConfig.columns.forEach(col => {
                    let val = row[col.key];
                    if (val === null || val === undefined) val = '';
                    else if (col.type === 'datetime') val = new Date(val).toLocaleString('pt-BR');
                    else if (col.type === 'date') val = new Date(val).toLocaleDateString('pt-BR');
                    else if (col.type === 'boolean') val = val ? 'Sim' : 'Não';
                    mappedRow[col.label] = val;
                });
                return mappedRow;
            });

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Relatório");
            XLSX.writeFile(wb, `Relatorio_${currentReportConfig.title.replace(/ /g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
        };

        const exportToCsv = () => {
            if (!currentData.length) return;
            
            const headers = currentReportConfig.columns.map(c => c.label);
            const rows = currentData.map(row => 
                currentReportConfig.columns.map(col => {
                    let val = row[col.key];
                    if (val === null || val === undefined) val = '';
                    else if (col.type === 'datetime') val = new Date(val).toLocaleString('pt-BR');
                    else if (col.type === 'date') val = new Date(val).toLocaleDateString('pt-BR');
                    else if (col.type === 'boolean') val = val ? 'Sim' : 'Não';
                    return `"${String(val).replace(/"/g, '""')}"`; // Escape quotes
                }).join(',')
            );
            
            const csvContent = [headers.join(','), ...rows].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Relatorio_${currentReportConfig.title.replace(/ /g, '_')}.csv`;
            link.click();
        };

        const exportToPdf = () => {
            if (!currentData.length || !window.jspdf) return;
            
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            doc.setFontSize(16);
            doc.text(currentReportConfig.title, 14, 20);
            doc.setFontSize(10);
            doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
            
            const headers = [currentReportConfig.columns.map(c => c.label)];
            const data = currentData.map(row => 
                currentReportConfig.columns.map(col => {
                    let val = row[col.key];
                    if (val === null || val === undefined) val = '';
                    else if (col.type === 'datetime') val = new Date(val).toLocaleString('pt-BR');
                    else if (col.type === 'date') val = new Date(val).toLocaleDateString('pt-BR');
                    else if (col.type === 'boolean') val = val ? 'Sim' : 'Não';
                    return String(val);
                })
            );

            doc.autoTable({
                startY: 35,
                head: headers,
                body: data,
                theme: 'grid',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [66, 153, 225] } // Azul do tema
            });
            
            doc.save(`Relatorio_${currentReportConfig.title.replace(/ /g, '_')}.pdf`);
        };

        // --- Event Listeners ---

        reportTypeSelect.addEventListener('change', (e) => {
            const type = e.target.value;
            
            // Reseta estado
            currentData = [];
            previewArea.classList.add('hidden');
            btnExcel.disabled = true;
            btnCsv.disabled = true;
            btnPdf.disabled = true;

            if (type && reportConfigs[type]) {
                currentReportConfig = reportConfigs[type];
                filtersArea.classList.remove('hidden');
                renderFilters(currentReportConfig);
            } else {
                currentReportConfig = null;
                filtersArea.classList.add('hidden');
            }

            // [NOVO] Mostra o botão de relatório completo apenas para hotspot_users
            if (type === 'hotspot_users') {
                btnFullReport.style.display = 'inline-block';
            } else {
                btnFullReport.style.display = 'none';
            }
        });

        btnPreview.addEventListener('click', fetchData);
        btnExcel.addEventListener('click', exportToExcel);
        btnCsv.addEventListener('click', exportToCsv);
        btnPdf.addEventListener('click', exportToPdf);

        // [NOVO] Lógica para gerar o relatório completo com gráfico
        btnFullReport.addEventListener('click', async (e) => {
            e.preventDefault(); // [CORREÇÃO] Garante que nenhum evento padrão ocorra
            if (!window.jspdf || !window.Chart) {
                showNotification('Bibliotecas necessárias (PDF/Chart) não carregadas.', 'error');
                return;
            }

            window.showPagePreloader('A gerar relatório gráfico...');

            try {
                // 1. Buscar estatísticas do backend
                const response = await apiRequest('/api/hotspot/report-stats');
                if (!response.success) throw new Error(response.message);
                
                const { stats, chartData } = response;

                // 2. Gerar Gráfico em Canvas Oculto
                const canvas = document.createElement('canvas');
                canvas.width = 800;
                canvas.height = 400;
                canvas.style.display = 'none';
                document.body.appendChild(canvas);

                const chartInstance = new Chart(canvas, {
                    type: 'line',
                    data: {
                        labels: chartData.map(d => d.day),
                        datasets: [{
                            label: 'Novos Registos (Últimos 60 dias)',
                            data: chartData.map(d => parseInt(d.count)),
                            borderColor: '#3b82f6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        animation: false, // Desativa animação para renderização imediata
                        responsive: false
                    }
                });

                // 3. Criar PDF
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                const pageWidth = doc.internal.pageSize.width;

                // Cabeçalho
                doc.setFontSize(20);
                doc.setTextColor(40, 40, 40);
                doc.text("Relatório de Performance do Hotspot", 14, 20);
                doc.setFontSize(10);
                doc.setTextColor(100);
                doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);

                // Tabela de Resumo (Total, 60, 30, 15)
                doc.autoTable({
                    startY: 35,
                    head: [['Período', 'Total de Utilizadores', 'Média Diária (aprox.)']],
                    body: [
                        ['Total Geral', stats.total, (stats.total / 365).toFixed(1)], // Média anual estimada
                        ['Últimos 60 Dias', stats.last_60, (stats.last_60 / 60).toFixed(1)],
                        ['Últimos 30 Dias', stats.last_30, (stats.last_30 / 30).toFixed(1)],
                        ['Últimos 15 Dias', stats.last_15, (stats.last_15 / 15).toFixed(1)]
                    ],
                    theme: 'grid',
                    headStyles: { fillColor: [66, 153, 225] }
                });

                // Adicionar Imagem do Gráfico
                const chartImg = canvas.toDataURL('image/png');
                const imgY = doc.lastAutoTable.finalY + 15;
                doc.setFontSize(14);
                doc.setTextColor(0);
                doc.text("Evolução de Registos (60 Dias)", 14, imgY - 5);
                doc.addImage(chartImg, 'PNG', 14, imgY, 180, 90);

                // Limpeza
                chartInstance.destroy();
                canvas.remove();

                doc.save(`Relatorio_Hotspot_Grafico_${new Date().toISOString().slice(0,10)}.pdf`);
                showNotification('Relatório gerado com sucesso!', 'success');

            } catch (error) {
                console.error(error);
                showNotification(`Erro ao gerar relatório: ${error.message}`, 'error');
            } finally {
                window.hidePagePreloader();
            }
        });
    };
}           