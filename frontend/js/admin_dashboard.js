// Ficheiro: frontend/js/admin_dashboard.js
// [VERSÃO 13.1.3 - Lógica V13 (CSS Classes) + Correção de Timing (V14.4) + IDs Corrigidos V2]

// --- Variáveis Globais ---
let isProfileLoaded = false;
window.currentUserProfile = null;
window.systemSettings = null; 

let preloaderTimeout = null; // [NOVO] Variável para controlar o timeout do loader
let progressInterval = null; // [NOVO] Variável para a animação da barra

// [NOVO] Funções Globais para o Preloader (Autocarro)
window.showPagePreloader = (message = 'A carregar...') => {
    // Verifica se o loader está ativado nas configurações
    const isEnabled = window.systemSettings?.loader_enabled !== false; // Default true
    if (!isEnabled) return;

    const preloader = document.getElementById('page-preloader');
    if (preloader) {
        const textEl = preloader.querySelector('.loading-text');
        if (textEl) textEl.textContent = message;
        preloader.classList.remove('loaded');

        // [NOVO] Lógica da Barra de Progresso Simulada
        const bar = document.getElementById('loaderProgressBar');
        const pct = document.getElementById('loaderPercentage');
        if (bar && pct) {
            bar.style.width = '0%';
            pct.textContent = '0%';
            
            if (progressInterval) clearInterval(progressInterval);
            let width = 0;
            progressInterval = setInterval(() => {
                // Avança rápido no início, depois desacelera
                if (width >= 90) {
                    // Fica parado em 90% até o carregamento real terminar
                } else {
                    width += Math.random() * 10;
                    if (width > 90) width = 90;
                    bar.style.width = `${width}%`;
                    pct.textContent = `${Math.round(width)}%`;
                }
            }, 200);
        }
        
        // [NOVO] Define um timeout de segurança baseado nas configurações
        if (preloaderTimeout) clearTimeout(preloaderTimeout);
        
        const timeoutMs = window.systemSettings?.loader_timeout || 20000; // [AUMENTADO] Default para 20s para acomodar redes lentas.
        preloaderTimeout = setTimeout(() => {
            console.warn(`[Preloader] Timeout de segurança atingido (${timeoutMs}ms). Forçando remoção.`);
            window.hidePagePreloader();
        }, timeoutMs);
    }
};

window.hidePagePreloader = () => {
    const preloader = document.getElementById('page-preloader');
    if (preloader) {
        // Limpa o timeout de segurança se existir
        if (preloaderTimeout) {
            clearTimeout(preloaderTimeout);
            preloaderTimeout = null;
        }

        // [NOVO] Finaliza a barra de progresso
        if (progressInterval) clearInterval(progressInterval);
        const bar = document.getElementById('loaderProgressBar');
        const pct = document.getElementById('loaderPercentage');
        if (bar && pct) {
            bar.style.width = '100%';
            pct.textContent = '100%';
        }

        // Delay reduzido para 300ms para uma sensação de maior velocidade
        setTimeout(() => { preloader.classList.add('loaded'); }, 300);
    }
};

// --- Funções Globais ---
const showForcePasswordChangeModal = () => {
    const changePasswordModal = document.getElementById('forceChangePasswordModal');
    if (changePasswordModal) {
        changePasswordModal.classList.remove('hidden');
        document.querySelector('.sidebar')?.classList.add('hidden');
        document.querySelector('.main-content')?.classList.add('hidden');
    } else {
        console.error("FATAL: Modal 'forceChangePasswordModal' não encontrado (V13.1.3)!");
    }
};

