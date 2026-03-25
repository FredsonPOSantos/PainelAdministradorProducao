// Ficheiro: frontend/js/support.js

if (window.initSupportPage) {
    console.warn("Tentativa de carregar support.js múltiplas vezes.");
} else {
    window.initSupportPage = (params = {}) => {

        const ticketListDiv = document.getElementById('ticket-list');
        const ticketDetailPanel = document.getElementById('ticket-detail-panel');
        const newTicketBtn = document.getElementById('newTicketBtn');
        const newTicketModal = document.getElementById('newTicketModal');
        const newTicketForm = document.getElementById('newTicketForm');
        const cancelNewTicketBtn = document.getElementById('cancelNewTicketBtn');
        const ticketSearch = document.getElementById('ticketSearch');
        const statusFilter = document.getElementById('statusFilter');
        const paginationContainer = document.getElementById('pagination-container');
        let pollingInterval = null; // [NOVO] Controle do intervalo de atualização automática
        let searchTimeout;
        let currentPage = 1;
        let currentTicketId = null; // [NOVO] Para controlar se estamos a atualizar ou a mudar de ticket

        let allUsers = []; // Cache para a lista de utilizadores

        // [NOVO] Mapeamento de status para exibição
        const statusMap = {
            'open': 'Aberto',
            'in_progress': 'Em Atendimento',
            'closed': 'Fechado'
        };

        // [NOVO] Função de limpeza para ser chamada ao sair da página
        window.cleanupSupportPage = () => {
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
        };

        const applyFilters = () => {
            const searchTerm = ticketSearch.value;
            const status = statusFilter.value;
            loadTickets(searchTerm, status, 1); // Sempre volta para a página 1 ao aplicar filtros
        };

        ticketSearch.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(applyFilters, 500); // Debounce de 500ms
        });

        statusFilter.addEventListener('change', applyFilters);

        // Carrega todos os tickets e os exibe na lista
        const loadTickets = async (search = '', status = '', page = 1) => {
            if (!ticketListDiv) return;
            window.showPagePreloader('A carregar tickets...');
            ticketListDiv.innerHTML = '<p>A carregar tickets...</p>';
            try {
                const params = new URLSearchParams();
                if (search) params.append('search', search);
                if (status) params.append('status', status);
                if (page) params.append('page', page);

                const response = await apiRequest(`/api/tickets?${params.toString()}`);
                if (!response.success) throw new Error(response.message);

                const { tickets, totalPages, currentPage } = response.data; // [CORRIGIDO] A API retorna o objeto em 'data'
                ticketListDiv.innerHTML = '';

                if (tickets.length === 0) {
                    ticketListDiv.innerHTML = '<p>Nenhum ticket encontrado.</p>';
                    renderPagination(0, 1); // Limpa a paginação
                    return;
                }

                tickets.forEach(ticket => {
                    const ticketElement = document.createElement('div');
                    ticketElement.className = 'ticket-item';
                    if (currentTicketId == ticket.id) ticketElement.classList.add('active'); // Mantém o item ativo
                    ticketElement.dataset.ticketId = ticket.id;

                    // [MODIFICADO] Renderização condicional baseada no layout (Portal vs Admin)
                    if (window.isSupportPortal) {
                        // Layout Novo (Estilo Chat)
                        ticketElement.innerHTML = `
                            <div class="ticket-header">
                                <span class="ticket-id">#${ticket.ticket_number}</span>
                                <span class="ticket-status status-${ticket.status}">${statusMap[ticket.status] || ticket.status}</span>
                            </div>
                            <div class="ticket-title">${ticket.title}</div>
                            <div class="ticket-meta">
                                <span>${new Date(ticket.updated_at).toLocaleString('pt-BR')}</span>
                            </div>
                        `;
                    } else {
                        // Layout Antigo (Admin)
                        ticketElement.innerHTML = `
                            <div class="ticket-item-header">
                                <span class="ticket-number">#${ticket.ticket_number}</span>
                                <span class="ticket-status status-${ticket.status}">${statusMap[ticket.status] || ticket.status}</span>
                            </div>
                            <div class="ticket-item-title">${ticket.title}</div>
                            <div class="ticket-item-meta">
                                <span>Criado por: ${ticket.created_by_email}</span>
                                <span>Atualizado: ${new Date(ticket.updated_at).toLocaleString('pt-BR')}</span>
                            </div>
                        `;
                    }

                    ticketElement.addEventListener('click', () => loadTicketDetails(ticket.id));
                    ticketListDiv.appendChild(ticketElement);
                });

                renderPagination(totalPages, currentPage);

            } catch (error) {
                ticketListDiv.innerHTML = '<p style="color: red;">Erro ao carregar tickets.</p>';
                console.error(error);
            } finally {
                window.hidePagePreloader();
            }
        };

        const renderPagination = (totalPages, currentPage) => {
            if (!paginationContainer) return;
            paginationContainer.innerHTML = '';

            if (totalPages <= 1) return;

            const createButton = (iconClass, page, isDisabled = false) => {
                const button = document.createElement('button');
                button.className = 'pagination-arrow-btn'; // Nova classe para estilo
                button.disabled = isDisabled;
                button.innerHTML = `<i class="fas ${iconClass}"></i>`;
                
                if (isDisabled) button.classList.add('disabled');

                button.addEventListener('click', () => {
                    const searchTerm = ticketSearch.value;
                    const status = statusFilter.value;
                    loadTickets(searchTerm, status, page);
                });
                return button;
            };

            // Botão "Anterior"
            paginationContainer.appendChild(createButton('fa-chevron-left', currentPage - 1, currentPage === 1));

            // Botão "Próximo"
            paginationContainer.appendChild(createButton('fa-chevron-right', currentPage + 1, currentPage === totalPages));
        };

        // Carrega os detalhes de um ticket específico
        const loadTicketDetails = async (ticketId) => {
            if (pollingInterval) clearInterval(pollingInterval); // [NOVO] Para verificações anteriores ao mudar de ticket

            if (!ticketDetailPanel) return;
            
            // [MELHORIA UX] Só mostra "A carregar..." se mudarmos de ticket.
            // Se for o mesmo ticket (ex: enviar mensagem), mantém o conteúdo atual para não piscar.
            if (currentTicketId !== ticketId) {
                ticketDetailPanel.innerHTML = '<div class="ticket-placeholder"><p>A carregar detalhes...</p></div>';
            }
            currentTicketId = ticketId;

            // Destaca o ticket selecionado na lista
            document.querySelectorAll('.ticket-item').forEach(el => el.classList.remove('active'));
            document.querySelector(`.ticket-item[data-ticket-id="${ticketId}"]`)?.classList.add('active');

            try {
                const response = await apiRequest(`/api/tickets/${ticketId}`);
                if (!response.success) throw new Error(response.message);

                const ticket = response.data; // [CORRIGIDO] A API retorna o objeto em 'data'
                renderTicketDetails(ticket);
                return ticket; // [IMPORTANTE] Retorna o ticket para uso no submit

            } catch (error) {
                ticketDetailPanel.innerHTML = '<div class="ticket-placeholder"><p style="color: red;">Erro ao carregar detalhes do ticket.</p></div>';
                console.error(error);
            }
        };

        // Renderiza o painel de detalhes do ticket
        const renderTicketDetails = (ticket) => {
            let messagesHtml = '';
            ticket.messages.forEach(msg => {
                const isCurrentUser = msg.user_email === window.currentUserProfile.email;
                const aiClass = !msg.user_email ? 'ai-message' : '';
                
                // [NOVO] Lógica de Avatar
                let avatarHtml = '';
                if (msg.avatar_url) {
                const isDev = window.location.port === '8184' || window.location.hostname === 'localhost';
                avatarHtml = `<img src="${isDev ? `http://${window.location.hostname}:3000` : ''}${msg.avatar_url}" class="message-avatar" alt="Avatar">`;
                } else if (!msg.user_email) {
                    avatarHtml = `<div class="message-avatar ai-avatar"><i class="fas fa-robot"></i></div>`; // Avatar IA
                } else {
                    avatarHtml = `<div class="message-avatar default-avatar"><i class="fas fa-user"></i></div>`; // Avatar Padrão
                }
                
                // [MODIFICADO] Estrutura de mensagem adaptada para o novo layout
                if (window.isSupportPortal) {
                    messagesHtml += `
                    <div class="message ${isCurrentUser ? 'sent' : 'received'}">
                        ${!isCurrentUser ? avatarHtml : ''}
                        <div class="message-bubble-container">
                            <div class="message-content">${msg.message}</div>
                            <div class="message-time">
                                ${msg.user_email || 'Assistente Virtual'} • ${new Date(msg.created_at).toLocaleString('pt-BR')}
                            </div>
                        </div>
                    </div>
                    `;
                } else {
                    messagesHtml += `
                    <div class="message-item ${isCurrentUser ? 'sent' : `received ${aiClass}`}">
                        <div class="message-content">${msg.message}</div>
                        <div class="message-meta">
                            <span>${msg.user_email || 'Assistente Virtual'}</span> em 
                            <span>${new Date(msg.created_at).toLocaleString('pt-BR')}</span>
                        </div>
                    </div>
                    `;
                }
            });

            // Lógica de ações (atribuir, fechar, etc.)
            // [MODIFICADO] Se for portal, usamos uma estrutura diferente para ações
            if (window.isSupportPortal) {
                // Layout Novo (Portal)
                let headerActions = '';
                
                // Select de atribuição (simplificado para o header)
                if (['master', 'gestao'].includes(window.currentUserProfile.role)) {
                    headerActions += `
                        <select id="assignUserSelect" class="assign-select" style="margin-right: 10px;">
                            <option value="">Atribuir a...</option>
                            ${allUsers.map(u => `<option value="${u.id}" ${ticket.assigned_to_email === u.email ? 'selected' : ''}>${u.email}</option>`).join('')}
                        </select>
                        <button id="assignTicketBtn" title="Confirmar Atribuição" style="margin-right: 10px;"><i class="fas fa-user-check"></i></button>
                    `;
                }

                if (ticket.status === 'open') {
                    headerActions += `<button id="progressTicketBtn" title="Marcar como Em Andamento"><i class="fas fa-play-circle"></i></button>`;
                }
                if (ticket.status !== 'closed') {
                    headerActions += `<button id="closeTicketBtn" title="Fechar Ticket"><i class="fas fa-check-circle"></i></button>`;
                } else {
                    headerActions += `<button id="reopenTicketBtn" title="Reabrir Ticket"><i class="fas fa-undo"></i></button>`;
                }
                headerActions += `<button id="exportTicketBtn" title="Exportar"><i class="fas fa-file-export"></i></button>`;

                ticketDetailPanel.innerHTML = `
                    <div class="chat-header">
                        <button class="mobile-menu-btn" id="menuToggleDynamic"><i class="fas fa-bars"></i></button>
                        <div class="chat-info">
                            <h4>${ticket.title}</h4>
                            <div class="chat-meta">
                                <span>Ticket: #${ticket.ticket_number}</span>
                                <span>Status: <span class="ticket-status status-${ticket.status}">${statusMap[ticket.status] || ticket.status}</span></span>
                                ${ticket.assigned_to_email ? `<span>Atribuído a: <strong>${ticket.assigned_to_email}</strong></span>` : ''}
                            </div>
                        </div>
                        <div class="chat-actions">
                            ${headerActions}
                        </div>
                    </div>

                    <div id="message-list" class="messages-container">
                        ${messagesHtml}
                    </div>

                    ${ticket.status !== 'closed' ? `
                    <div class="message-input-container">
                        <form id="newMessageForm" class="message-input-wrapper" style="width:100%">
                            <input id="newMessageText" type="hidden" name="content">
                            <div style="flex: 1; background: var(--background-dark); border-radius: 12px; overflow: hidden;">
                                <trix-editor input="newMessageText" class="message-input" placeholder="Digite sua mensagem..." style="border:none; min-height: 48px;"></trix-editor>
                            </div>
                            <button type="submit" class="send-btn"><i class="fas fa-paper-plane"></i></button>
                        </form>
                    </div>
                    ` : ''}
                `;

                // Re-bind do menu toggle para mobile
                document.getElementById('menuToggleDynamic')?.addEventListener('click', () => {
                    // [CORREÇÃO] Usa o seletor correto para o painel de lista no portal dedicado
                    document.querySelector('.ticket-list-panel').classList.toggle('active');
                });

            } else {
                // Layout Antigo (Admin) - Mantido igual
                let actionsHtml = `<div class="ticket-actions">`;
            
                // Grupo de atribuição à esquerda
                let assignmentHtml = '';
                if (['master', 'gestao'].includes(window.currentUserProfile.role)) {
                    assignmentHtml = `
                        <div class="input-group">
                            <label for="assignUserSelect">Atribuir a:</label>
                            <select id="assignUserSelect">
                                <option value="">Ninguém</option>
                                ${allUsers.map(u => `<option value="${u.id}" ${ticket.assigned_to_email === u.email ? 'selected' : ''}>${u.email}</option>`).join('')}
                            </select>
                            <button id="assignTicketBtn" class="btn-primary" title="Atribuir Ticket"><i class="fas fa-user-plus"></i></button>
                        </div>
                    `;
                }
                actionsHtml += assignmentHtml;

                // Grupo de botões de ação à direita
                let actionButtonsHtml = '<div class="ticket-action-buttons">';
                if (ticket.status === 'open') {
                    actionButtonsHtml += `<button id="progressTicketBtn" class="btn-secondary" title="Marcar como Em Andamento"><i class="fas fa-play-circle"></i></button>`;
                }
                if (ticket.status !== 'closed') {
                    actionButtonsHtml += `<button id="closeTicketBtn" class="btn-delete" title="Fechar Ticket"><i class="fas fa-check-circle"></i></button>`;
                } else {
                    actionButtonsHtml += `<button id="reopenTicketBtn" class="btn-secondary" title="Reabrir Ticket"><i class="fas fa-undo"></i></button>`;
                }
                actionButtonsHtml += `<button id="exportTicketBtn" class="btn-secondary" title="Exportar Conversa"><i class="fas fa-file-export"></i></button>`;
                actionButtonsHtml += '</div>';

                actionsHtml += actionButtonsHtml;
                actionsHtml += '</div>';

                ticketDetailPanel.innerHTML = `
                    <div class="panel-header">
                        <h3 title="${ticket.title}">${ticket.title}</h3>
                        <span class="ticket-status status-${ticket.status}">${statusMap[ticket.status] || ticket.status}</span>
                    </div>
                    <div class="ticket-details-meta">
                        <span>Ticket: #${ticket.ticket_number}</span>
                        <span>Criado por: ${ticket.created_by_email}</span>
                        <span>Atribuído a: ${ticket.assigned_to_email || 'Ninguém'}</span>
                    </div>
                    <div class="ticket-conversation-panel">
                        <div id="message-list" class="message-list">${messagesHtml}</div>
                        ${ticket.status !== 'closed' ? `
                        <form id="newMessageForm" class="new-message-form">
                            <input id="newMessageText" type="hidden" name="content">
                            <trix-editor input="newMessageText" data-ticket-id="${ticket.id}"></trix-editor>
                            <button type="submit">Enviar Mensagem</button>
                        </form>
                        ` : ''}
                    </div>
                    ${actionsHtml}
                `;
            }

            // [NOVO] Rola automaticamente para a última mensagem
            const messageList = document.getElementById('message-list');
            if (messageList) messageList.scrollTop = messageList.scrollHeight;

            // Adiciona event listeners para os novos elementos
            addDetailEventListeners(ticket);
        };

        // Adiciona os listeners para os botões e formulários no painel de detalhes
        const addDetailEventListeners = (ticket) => {
            const ticketId = ticket.id;
            document.getElementById('newMessageForm')?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const messageText = document.getElementById('newMessageText').value;
                if (!messageText) return;

                // [REFEITO] Envia a mensagem e o frontend não precisa de fazer mais nada,
                // pois a resposta da IA (se houver) virá pelo evento 'newMessage' do socket.
                // Opcional: Adicionar a mensagem do próprio utilizador à UI para feedback instantâneo.
                await apiRequest(`/api/tickets/${ticketId}/messages`, 'POST', { message: messageText });
                
                // Limpa o editor Trix
                const editor = document.querySelector("trix-editor[input='newMessageText']");
                if (editor) editor.editor.loadHTML('');
            });

            document.getElementById('assignTicketBtn')?.addEventListener('click', async () => {
                const assignee_id = document.getElementById('assignUserSelect').value;
                
                if (!assignee_id) {
                    showNotification('Por favor, selecione um utilizador para atribuir o ticket.', 'warning');
                    return;
                }
                await apiRequest(`/api/tickets/${ticketId}/assign`, 'PUT', { assignee_id: assignee_id });
                loadTicketDetails(ticketId);
            });

            document.getElementById('closeTicketBtn')?.addEventListener('click', async () => {
                await apiRequest(`/api/tickets/${ticketId}/status`, 'PUT', { status: 'closed' });
                loadTickets(ticketSearch.value, statusFilter.value, currentPage); // Recarrega a lista principal
                loadTicketDetails(ticketId);
            });

            document.getElementById('progressTicketBtn')?.addEventListener('click', async () => {
                await apiRequest(`/api/tickets/${ticketId}/status`, 'PUT', { status: 'in_progress' });
                loadTicketDetails(ticketId);
            });

            document.getElementById('exportTicketBtn')?.addEventListener('click', () => {
                exportTicketConversation(ticket);
            });
        };

        const exportTicketConversation = (ticket) => {
            let content = `Assunto: ${ticket.title}\n`;
            content += `Número do Ticket: ${ticket.ticket_number}\n`;
            content += `Status: ${ticket.status}\n`;
            content += `Criado por: ${ticket.created_by_email} em ${new Date(ticket.created_at).toLocaleString('pt-BR')}\n`;
            content += `Atribuído a: ${ticket.assigned_to_email || 'Ninguém'}\n\n`;
            content += `--- CONVERSA ---\n\n`;

            ticket.messages.forEach(msg => {
                content += `${new Date(msg.created_at).toLocaleString('pt-BR')} - ${msg.user_email}:\n`;
                content += `${msg.message}\n\n---\n`;
            });

            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `ticket_${ticket.ticket_number}.txt`;
            link.click();
            URL.revokeObjectURL(link.href);
        };

        // Abre e fecha o modal de novo ticket
        newTicketBtn?.addEventListener('click', () => newTicketModal?.classList.remove('hidden'));
        cancelNewTicketBtn?.addEventListener('click', () => newTicketModal?.classList.add('hidden'));

        // Lida com a submissão do novo ticket
        newTicketForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('ticketTitle').value;
            const message = document.getElementById('ticketMessage').value;

            try {
                const response = await apiRequest('/api/tickets', 'POST', { title, message });
                if (!response.success) throw new Error(response.message);
                
                newTicketModal.classList.add('hidden');
                newTicketForm.reset();
                showNotification('Ticket criado com sucesso!', 'success');
                loadTickets(); // Recarrega a lista de tickets
                // [CORREÇÃO] A API retorna o ID em response.data.ticketId
                const newTicketId = response.data?.ticketId;
                if (newTicketId) loadTicketDetails(newTicketId);
            } catch (error) {
                showNotification(`Erro ao criar ticket: ${error.message}`, 'error');
            }
        });

        const uploadFile = async (attachment) => {
            const file = attachment.file;
            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await apiRequest('/api/tickets/attachments', 'POST', formData);
                if (response.success) {
                    // [CORRIGIDO] A URL vem na raiz da resposta, não dentro de 'data'
                    const url = response.url;
                    attachment.setAttributes({
                        url: url,
                        href: url
                    });
                }
            } catch (error) {
                console.error('Erro ao carregar anexo:', error);
                attachment.remove();
            }
        };

        document.addEventListener('trix-attachment-add', (event) => {
            const attachment = event.attachment;
            if (attachment.file) {
                uploadFile(attachment);
            }
        });

        const openImageLightbox = (src) => {
            const lightbox = document.createElement('div');
            lightbox.id = 'image-lightbox-overlay';
            lightbox.className = 'image-lightbox-overlay';
            lightbox.innerHTML = `
                <span class="image-lightbox-close">&times;</span>
                <img src="${src}" class="image-lightbox-img">
            `;
            
            const close = () => lightbox.remove();
            
            lightbox.querySelector('.image-lightbox-close').addEventListener('click', close);
            lightbox.addEventListener('click', (e) => {
                if (e.target === lightbox) {
                    close();
                }
            });

            document.body.appendChild(lightbox);
        };

        ticketDetailPanel.addEventListener('click', (e) => {
            if (e.target.tagName === 'IMG' && e.target.closest('.message-content')) {
                e.preventDefault();
                openImageLightbox(e.target.src);
            }
        });

        // Função inicial que carrega os dados necessários
        const initialize = async () => {
            // Carrega a lista de utilizadores para o dropdown de atribuição

            if (['master', 'gestao'].includes(window.currentUserProfile.role)) {
                try {
                    // [CORREÇÃO] Usa a rota de lista simplificada que retorna { success: true, data: [...] }
                    // Isso resolve o problema de formato de resposta e garante que a lista seja carregada corretamente.
                    const usersResponse = await apiRequest('/api/admin/users/mention-list'); 
                    if(usersResponse.success) allUsers = usersResponse.data;
                } catch (e) {
                    console.error("Erro ao carregar lista de utilizadores para atribuição", e);
                }
            }
            // Carrega a lista inicial de tickets
            await loadTickets();

            // [MODIFICADO] Verifica se um ticketId foi passado via parâmetros (do portal) ou pelo método antigo (SPA)
            const ticketIdToLoad = params.ticketId || window.pageParams?.ticketId;
            if (ticketIdToLoad) {
                loadTicketDetails(ticketIdToLoad);
                // Limpa os parâmetros globais para não recarregar na próxima navegação interna
                if (window.pageParams) window.pageParams = {};
            }
        };

        initialize();
    };
}