// [NOVO V13.1] Função para aplicar configurações visuais (Nome, Logo, Cor)
window.applyVisualSettings = (settings) => {
    if (!settings) {
        console.warn("applyVisualSettings: Configurações não fornecidas.");
        return;
    }
    console.log("%c[applyVisualSettings] Invocada com:", "color: lightblue; font-weight: bold;", settings);

    const root = document.documentElement;

    // Mapeamento de configurações para variáveis CSS
    const styleMap = {
        'primary_color': '--primary-color',          // CORRIGIDO: Alinhado com o CSS em uso
        'background_color': '--background-dark',      // CORRIGIDO: Alinhado com o CSS em uso
        'sidebar_color': '--background-medium',      // CORRIGIDO: Alinhado com o CSS em uso
        'font_color': '--text-primary',            // CORRIGIDO: Alinhado com o CSS em uso
        'font_family': '--font-family',
        'font_size': '--font-size', // Adicionado 'px' abaixo
        'modal_background_color': '--modal-background-color',
        'modal_font_color': '--modal-font-color',
        'modal_border_color': '--modal-border-color',
        // [NOVO] Mapeamento para navegação e tipografia
        'nav_title_color': '--nav-title-color',
        'label_color': '--label-color',
        'placeholder_color': '--placeholder-color',
        'tab_link_color': '--tab-link-color',
        'tab_link_active_color': '--tab-link-active-color'
    };

    for (const key in styleMap) {
        if (settings[key] !== undefined && settings[key] !== null) {
            let value = settings[key];
            if (key === 'font_size') {
                value = `${value}px`;
            }
            console.log(` -> Aplicando ${styleMap[key]} = ${value}`);
            root.style.setProperty(styleMap[key], value);
        } else {
            console.log(` -> Chave '${key}' está nula ou indefinida. Pulando.`);
        }
    }

    // --- LÓGICA DE CONTRASTE INTELIGENTE (SMART CONTRAST) ---
    
    // 1. Determina a cor de fundo de referência (Sidebar/Cards é a mais crítica)
    const refBgColor = settings.sidebar_color || settings.background_color;
    let baseTextColor = settings.font_color; // Pode ser undefined
    
    if (refBgColor) {
        const contrastColor = getContrastColor(refBgColor);
        
        // Define uma variável CSS para uso geral de contraste (botões, ícones)
        root.style.setProperty('--contrast-text-color', contrastColor);

        // Se o utilizador NÃO definiu cor da fonte, usa o contraste calculado
        if (!baseTextColor) {
            baseTextColor = contrastColor;
            root.style.setProperty('--text-primary', baseTextColor);
            console.log(` -> Auto-ajuste: --text-primary para ${baseTextColor}`);
        }

        // Ajusta labels e títulos se não definidos
        if (!settings.label_color) {
            root.style.setProperty('--label-color', baseTextColor);
        }
        if (!settings.nav_title_color) {
            root.style.setProperty('--nav-title-color', baseTextColor);
        }
    }

    // 2. Ajusta cores Secundárias e Terciárias baseadas na cor Primária de Texto
    // Isso corrige o problema onde o texto principal é escuro (fundo claro), mas os secundários continuam claros (invisíveis).
    if (baseTextColor) {
        // Verifica se a cor base é escura (para fundos claros) ou clara (para fundos escuros)
        // Usamos uma lógica simples: se a cor de contraste dela for branca, ela é escura.
        const isDarkText = getContrastColor(baseTextColor) === '#ffffff'; // Ex: Preto pede contraste Branco

        if (isDarkText) {
            // Modo Claro (Texto Escuro): Define tons de cinza escuro
            root.style.setProperty('--text-secondary', '#4a5568'); // Gray 700
            root.style.setProperty('--text-tertiary', '#718096');  // Gray 600
            root.style.setProperty('--border-color', '#cbd5e0');   // Gray 300 (Bordas mais visíveis)
            if (!settings.placeholder_color) root.style.setProperty('--placeholder-color', '#a0aec0');
        } else {
            // Modo Escuro (Texto Claro): Define tons de cinza claro (Padrão)
            root.style.setProperty('--text-secondary', '#a0aec0'); // Gray 400
            root.style.setProperty('--text-tertiary', '#cbd5e0');  // Gray 300
            root.style.setProperty('--border-color', '#4a5568');   // Gray 700
            if (!settings.placeholder_color) root.style.setProperty('--placeholder-color', '#718096');
        }
    }

    // 3. Lógica Específica para Modais
    // Se o modal tiver uma cor de fundo personalizada, o texto dentro dele deve contrastar com ELA, não com o fundo global.
    // [MODIFICADO] Só aplica se não houver um tema ativo no body (para evitar conflito com temas)
    const hasActiveTheme = document.body.className.includes('theme-');
    if (settings.modal_background_color && !hasActiveTheme) {
        const modalContrast = getContrastColor(settings.modal_background_color);
        // Se não houver cor de fonte de modal definida, força o contraste
        if (!settings.modal_font_color) {
             root.style.setProperty('--modal-font-color', modalContrast);
             // console.log(` -> Auto-ajuste Modal: --modal-font-color para ${modalContrast}`);
        }
    }

    // Lógica do logótipo
    const headerLogo = document.getElementById('headerLogo');
    if (headerLogo) {
        if (settings.logo_url) {
            const API_ADMIN_URL = `http://${window.location.hostname}:3000`;
            const logoPath = settings.logo_url.startsWith('/') ? settings.logo_url : '/' + settings.logo_url;
            const newLogoSrc = `${API_ADMIN_URL}${logoPath}?t=${Date.now()}`;
            headerLogo.src = newLogoSrc;
            headerLogo.alt = settings.company_name || "Logótipo";
            headerLogo.style.display = 'block';
        } else {
            headerLogo.style.display = 'none';
            headerLogo.src = '#';
        }
    }
};


// --- [NOVO V13.1 / V14.4] ---
// Função robusta para esperar que um elemento E a função de inicialização existam
const waitForElement = (selector, container, initFunctionName, pageName) => {
    // [CORRIGIDO] Aumenta o tempo de espera para 5 segundos para acomodar redes mais lentas.
    const maxRetries = 100; 
    const delay = 50; // Verifica a cada 50ms
    let retryCount = 0;

    const check = () => {
        // Procura o elemento dentro do container (ex: .content-area)
        const element = container.querySelector(selector);
        // Procura a função no window (global)
        const initFunction = window[initFunctionName];
        
        if (element && typeof initFunction === 'function') {
            // Elemento e Função encontrados, executa a inicialização
            console.log(`%c[waitForElement] SUCESSO: Elemento '${selector}' e função '${initFunctionName}' prontos para a página '${pageName}'. A executar...`, 'color: #28a745');
            initFunction();
        } else if (retryCount < maxRetries) {
            // Elemento não encontrado, tenta novamente após o delay
            retryCount++;
            // [NOVO] Log de depuração mais detalhado
            if (retryCount % 20 === 0) { // Loga a cada 1 segundo para não poluir o console
                console.log(`[waitForElement] A aguardar... Página: ${pageName}, Elemento: ${selector} (${element ? 'OK' : 'Falta'}), Função: ${initFunctionName} (${typeof initFunction === 'function' ? 'OK' : 'Falta'})`);
            }
            setTimeout(check, delay);
        } else {
            // Esgotou as tentativas
            console.error(`%c[waitForElement] TIMEOUT: Falha ao iniciar a página '${pageName}'.`, 'color: #dc3545; font-weight: bold;');
            if (!element) console.error(`  -> Causa: O elemento HTML esperado ('${selector}') não foi encontrado no DOM.`);
            if (typeof window[initFunctionName] !== 'function') console.error(`  -> Causa: A função de inicialização ('${initFunctionName}') não foi encontrada. Verifique se o script JS da página foi carregado corretamente e não contém erros.`);
        }
    };
    
    check(); // Inicia a primeira verificação
};
// --- FIM V13.1 / V14.4 ---

// --- [NOVO] Monitor de Inatividade ---
let idleTimer;
const setupIdleMonitor = () => {
    // Obtém o tempo limite das configurações (padrão 30 minutos se não definido)
    const timeoutMinutes = window.systemSettings?.admin_session_timeout || 30;
    const timeoutMillis = timeoutMinutes * 60 * 1000;

    console.log(`[IdleMonitor] Monitor de inatividade iniciado. Tempo limite: ${timeoutMinutes} minutos.`);

    const resetTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(onIdleTimeout, timeoutMillis);
    };

    const onIdleTimeout = () => {
        console.warn("[IdleMonitor] Sessão expirada por inatividade.");
        
        // Remove o token e dados do utilizador
        localStorage.removeItem('adminToken');
        window.currentUserProfile = null;
        
        // Mostra modal de sessão expirada
        const modalHtml = `
            <div id="sessionExpiredModal" class="modal-overlay visible" style="z-index: 10000;">
                <div class="modal-content" style="text-align: center; max-width: 400px;">
                    <div style="font-size: 3rem; margin-bottom: 10px;">⏳</div>
                    <h3 style="color: var(--text-primary); margin-bottom: 10px;">Sessão Expirada</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 20px;">
                        Você ficou inativo por mais de ${timeoutMinutes} minutos. Por segurança, sua sessão foi encerrada.
                    </p>
                    <button class="btn-primary" onclick="window.location.href='admin_login.html'" style="width: 100%;">Voltar ao Login</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    };

    // Eventos que resetam o timer (atividade do utilizador)
    window.onload = resetTimer;
    document.onmousemove = resetTimer;
    document.onkeypress = resetTimer;
    document.ontouchstart = resetTimer; // Para mobile
    document.onclick = resetTimer;
    document.onscroll = resetTimer;

    resetTimer(); // Inicia a contagem
};

// --- INICIALIZAÇÃO PRINCIPAL (DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', async () => {
    
    console.log("DOM Carregado (V13.1.3). Iniciando Dashboard...");
    const token = localStorage.getItem('adminToken');
    if (!token) {
        console.log("Nenhum token (V13.1.3). Redirecionando."); 
        window.location.href = 'admin_login.html';
        return;
    }

    // --- DOM Elements ---
    const userNameElement = document.getElementById('userName');
    const userRoleElement = document.getElementById('userRole');
    const logoutButton = document.getElementById('logoutButton');
    let mainContentArea = document.querySelector('.content-area'); // [CORREÇÃO] Alterado de 'const' para 'let' para permitir a reatribuição.
    const navLinks = document.querySelectorAll('.sidebar-nav .nav-item');
    const allNavItemsAndTitles = document.querySelectorAll('.sidebar-nav .nav-item, .sidebar-nav .nav-title');
    const pageTitleElement = document.getElementById('pageTitle');
    const changePasswordModal = document.getElementById('forceChangePasswordModal');
    const changePasswordForm = document.getElementById('forceChangePasswordForm');
    const reauthLgpdModal = document.getElementById('reauthLgpdModal');
    const reauthLgpdForm = document.getElementById('reauthLgpdForm');
    const cancelReauthBtn = document.getElementById('cancelReauthBtn');
    const reauthError = document.getElementById('reauthError');
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn'); // [NOVO]
    const globalSearchInput = document.getElementById('globalSearchInput'); // [NOVO]

    // [NOVO] Lógica de Notificações
    const notificationIcon = document.getElementById('notification-icon-wrapper');
    const notificationBadge = document.getElementById('notification-badge');
    let notificationInterval;
    let isDropdownVisible = false;

    const fetchUnreadCount = async () => {
        try {
            const response = await apiRequest('/api/notifications/unread-count');
            // [CORRIGIDO] A API retorna { success: true, data: { count: X } }.
            // O acesso correto é response.data.count, não response.data.data.count.
            if (response.success && response.data) {
                const count = response.data.count;
                if (count > 0) {
                    notificationBadge.textContent = count;
                    notificationBadge.classList.remove('hidden');
                } else {
                    notificationBadge.classList.add('hidden');
                }
            }
        } catch (error) {
            console.error('Erro ao buscar contagem de notificações:', error);
        }
    };

    const startNotificationPolling = () => {
        if (notificationInterval) clearInterval(notificationInterval);
        fetchUnreadCount(); // Busca imediatamente ao iniciar
        notificationInterval = setInterval(fetchUnreadCount, 30000); // E depois a cada 30 segundos
    };

    const handleNotificationClick = async (notification) => {
        try {
            await apiRequest(`/api/notifications/${notification.id}/read`, 'PUT');
            // Remove a notificação da lista
            const notificationElement = document.querySelector(`.notification-item[data-id="${notification.id}"]`);
            if (notificationElement) {
                notificationElement.remove();
            }
            // Atualiza a contagem
            fetchUnreadCount();
            // [CORREÇÃO] Navega para o portal de suporte dedicado com o ID do ticket no hash
            window.location.href = `support_portal.html#${notification.related_ticket_id}`;
        } catch (error) {
            console.error('Erro ao marcar notificação como lida:', error);
        }
    };

    const toggleNotificationDropdown = async () => {
        const existingDropdown = document.getElementById('notification-dropdown');
        if (existingDropdown) {
            existingDropdown.remove();
            isDropdownVisible = false;
            return;
        }

        try {
            const response = await apiRequest('/api/notifications/unread');
            if (response.success) {
                // [CORRIGIDO] A API retorna { success: true, data: [...] }. O acesso correto é response.data.
                const notifications = response.data;
                const dropdown = document.createElement('div');
                dropdown.id = 'notification-dropdown';
                dropdown.classList.add('notification-dropdown');

                if (!notifications || notifications.length === 0) {
                    dropdown.innerHTML = '<p>Nenhuma notificação nova.</p>';
                } else {
                    notifications.forEach(notification => {
                        const item = document.createElement('div');
                        item.classList.add('notification-item');
                        item.dataset.id = notification.id;
                        item.innerHTML = `
                            <p>${notification.message}</p>
                            <span class="notification-time">${new Date(notification.created_at).toLocaleString()}</span>
                        `;
                        item.addEventListener('click', () => handleNotificationClick(notification));
                        dropdown.appendChild(item);
                    });
                    const markAllButton = document.createElement('button');
                    markAllButton.id = 'mark-all-as-read';
                    markAllButton.textContent = 'Marcar todas como lidas';
                    markAllButton.addEventListener('click', async () => {
                        try {
                            await apiRequest('/api/notifications/mark-as-read', 'PUT');
                            fetchUnreadCount();
                            toggleNotificationDropdown();
                        } catch (error) {
                            console.error('Erro ao marcar todas as notificações como lidas:', error);
                        }
                    });
                    dropdown.appendChild(markAllButton);
                }

                notificationIcon.appendChild(dropdown);
                isDropdownVisible = true;
            }
        } catch (error) {
            console.error('Erro ao buscar notificações:', error);
        }
    };

    // [NOVO] Lógica de Busca Global
    if (globalSearchInput) {
        globalSearchInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                const term = globalSearchInput.value.trim();
                if (term.length < 2) return;

                try {
                    const response = await apiRequest(`/api/search/global?q=${encodeURIComponent(term)}`);
                    if (response.success && response.data.length > 0) {
                        // Lógica simples: se encontrar 1 resultado, vai direto. Se mais, poderia abrir modal.
                        // Aqui vamos implementar um redirecionamento inteligente para o primeiro resultado.
                        const first = response.data[0];
                        if (first.type === 'router') {
                            loadPage('admin_routers', null); // Idealmente passaria filtro
                            showNotification(`Roteador encontrado: ${first.name}`, 'success');
                        } else if (first.type === 'user') {
                            loadPage('admin_hotspot', null);
                            showNotification(`Utilizador encontrado: ${first.name}`, 'success');
                        } else if (first.type === 'ticket') {
                            window.location.href = `support_portal.html#${first.id}`;
                        }
                    } else {
                        showNotification('Nenhum resultado encontrado.', 'info');
                    }
                } catch (error) {
                    console.error('Erro na busca:', error);
                }
            }
        });
    }

    notificationIcon?.addEventListener('click', toggleNotificationDropdown);


    // [CORRIGIDO] Mapeamento de inicializadores de página usando STRINGS.
    // Isso permite que a função seja encontrada no 'window' mesmo que o script seja carregado depois.
    const pageInitializers = {
        'admin_home': 'initHomePage',
        'admin_hotspot': 'initHotspotPage',
        'admin_users': 'initUsersPage',
        'admin_templates': 'initTemplatesPage',
        'admin_banners': 'initBannersPage',
        'admin_campaigns': 'initCampaignsPage',
        'admin_routers': 'initRoutersPage',
        'admin_settings': 'initSettingsPage',
        'support': 'initSupportPage',
        'admin_raffles': 'initRafflesPage',
        'analytics_dashboard': 'initAnalyticsDashboard',
        'admin_system_health': 'initSystemHealthPage', // [NOVO]
        'admin_reports': 'initReportsPage', // [NOVO]
        'admin_profile': 'initProfilePage', // [NOVO] Regista a página de perfil
    };

    // --- [ATUALIZADO V13.1.3] IDs de verificação para o waitForElement ---
    const pageElementIds = {
        'admin_home': '#campaignsTotal',          // CORRIGIDO: ID atualizado após redesenho dos cards
        'admin_hotspot': '#hotspotFilterForm',      
        'admin_users': '#resetPasswordForm',        
        'admin_templates': '#templatesTable',       
        'admin_banners': '#bannersTable',           
        'admin_campaigns': '#campaignsTable',       
        'admin_routers': '#groupsTable',            
        'admin_settings': '#unifiedAppearanceForm', // [ATUALIZADO] Aponta para um elemento existente
        'support': '#support-page-container',
        'admin_raffles': '#createRaffleForm',
        'analytics_dashboard': '#analytics-dashboard-wrapper', // [CORRIGIDO]
        'admin_system_health': '#systemHealthContainer', // [NOVO]
        'admin_reports': '#reportTypeSelect', // [NOVO]
        'admin_profile': '#profile-page-wrapper', // [NOVO] ID do container da página de perfil
    };
    // --- FIM V13.1.3 ---


    // --- PAGE NAVIGATION (Atualizado V13.1) ---
    const loadPage = async (pageName, linkElement, params = {}) => {
        // --- [CORREÇÃO CRÍTICA V14.5] ---
        // Garante que a referência ao 'mainContentArea' é sempre a mais recente.
        // A lógica de clonagem abaixo remove o elemento antigo do DOM, tornando a
        // referência anterior inválida. Esta linha busca o elemento "vivo" a cada navegação.
        mainContentArea = document.querySelector('.content-area');
        // --- FIM DA CORREÇÃO ---

        if (!isProfileLoaded) {
            console.warn(`loadPage (${pageName}) chamado antes do perfil (V13.1.3).`);
        }
        if (isProfileLoaded && window.currentUserProfile?.must_change_password) {
            console.warn(`Navegação ${pageName} bloqueada (V13.1.3): Senha.`);
            showForcePasswordChangeModal();
            return;
        }

        console.log(`loadPage (V13.1.3): Carregando ${pageName}...`);
        
        window.pageParams = params; // Store params globally

        // [CORRIGIDO] Inicializa a variável antes de qualquer uso
        let currentTitle = pageName; 

        if (pageName === 'admin_profile') {
            currentTitle = 'Meu Perfil';
        }

        navLinks.forEach(link => link.classList.remove('active'));
        if (linkElement) {
            linkElement.classList.add('active');
            const txt = (linkElement.textContent || '').trim().replace(/[\u{1F300}-\u{1F5FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
            currentTitle = txt || pageName;
        } else {
            const curr = document.querySelector(`.sidebar-nav .nav-item[data-page="${pageName}"]`);
            if (curr) {
                curr.classList.add('active');
                const txt = (curr.textContent || '').trim().replace(/[\u{1F300}-\u{1F5FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
                currentTitle = txt || pageName;
            }
        }
        
        if (pageTitleElement) pageTitleElement.textContent = currentTitle;

        try {
            const response = await fetch(`/pages/${pageName}.html?_=${Date.now()}`);
            if (!response.ok) {
                throw new Error(`Página ${pageName}.html não encontrada (${response.status})`);
            }
            if (mainContentArea) {
                // [CORREÇÃO DEFINITIVA] Chama a função de limpeza da página anterior, se ela existir.
                // Isto é crucial para remover listeners globais (no 'document' ou 'window')
                // que foram adicionados por scripts de páginas específicas, como o admin_settings.js.
                if (window.cleanupSettingsPage) {
                    window.cleanupSettingsPage();
                    window.cleanupSettingsPage = undefined; // Limpa a referência para a próxima navegação.
                }
                // [NOVO] Limpeza específica para a página de suporte
                if (window.cleanupSupportPage) {
                    window.cleanupSupportPage();
                    window.cleanupSupportPage = undefined;
                }
                // [NOVO] Limpeza específica para a página de logs para permitir reinicialização
                if (document.body.dataset.logsPageInitialized) {
                    delete document.body.dataset.logsPageInitialized;
                    console.log("Cleanup: Flag de inicialização da página de logs removida.");
                }
                // [NOVO] Limpeza específica para a página de saúde do sistema
                if (window.cleanupSystemHealthPage) {
                    window.cleanupSystemHealthPage();
                    window.cleanupSystemHealthPage = undefined;
                }
                if (window.cleanupRafflesPage) {
                    window.cleanupRafflesPage();
                    window.cleanupRafflesPage = undefined;
                }
                // [CORREÇÃO] Remove event listeners "fantasmas" de páginas anteriores.
                // A maneira mais eficaz de remover todos os listeners de um elemento é
                // substituí-lo por um clone dele mesmo. Isso evita que scripts de uma página
                // (como admin_settings.js) afetem a navegação de outra (como admin_routers.js).
                const newMainContentArea = mainContentArea.cloneNode(false);
                mainContentArea.parentNode.replaceChild(newMainContentArea, mainContentArea);
                mainContentArea = newMainContentArea; // Atualiza a referência para o novo elemento limpo.
                const html = await response.text();
                mainContentArea.innerHTML = html;

                // [CORREÇÃO] Scripts inseridos via innerHTML não são executados.
                // Precisamos encontrá-los e recriá-los. Para scripts externos, precisamos esperar que carreguem.
                const scripts = mainContentArea.querySelectorAll("script");
                const scriptPromises = [];

                scripts.forEach(oldScript => {
                    const newScript = document.createElement("script");
                    Array.from(oldScript.attributes).forEach(attr => {
                        // [CORREÇÃO MIGRAÇÃO] Força a URL do Socket.IO a usar o hostname correto,
                        // evitando problemas com IPs hardcoded (127.0.0.1) nos ficheiros HTML.
                        if (attr.name.toLowerCase() === 'src' && attr.value.includes('/socket.io/socket.io.js')) {
                            const correctSocketUrl = `http://${window.location.hostname}:3000/socket.io/socket.io.js`;
                            console.log(`[Socket.IO Loader] Corrigindo URL do Socket.IO para: ${correctSocketUrl}`);
                            newScript.setAttribute('src', correctSocketUrl);
                        } else {
                            newScript.setAttribute(attr.name, attr.value);
                        }
                    });
                    newScript.textContent = oldScript.textContent;

                    // Se for um script externo (tem 'src'), criamos uma promessa para esperar o carregamento.
                    if (oldScript.src) {
                        const promise = new Promise((resolve, reject) => {
                            newScript.onload = resolve;
                            newScript.onerror = reject;
                        });
                        scriptPromises.push(promise);
                    }

                    oldScript.parentNode.replaceChild(newScript, oldScript);
                });

                // [CORREÇÃO] Espera que todos os scripts externos (como socket.io.js) terminem de carregar
                // antes de tentar inicializar a lógica da página.
                await Promise.all(scriptPromises).catch(error => {
                    console.error("Falha ao carregar um script externo:", error);
                });

            } else {
                console.error("'.content-area' não encontrado.");
                return;
            }

            // [CORRIGIDO] Resolve a função dinamicamente a partir do window usando o nome (string)
            const initFunctionName = pageInitializers[pageName];
            const elementToWaitFor = pageElementIds[pageName];

            if (initFunctionName && elementToWaitFor && mainContentArea) {
                // A função waitForElement garante que o HTML foi renderizado antes de executar o JS.
                // Agora passamos o NOME da função (string) para que o waitForElement aguarde ela existir.
                waitForElement(elementToWaitFor, mainContentArea, initFunctionName, pageName);
            } else if (!initFunctionName) {
                console.warn(`Nome da função de init para ${pageName} não definido.`);
            }
            else if (!elementToWaitFor) {
                 console.error(`ID de verificação (V13.1.3) para ${pageName} não definido em pageElementIds.`);
            }

        } catch (error) {
            console.error(`Erro loadPage ${pageName} (V13.1.3):`, error);
            if (mainContentArea) mainContentArea.innerHTML = `<h2>Erro ao carregar ${pageName}.</h2><p>${error.message}.</p>`;
        }
    };
    window.loadPageExternal = loadPage;
    window.loadPage = loadPage; // [CORREÇÃO] Expõe a função globalmente para resolver o erro "loadPage is not defined"

    // --- USER PROFILE & AUTH ---
    const fetchUserProfile = async () => {
        isProfileLoaded = false;
        window.currentUserProfile = null;
        try {
            console.log("fetchUserProfile (V13.6.1): Buscando perfil e permissões...");
            const data = await apiRequest('/api/admin/profile');
            
            // [CORRIGIDO] Usa a nova resposta simplificada da API
            if (!data.success || !data.data) {
                throw new Error(data.message || "Resposta inválida da API de perfil.");
            }

            const userProfile = data.data;
            console.log(`fetchUserProfile: Perfil recebido (Role: ${userProfile.role}).`);
            window.currentUserProfile = userProfile;
            isProfileLoaded = true;

            // Preenche os elementos no novo cabeçalho
            if (userNameElement) userNameElement.textContent = userProfile.email;
            if (userRoleElement) userRoleElement.textContent = userProfile.role.toUpperCase();

            // [NOVO] Atualiza o avatar do cabeçalho
            const headerAvatar = document.getElementById('headerUserAvatar');
            if (headerAvatar) {
                if (userProfile.avatar_url) {
                    headerAvatar.src = `http://${window.location.hostname}:3000${userProfile.avatar_url}`;
                    headerAvatar.style.display = 'block';
                } else {
                    headerAvatar.style.display = 'none';
                }
                // Adiciona o mesmo evento de clique para ir para o perfil
                headerAvatar.onclick = () => {
                    navLinks.forEach(link => link.classList.remove('active'));
                    loadPage('admin_profile', null);
                };
            }

            // [NOVO] Torna a área de utilizador clicável para aceder ao perfil
            const userInfoContainer = document.querySelector('.user-info');
            if (userInfoContainer) {
                userInfoContainer.style.cursor = 'pointer';
                userInfoContainer.title = 'Ir para o Meu Perfil';
                userInfoContainer.onclick = () => {
                    navLinks.forEach(link => link.classList.remove('active')); // Remove seleção do menu lateral
                    loadPage('admin_profile', null);
                };
            }

            // [NOVO] Lógica para o nome de boas-vindas
            const userFirstNameElement = document.getElementById('userFirstName');
            if (userFirstNameElement) {
                // Por enquanto, o campo 'nome_completo' não existe. Usaremos um fallback.
                if (userProfile.name) { // O backend agora retorna 'name'
                    const firstName = userProfile.name.split(' ')[0];
                    userFirstNameElement.textContent = firstName;
                } else {
                    // Fallback se não houver nome completo, esconde a mensagem
                    const welcomeMessage = userFirstNameElement.closest('.welcome-message');
                    if(welcomeMessage) welcomeMessage.style.display = 'none';
                }
            }

            if (userProfile.must_change_password) {
                console.log("fetchUserProfile (V13.6.1): Senha obrigatória.");
                showForcePasswordChangeModal();
                return false;
            }

            console.log("fetchUserProfile (V13.6.1): Perfil e permissões OK.");
            return true;

        } catch (error) {
            console.error("Falha CRÍTICA ao buscar perfil (V13.6.1):", error.message);
            isProfileLoaded = false;
            window.currentUserProfile = null;
            window.systemSettings = null;
            if(mainContentArea) mainContentArea.innerHTML = '<h2>Erro ao carregar perfil. Recarregue a página.</h2>';
            document.querySelector('.sidebar')?.classList.add('hidden');
            document.querySelector('.main-content')?.classList.add('hidden');

            if (!error.message || (!error.message.includes('Não autorizado') && !error.message.includes('obrigatória'))) {
                setTimeout(() => {
                    localStorage.removeItem('adminToken');
                    window.location.href = 'admin_login.html';
                }, 4000);
            }
            return false;
        }
    };

    // --- [LÓGICA V13.6.1] applyMenuPermissions (Baseada em Permissões) ---
    const applyMenuPermissions = (permissions, userRole) => {
        console.log(`applyMenuPermissions (V13.6.1): Aplicando permissões...`, permissions);

        if (!permissions) {
            console.error("applyMenuPermissions (V13.6.1): Objeto de permissões não fornecido!");
            return;
        }

        // [CORRIGIDO] Define a variável isMaster dentro do escopo da função
        const isMaster = (userRole === 'master');

        // Mapeia cada item de menu para a permissão de leitura necessária
        const menuPermissionMap = {
            'admin_home': 'dashboard.read',
            'admin_hotspot': 'hotspot.read',
            'admin_campaigns': 'campaigns.read',
            'admin_templates': 'templates.read',
            'admin_banners': 'banners.read',
            'admin_raffles': 'raffles.read',
            'admin_routers': 'routers.read',
            'admin_users': 'users.read',
            'admin_reports': 'analytics.read', // [NOVO] Usa a permissão de analytics ou cria uma nova 'reports.read'
            'support': 'tickets.read', // [NOVO]
            'admin_system_health': 'system_health.read' // [NOVO] Saúde do Sistema
        };

        allNavItemsAndTitles.forEach(el => {
            if (!el.classList.contains('nav-item')) {
                el.style.removeProperty('display');
                return; // Se não for um nav-item, não aplicamos lógica de permissão diretamente
            }

            const page = el.getAttribute('data-page');
            const requiredPermission = menuPermissionMap[page];

            if (page === 'admin_settings') {
                const hasSettingsPermission = Object.keys(permissions).some(p => p.startsWith('settings.'));
                if (hasSettingsPermission) {
                    el.style.removeProperty('display');
                } else {
                    el.style.display = 'none';
                }
                return;
            }
            
            // Se não há uma permissão mapeada, o item é considerado público (como o Dashboard)
            if (!requiredPermission || permissions[requiredPermission] || isMaster) { // Garante que master veja tudo
                el.style.removeProperty('display');
            } else {
                el.style.display = 'none';
            }
        });

        // Passagem 2: Esconde títulos se todos os filhos estiverem escondidos
        const navTitles = document.querySelectorAll('.sidebar-nav .nav-title');
        navTitles.forEach(titleEl => {
            let nextEl = titleEl.nextElementSibling;
            let hasVisibleChild = false;
            while (nextEl && !nextEl.classList.contains('nav-title')) {
                if (nextEl.classList.contains('nav-item') && nextEl.style.display !== 'none') {
                    hasVisibleChild = true;
                    break;
                }
                nextEl = nextEl.nextElementSibling;
            }

            if (!hasVisibleChild) {
                titleEl.style.display = 'none';
            } else {
                titleEl.style.removeProperty('display');
            }
        });

        console.log("applyMenuPermissions (V13.6.1): Permissões do menu aplicadas.");
    };


    // --- Logout ---
    if (logoutButton) {
        logoutButton.onclick = () => { // Usar onclick para garantir que não haja múltiplos listeners
            console.log("Logout (V13.1.3).");
            localStorage.removeItem('adminToken');
            window.currentUserProfile = null;
            isProfileLoaded = false;
            window.systemSettings = null;
            window.location.href = 'admin_login.html';
        };
    } else {
        console.warn("Botão logout (V13.1.3) não encontrado.");
    }

    // --- Navegação ---
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            // [CORREÇÃO] Se o link apontar para uma página real (não #), permite a navegação padrão
            // Isso permite abrir o support_portal.html
            if (href && href !== '#' && !href.startsWith('javascript:')) {
                return;
            }

            e.preventDefault();
            const page = link.getAttribute('data-page');
            if(page) loadPage(page, link);
            else console.warn("Click em item de menu sem 'data-page' (V13.1.3).");
        });
    });

    // [CORRIGIDO] Delegação de eventos para botões de atalho rápido.
    // O listener é anexado a um elemento pai estático ('.main-content') para que não se perca
    // quando o '.content-area' é recarregado durante a navegação.
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.addEventListener('click', (e) => {
            const quickLink = e.target.closest('.quick-link-btn');
            if (quickLink) {
                e.preventDefault();
                const page = quickLink.getAttribute('data-page');
                const correspondingNavLink = document.querySelector(`.nav-item[data-page="${page}"]`);
                if (page && window.loadPageExternal && correspondingNavLink) {
                    window.loadPageExternal(page, correspondingNavLink);
                }
            }
        });
    }

    // [NOVO] Lógica para o botão de toggle da sidebar
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) {
                sidebar.classList.toggle('collapsed');
            }
        });
    }

    // --- Modal Troca Senha ---
            if (changePasswordForm) {
                changePasswordForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    console.log("Form troca senha submetido (V13.1.3).");
                    const btn = changePasswordForm.querySelector('button[type="submit"]');
                    const currIn = document.getElementById('currentTemporaryPassword');
                    const newIn = document.getElementById('newPassword');
                    
                    if(!currIn || !newIn) {
                         showNotification("Erro interno (campos não encontrados).", 'error');
                         if(btn) { btn.disabled = false; btn.textContent = 'Alterar'; }
                         return;
                    }
    
                    const curr = currIn.value;
                    const nv = newIn.value;
    
                    if (nv.length < 6) {
                        showNotification('A nova senha deve ter pelo menos 6 caracteres.', 'error');
                        if(btn) { btn.disabled = false; btn.textContent = 'Alterar'; }
                        return;
                    }
    
                    try {
                        const result = await apiRequest('/api/admin/profile/change-own-password', 'POST', {
                            currentPassword: curr,
                            newPassword: nv
                        });
                        
                        showNotification((result.message || "Senha alterada com sucesso!") + " A redirecionar para o login...", 'success');
                        
                        // Redireciona para o login após o sucesso
                        setTimeout(() => {
                            localStorage.removeItem('adminToken');
                            window.currentUserProfile = null; isProfileLoaded = false; window.systemSettings = null;
                            window.location.href = 'admin_login.html';
                        }, 4000);
    
                    } catch (error) {
                        showNotification(`Erro: ${error.message || 'Falha ao alterar a senha.'}`, 'error');
                        if(btn) { btn.disabled = false; btn.textContent = 'Alterar'; }
                    }
                });
            }
    
            if (reauthLgpdForm) {
                reauthLgpdForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const email = document.getElementById('reauthEmail').value;
                    const password = document.getElementById('reauthPassword').value;
                    const submitButton = reauthLgpdForm.querySelector('button[type="submit"]');
    
                    submitButton.disabled = true;
                    submitButton.textContent = 'A verificar...';
                    if (reauthError) reauthError.style.display = 'none';
    
                    try {
                        const response = await apiRequest('/api/auth/re-authenticate', 'POST', { email, password });
    
                        if (response.success) {
                            window.location.href = 'pages/lgpd_management.html';
                        } else {
                            throw new Error(response.message || 'Falha na autenticação.');
                        }
                    } catch (error) {
                        if (reauthError) {
                            reauthError.textContent = error.message;
                            reauthError.style.display = 'block';
                        }
                    } finally {
                        submitButton.disabled = false;
                        submitButton.textContent = 'Confirmar e Aceder';
                    }
                });
            }
    
            if (cancelReauthBtn) {
                cancelReauthBtn.addEventListener('click', () => {
                    if (reauthLgpdModal) reauthLgpdModal.classList.add('hidden');
                    if (reauthLgpdForm) reauthLgpdForm.reset();
                    if (reauthError) reauthError.style.display = 'none';
                });
            }
    // --- [REESTRUTURADO V13] INICIALIZAÇÃO ---
    console.log("Dashboard (V13.1.3): Iniciando sequência...");
    
    // 1. Busca o perfil E ESPERA
    const profileOK = await fetchUserProfile();
    console.log(`Dashboard (V13.1.3): Perfil carregado? ${profileOK}`);

    // [CORREÇÃO] O preloader deve ser escondido SEMPRE após a verificação do perfil,
    // mesmo que a inicialização seja interrompida (ex: para forçar a troca de senha).
    // Mover este bloco para antes da verificação `if (!profileOK)` resolve o "congelamento" da tela.
    const preloader = document.getElementById('page-preloader');
    if (preloader) {
        // Pequeno delay para garantir que a transição visual seja suave
        setTimeout(() => {
            preloader.classList.add('loaded');
        }, 800); // Mantém o autocarro visível por pelo menos 0.8s para o efeito visual
    }

    if (!profileOK) {
        // Se o perfil falhar (token inválido) ou precisar de troca de senha,
        // a inicialização é interrompida aqui.
        console.log("Dashboard (V13.1.3): Inicialização INTERROMPIDA (fetchUserProfile falhou ou bloqueou).");
        return;
    }

    // 2. Busca e aplica as configurações gerais para TODOS os utilizadores
    try {
        console.log("Dashboard (V13.1.3): Buscando configurações gerais...");
        const settingsResponse = await apiRequest('/api/settings/general');
        // LOG ADICIONADO: Mostra a resposta completa da API
        console.log('%c[Dashboard Init] Resposta da API /api/settings/general:', 'color: orange;', settingsResponse);

        // [CORRIGIDO] A API pode retornar o objeto de configurações diretamente ou dentro de uma propriedade 'data'.
        const settings = settingsResponse.data || settingsResponse;
        if (settings && Object.keys(settings).length > 0) {
            window.systemSettings = settings;
            applyVisualSettings(window.systemSettings);
            console.log("%c[Dashboard Init] Configurações visuais aplicadas com sucesso.", "color: green;");
            
            // [NOVO] Inicia o monitor de inatividade após carregar as configurações
            setupIdleMonitor();
        } else {
            console.warn("Dashboard (V13.1.3): Configurações gerais não retornadas pela API.");
            window.systemSettings = {};
        }
    } catch (settingsError) {
        console.error("Dashboard (V13.1.3): Erro ao buscar/aplicar configurações gerais:", settingsError);
        window.systemSettings = {};
    }

    // 3. [NOVO] Aplica o tema pessoal do utilizador
    // Se não houver preferência salva (primeiro acesso), aplica o 'default' (Padrão do Sistema)
    // O 'default' agora corresponde ao tema Corporativo UI definido no CSS :root
    const themeToApply = window.currentUserProfile.theme_preference || 'default';
    applyTheme(themeToApply);

    // 4. Aplica permissões ao menu
    applyMenuPermissions(window.currentUserProfile.permissions, window.currentUserProfile.role);

    // [NOVO] Inicia a verificação de notificações
    if (document.getElementById('notification-icon-wrapper')) {
        startNotificationPolling();
    }


    // 5. Carrega a página inicial
    console.log("Dashboard (V14.5): Carregando página inicial (admin_home)...");
    const homeLink = document.querySelector('.sidebar-nav .nav-item[data-page="admin_home"]');
    
    // [CORRIGIDO] Carrega explicitamente o conteúdo da página inicial.
    // Anteriormente, assumia-se que o HTML já estava presente, o que causava o erro de carregamento.
    await loadPage('admin_home', homeLink);

    console.log("Dashboard (V13.1.3): Inicialização concluída com sucesso.");

}); // Fim do DOMContentLoaded