// Ficheiro: backend/controllers/settingsController.js
// Descrição: Lida com a lógica de GESTÃO de configurações do sistema.

const { pool } = require('../connection');
const path = require('path');
const fs = require('fs'); // Para lidar com caminhos de ficheiro e remoção
const archiver = require('archiver'); // [NOVO] Para criar arquivos ZIP
const sanitizeHtmlLib = require('sanitize-html'); // [SEGURANÇA] Biblioteca robusta de sanitização
const { logAction } = require('../services/auditLogService');

// --- FASE 2.3: Configurações Gerais ---

/**
 * Obtém as configurações gerais (Nome, Logo, Cor)
 */
const getGeneralSettings = async (req, res) => {
    try {
        const settings = await pool.query(
            'SELECT company_name, logo_url, primary_color, background_color, font_color, font_family, font_size, background_image_url, modal_background_color, modal_font_color, modal_border_color, sidebar_color, login_background_color, login_form_background_color, login_font_color, login_button_color, login_logo_url, email_host, email_port, email_secure, email_user, email_from, nav_title_color, label_color, placeholder_color, tab_link_color, tab_link_active_color, terms_content, marketing_policy_content, admin_session_timeout, loader_enabled, loader_timeout FROM system_settings WHERE id = 1'
        ); 

        if (settings.rows.length === 0) {
            console.warn("getGeneralSettings: Nenhuma configuração encontrada (ID 1 não existe?).");
            // Isso não deve acontecer se a Etapa 1 (database_setup.sql) foi executada
            return res.status(404).json({ message: "Configurações do sistema não encontradas." });
        }
        // console.log("getGeneralSettings: Configurações encontradas:", settings.rows[0]);
        res.json(settings.rows[0]);

    } catch (error) {
        console.error('Erro ao buscar configurações gerais:', error);
        res.status(500).json({ message: 'Erro interno do servidor ao buscar configurações.' });
    }
};

const updateBackgroundImage = async (req, res) => {
    const newBackgroundImageFile = req.file;

    try {
        if (newBackgroundImageFile) {
            const relativePath = path.relative('public', newBackgroundImageFile.path);
            const backgroundImageUrlForDB = '/' + relativePath.replace(/\\/g, '/');

            const updateQuery = `UPDATE system_settings SET background_image_url = $1 WHERE id = 1 RETURNING *`;
            const updatedSettings = await pool.query(updateQuery, [backgroundImageUrlForDB]);

            if (updatedSettings.rows.length === 0) {
                console.error("updateBackgroundImage: Falha ao atualizar, linha ID 1 não encontrada?");
                throw new Error("Falha ao encontrar o registo de configurações para atualizar.");
            }

            // console.log("updateBackgroundImage: Configurações atualizadas no DB:", updatedSettings.rows[0]);

            await logAction({
                req,
                action: 'SETTINGS_UPDATE_BACKGROUND',
                status: 'SUCCESS',
                description: `Utilizador "${req.user.email}" atualizou a imagem de fundo.`,
                target_type: 'settings'
            });

            res.status(200).json({
                message: "Imagem de fundo atualizada com sucesso!",
                settings: updatedSettings.rows[0]
            });
        } else {
            res.status(400).json({
                message: "Nenhum ficheiro enviado."
            });
        }
    } catch (error) {
        await logAction({
            req,
            action: 'SETTINGS_UPDATE_BACKGROUND_FAILURE',
            status: 'FAILURE',
            description: `Falha ao atualizar a imagem de fundo. Erro: ${error.message}`,
            target_type: 'settings',
            details: { error: error.message }
        });

        console.error('Erro ao atualizar imagem de fundo:', error);
        res.status(500).json({ message: error.message || 'Erro interno do servidor ao atualizar imagem de fundo.' });
    }
};


// --- FASE 2.4: Configurações do Portal Hotspot ---
// (Já incluídas aqui para eficiência, pois usam a mesma tabela)

/**
 * Obtém as configurações do Hotspot (Timeout, Whitelist)
 */
const getHotspotSettings = async (req, res) => {
    try {
        const settings = await pool.query(
            'SELECT session_timeout_minutes, domain_whitelist FROM system_settings WHERE id = 1'
        );

        if (settings.rows.length === 0) {
             console.warn("getHotspotSettings: Nenhuma configuração encontrada (ID 1 não existe?).");
            return res.status(404).json({ message: "Configurações do hotspot não encontradas." });
        }
        res.json(settings.rows[0]);
    } catch (error) {
        console.error('Erro ao buscar configs do hotspot:', error);
        res.status(500).json({ message: 'Erro interno do servidor ao buscar configs do hotspot.' });
    }
};

/**
 * Atualiza as configurações do Hotspot (Timeout, Whitelist)
 * Espera 'application/json'
 */
const updateHotspotSettings = async (req, res) => {
    // Estes dados vêm de um JSON (application/json)
    const { sessionTimeoutMinutes, domainWhitelist } = req.body;

    // --- Validação Robusta ---
    if (domainWhitelist === undefined || sessionTimeoutMinutes === undefined) {
         console.warn("updateHotspotSettings: Dados inválidos - faltam campos.");
         return res.status(400).json({ message: 'Dados inválidos. Timeout e Whitelist (mesmo vazia []) são obrigatórios.' });
    }
    // Whitelist DEVE ser um array
    if (!Array.isArray(domainWhitelist)) {
         console.warn("updateHotspotSettings: Whitelist não é um array.");
        return res.status(400).json({ message: 'Whitelist deve ser um array (lista) de domínios.' });
    }
    // Timeout deve ser um número positivo (ou null/0 para desativar, se aplicável - aqui exigimos > 0)
    const timeoutNum = parseInt(sessionTimeoutMinutes, 10);
    if (isNaN(timeoutNum) || timeoutNum <= 0) {
         console.warn("updateHotspotSettings: Timeout inválido:", sessionTimeoutMinutes);
        return res.status(400).json({ message: 'O tempo de sessão deve ser um número inteiro positivo (maior que zero).' });
    }
    // Validação extra: Limpar e validar cada domínio na whitelist (opcional, mas bom)
    const cleanedWhitelist = domainWhitelist
        .map(domain => domain.trim().toLowerCase()) // Limpa e padroniza
        .filter(domain => domain.length > 0 && domain.includes('.')); // Filtra vazios ou inválidos
        // TODO: Poderia adicionar validação de formato de domínio mais estrita aqui (regex)
    // console.log("updateHotspotSettings: Whitelist após limpeza:", cleanedWhitelist);

    // --- Executa a Atualização ---
    try {
        const query = `
            UPDATE system_settings
            SET session_timeout_minutes = $1, domain_whitelist = $2
            WHERE id = 1
            RETURNING session_timeout_minutes, domain_whitelist
        `;
        const updatedSettings = await pool.query(query, [timeoutNum, cleanedWhitelist]);

        if (updatedSettings.rows.length === 0) {
             console.error("updateHotspotSettings: Falha ao atualizar, linha ID 1 não encontrada?");
             throw new Error("Falha ao encontrar o registo de configurações para atualizar.");
        }

        // console.log("updateHotspotSettings: Configs do Hotspot atualizadas no DB:", updatedSettings.rows[0]);

        await logAction({
            req,
            action: 'SETTINGS_UPDATE_HOTSPOT',
            status: 'SUCCESS',
            description: `Utilizador "${req.user.email}" atualizou as configurações do hotspot.`,
            target_type: 'settings'
        });

        res.status(200).json({
            message: "Configurações do Hotspot atualizadas com sucesso!",
            settings: updatedSettings.rows[0] // Retorna os dados atualizados
        });
    } catch (error) {
        await logAction({
            req,
            action: 'SETTINGS_UPDATE_HOTSPOT_FAILURE',
            status: 'FAILURE',
            description: `Falha ao atualizar as configurações do hotspot. Erro: ${error.message}`,
            target_type: 'settings',
            details: { error: error.message }
        });

        console.error('Erro ao atualizar configs do hotspot:', error);
    }
};

const updateLoginAppearanceSettings = async (req, res) => {
    const { login_background_color, login_form_background_color, login_font_color, login_button_color } = req.body;

    try {
        const params = [];
        const fields = [];
        let queryIndex = 1;

        if (login_background_color) {
            fields.push(`login_background_color = $${queryIndex++}`);
            params.push(login_background_color);
        }
        if (login_form_background_color) {
            fields.push(`login_form_background_color = $${queryIndex++}`);
            params.push(login_form_background_color);
        }
        if (login_font_color) {
            fields.push(`login_font_color = $${queryIndex++}`);
            params.push(login_font_color);
        }
        if (login_button_color) {
            fields.push(`login_button_color = $${queryIndex++}`);
            params.push(login_button_color);
        }

        if (fields.length > 0) {
            const updateQuery = `UPDATE system_settings SET ${fields.join(', ')} WHERE id = 1 RETURNING *`;
            const updatedSettings = await pool.query(updateQuery, params);

            if (updatedSettings.rows.length === 0) {
                throw new Error("Falha ao encontrar o registo de configurações para atualizar.");
            }

            await logAction({
                req,
                action: 'SETTINGS_UPDATE_LOGIN_APPEARANCE',
                status: 'SUCCESS',
                description: `Utilizador "${req.user.email}" atualizou a aparência da página de login.`,
                target_type: 'settings'
            });

            res.status(200).json({
                message: "Configurações de aparência da página de login atualizadas com sucesso!",
                settings: updatedSettings.rows[0]
            });
        } else {
            res.status(200).json({
                message: "Nenhuma alteração detectada nas configurações de aparência da página de login."
            });
        }
    } catch (error) {
        await logAction({
            req,
            action: 'SETTINGS_UPDATE_LOGIN_APPEARANCE_FAILURE',
            status: 'FAILURE',
            description: `Falha ao atualizar a aparência da página de login. Erro: ${error.message}`,
            target_type: 'settings',
            details: { error: error.message }
        });

        console.error('Erro ao atualizar configurações de aparência da página de login:', error);
        res.status(500).json({ message: error.message || 'Erro interno do servidor ao atualizar configurações.' });
    }
};

const updateLoginLogo = async (req, res) => {
    const newLoginLogoFile = req.file;

    try {
        if (newLoginLogoFile) {
            const relativePath = path.relative('public', newLoginLogoFile.path);
            const loginLogoUrlForDB = '/' + relativePath.replace(/\\/g, '/');

            const updateQuery = `UPDATE system_settings SET login_logo_url = $1 WHERE id = 1 RETURNING *`;
            const updatedSettings = await pool.query(updateQuery, [loginLogoUrlForDB]);

            if (updatedSettings.rows.length === 0) {
                console.error("updateLoginLogo: Falha ao atualizar, linha ID 1 não encontrada?");
                throw new Error("Falha ao encontrar o registo de configurações para atualizar.");
            }

            // console.log("updateLoginLogo: Configurações atualizadas no DB:", updatedSettings.rows[0]);

            await logAction({
                req,
                action: 'SETTINGS_UPDATE_LOGIN_LOGO',
                status: 'SUCCESS',
                description: `Utilizador "${req.user.email}" atualizou o logo da página de login.`,
                target_type: 'settings'
            });

            res.status(200).json({
                message: "Logo da página de login atualizado com sucesso!",
                settings: updatedSettings.rows[0]
            });
        } else {
            res.status(400).json({
                message: "Nenhum ficheiro enviado."
            });
        }
    } catch (error) {
        await logAction({
            req,
            action: 'SETTINGS_UPDATE_LOGIN_LOGO_FAILURE',
            status: 'FAILURE',
            description: `Falha ao atualizar o logo da página de login. Erro: ${error.message}`,
            target_type: 'settings',
            details: { error: error.message }
        });

        console.error('Erro ao atualizar o logo da página de login:', error);
        res.status(500).json({ message: error.message || 'Erro interno do servidor ao atualizar o logo.' });
    }
};

const updateAppearanceSettings = async (req, res) => {
    try {
        
        const updates = {};
        const files = req.files || {};

        // Processar ficheiros enviados
        if (files.companyLogo?.[0]) {
            updates.logo_url = '/uploads/logos/' + files.companyLogo[0].filename;
        }
        if (files.loginLogo?.[0]) {
            updates.login_logo_url = '/uploads/logos/' + files.loginLogo[0].filename;
        }
        if (files.backgroundImage?.[0]) {
            updates.background_image_url = '/uploads/background/' + files.backgroundImage[0].filename;
        }

        // Processar demais campos
        const fields = [
            'primary_color',
            'background_color',
            'sidebar_color',
            'font_color',
            'font_family',
            'font_size',
            'modal_background_color',
            'modal_font_color',
            'modal_border_color',
            'login_background_color',
            'login_form_background_color',
            'login_font_color',
            'login_button_color',
            'company_name',
            // [NOVO] Adiciona os novos campos de navegação e tipografia
            'nav_title_color',
            'label_color',
            'placeholder_color',
            'tab_link_color',
            'tab_link_active_color',
            'admin_session_timeout', // [NOVO] Campo para tempo de inatividade
            'loader_enabled', // [NOVO] Ativar/Desativar Loader
            'loader_timeout'  // [NOVO] Tempo limite do loader
        ];

        fields.forEach(field => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        // Processar remoção de imagens
        if (req.body.removeBackgroundImage === 'true') {
            updates.background_image_url = null;
        }
        if (req.body.removeLoginLogo === 'true') {
            updates.login_logo_url = null;
        }

        // Se não houver atualizações, retorne erro
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Nenhuma atualização fornecida'
            });
        }

        // Construir a query dinamicamente
        const setClause = Object.keys(updates)
            .map((key, i) => `${key} = $${i + 1}`)
            .join(', ');
        
        const query = `
            UPDATE system_settings 
            SET ${setClause}
            WHERE id = 1
            RETURNING *
        `;

        const result = await pool.query(query, Object.values(updates));

        if (result.rows.length === 0) {
            throw new Error('Nenhuma configuração encontrada para atualizar');
        }

        res.json({
            success: true,
            message: 'Configurações de aparência atualizadas com sucesso',
            settings: result.rows[0]
        });

    } catch (error) {
        console.error('Erro ao atualizar configurações de aparência:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar configurações',
            error: error.message
        });
    }
};

const resetAppearanceSettings = async (req, res) => {
    try {
        // [MODIFICADO] Define os valores padrão do novo tema "Corporativo UI" (Slate/Blue)
        const defaults = {
            primary_color: '#3b82f6',           // Blue 500
            background_color: '#0f172a',        // Slate 900 (Fundo Principal)
            sidebar_color: '#1e293b',           // Slate 800 (Sidebar/Cards)
            font_color: '#f8fafc',              // Slate 50 (Texto Principal)
            font_family: "'Inter', sans-serif",
            font_size: 14,
            modal_background_color: '#1e293b',  // Slate 800
            modal_font_color: '#f8fafc',        // Slate 50
            modal_border_color: '#334155',      // Slate 700
            login_background_color: '#0f172a',  // Slate 900
            login_form_background_color: '#1e293b', // Slate 800
            login_font_color: '#f8fafc',
            login_button_color: '#3b82f6',      // Blue 500
            nav_title_color: '#94a3b8',         // Slate 400
            label_color: '#e2e8f0',             // Slate 200
            placeholder_color: '#64748b',       // Slate 500
            tab_link_color: '#94a3b8',          // Slate 400
            tab_link_active_color: '#3b82f6',   // Blue 500
            // Resetar imagens para o padrão (null)
            logo_url: null,
            login_logo_url: null,
            background_image_url: null
        };

        const fields = Object.keys(defaults);
        const values = Object.values(defaults);

        // Constrói a query UPDATE dinamicamente
        const setClauses = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
        
        const updateQuery = `UPDATE system_settings SET ${setClauses} WHERE id = 1 RETURNING *`;

        const { rows } = await pool.query(updateQuery, values);

        await logAction({
            req,
            action: 'SETTINGS_RESET_APPEARANCE',
            status: 'SUCCESS',
            description: `Utilizador "${req.user.email}" repôs as configurações de aparência para o padrão do sistema (Corporativo UI).`,
        });

        res.status(200).json({
            message: "Configurações de aparência repostas com sucesso!",
            settings: rows[0]
        });

    } catch (error) {
        console.error('Erro ao repor as configurações de aparência:', error);
        await logAction({
            req,
            action: 'SETTINGS_RESET_APPEARANCE_FAILURE',
            status: 'FAILURE',
            description: `Falha ao repor as configurações de aparência. Erro: ${error.message}`,
        });
        res.status(500).json({ message: 'Erro interno do servidor ao repor as configurações.' });
    }
};

/**
 * [NOVO] Atualiza as configurações de SMTP.
 */
const updateSmtpSettings = async (req, res) => {
    const {
        email_host,
        email_port,
        email_user,
        email_pass, // Pode vir vazio
        email_from,
        email_secure
    } = req.body;

    const updates = {};

    // Adiciona campos ao objeto de atualização apenas se foram fornecidos
    if (email_host !== undefined) updates.email_host = email_host;
    if (email_port !== undefined) updates.email_port = email_port;
    if (email_user !== undefined) updates.email_user = email_user;
    if (email_from !== undefined) updates.email_from = email_from;
    // O checkbox envia 'on' ou 'undefined', então convertemos para booleano
    updates.email_secure = !!email_secure;

    // Apenas atualiza a senha se uma nova foi fornecida
    if (email_pass) {
        updates.email_pass = email_pass;
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: 'Nenhuma configuração para atualizar foi fornecida.' });
    }

    try {
        const setClause = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`).join(', ');
        const query = `UPDATE system_settings SET ${setClause} WHERE id = 1 RETURNING *`;
        const values = Object.values(updates);

        const result = await pool.query(query, values);

        await logAction({
            req,
            action: 'SETTINGS_UPDATE_SMTP',
            status: 'SUCCESS',
            description: `Utilizador "${req.user.email}" atualizou as configurações de SMTP.`,
        });

        res.json({
            success: true,
            message: 'Configurações de SMTP atualizadas com sucesso!',
            settings: result.rows[0]
        });

    } catch (error) {
        console.error('Erro ao atualizar configurações de SMTP:', error.message);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar as configurações de SMTP.' });
    }
};

/**
 * [NOVO] Atualiza os textos das políticas.
 */
const updatePolicies = async (req, res) => {
    const { terms_content, marketing_policy_content } = req.body;

    // [SEGURANÇA] Sanitização robusta permitindo formatação rica mas removendo scripts (XSS)
    const sanitizeHtml = (html) => {
        if (!html) return null;
        return sanitizeHtmlLib(html, {
            allowedTags: sanitizeHtmlLib.defaults.allowedTags.concat(['img', 'h1', 'h2', 'span', 'div', 'u', 's']),
            allowedAttributes: {
                ...sanitizeHtmlLib.defaults.allowedAttributes,
                '*': ['style', 'class', 'align'],
                'img': ['src', 'alt', 'width', 'height']
            },
            allowedSchemes: ['http', 'https', 'mailto', 'tel']
        });
    };

    const sanitizedTerms = sanitizeHtml(terms_content);
    const sanitizedMarketing = sanitizeHtml(marketing_policy_content);

    try {
        const query = `
            UPDATE system_settings 
            SET terms_content = $1, marketing_policy_content = $2 
            WHERE id = 1 
            RETURNING *`;
        
        const result = await pool.query(query, [sanitizedTerms, sanitizedMarketing]);

        await logAction({
            req,
            action: 'SETTINGS_UPDATE_POLICIES',
            status: 'SUCCESS',
            description: `Utilizador "${req.user.email}" atualizou os textos das políticas.`,
        });

        res.json({ success: true, message: 'Políticas atualizadas com sucesso!', settings: result.rows[0] });

    } catch (error) {
        console.error('Erro ao atualizar políticas:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar as políticas.' });
    }
};

// --- FASE 4: Gestão de Arquivos (Media Manager) ---

/**
 * [NOVO] Lista ficheiros de mídia de uma pasta específica.
 */
const listMediaFiles = async (req, res) => {
    const { type } = req.query;
    
    let candidates = [];

    // Define prioridades de busca para lidar com diferenças de estrutura (Local vs Root) e maiúsculas/minúsculas
    switch (type) {
        case 'backgrounds':
            candidates = [
                { path: '../../public/uploads/background', urlSegment: 'background' }, // [CORREÇÃO] Caminho relativo correto para a raiz
                { path: '../../public/uploads/Background', urlSegment: 'Background' },
                { path: '../public/uploads/background', urlSegment: 'background' }
            ];
            break;
        case 'hotspot_backgrounds':
            candidates = [
                { path: '../../public/uploads/Background_hotspot', urlSegment: 'Background_hotspot' },
                { path: '../public/uploads/Background_hotspot', urlSegment: 'Background_hotspot' }
            ];
            break;
        case 'banners':
            candidates = [
                { path: '../../public/uploads/banners', urlSegment: 'banners' },
                { path: '../public/uploads/banners', urlSegment: 'banners' }
            ];
            break;
        case 'logos':
            candidates = [
                { path: '../../public/uploads/logos', urlSegment: 'logos' },
                { path: '../public/uploads/logos', urlSegment: 'logos' }
            ];
            break;
        case 'hotspot_logos':
            candidates = [
                { path: '../../public/uploads/logo_hotspot', urlSegment: 'logo_hotspot' },
                { path: '../public/uploads/logo_hotspot', urlSegment: 'logo_hotspot' }
            ];
            break;
        case 'ticket_attachments':
            candidates = [
                { path: '../public/uploads/ticket_attachments', urlSegment: 'ticket_attachments' },
                { path: '../../public/uploads/ticket_attachments', urlSegment: 'ticket_attachments' }
            ];
            break;
        default:
            return res.status(400).json({ message: 'Tipo de mídia inválido.' });
    }

    let allFiles = [];
    const processedFiles = new Set();

    try {
        for (const cand of candidates) {
            const absolutePath = path.join(__dirname, cand.path);
            
            if (fs.existsSync(absolutePath)) {
                try {
                    const files = fs.readdirSync(absolutePath);
                    
                    let allowedExtensions = /\.(jpg|jpeg|png|gif|svg|webp)$/i;
                    if (type === 'ticket_attachments') {
                        allowedExtensions = /\.(jpg|jpeg|png|gif|svg|webp|pdf|doc|docx|txt|zip|rar|7z|csv|xls|xlsx)$/i;
                    }

                    files.forEach(file => {
                        if (allowedExtensions.test(file) && !processedFiles.has(file)) {
                            processedFiles.add(file);
                            allFiles.push({
                                name: file,
                                url: `/uploads/${cand.urlSegment}/${file}`
                            });
                        }
                    });
                } catch (e) {
                    console.error(`Erro ao ler diretório ${absolutePath}:`, e.message);
                }
            }
        }

        res.json({ success: true, data: allFiles });
    } catch (error) {
        console.error('Erro ao listar arquivos de mídia:', error);
        res.status(500).json({ message: 'Erro interno ao listar arquivos.' });
    }
};

/**
 * [NOVO] Elimina permanentemente um ficheiro de mídia.
 */
const deleteMediaFile = async (req, res) => {
    const { type, filename } = req.body;
    let folderPath = '';

    switch (type) {
        case 'banners': folderPath = '../../public/uploads/banners'; break;
        case 'backgrounds': folderPath = '../../public/uploads/background'; break; // [CORRIGIDO]
        case 'hotspot_backgrounds': folderPath = '../../public/uploads/Background_hotspot'; break; // [NOVO]
        case 'logos': folderPath = '../../public/uploads/logos'; break; // [CORRIGIDO]
        case 'hotspot_logos': folderPath = '../../public/uploads/logo_hotspot'; break; // [NOVO]
        case 'ticket_attachments': folderPath = '../public/uploads/ticket_attachments'; break; // [NOVO]
        default: return res.status(400).json({ message: 'Tipo de mídia inválido.' });
    }

    const absolutePath = path.join(__dirname, folderPath, filename);

    try {
        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
            
            await logAction({
                req,
                action: 'MEDIA_DELETE_PERMANENT',
                status: 'SUCCESS',
                description: `Utilizador "${req.user.email}" eliminou permanentemente o ficheiro "${filename}" (${type}).`,
                target_type: 'file',
                details: { filename, type }
            });

            res.json({ success: true, message: 'Ficheiro eliminado permanentemente.' });
        } else {
            res.status(404).json({ message: 'Ficheiro não encontrado no disco.' });
        }
    } catch (error) {
        console.error('Erro ao eliminar arquivo de mídia:', error);
        res.status(500).json({ message: 'Erro interno ao eliminar arquivo.' });
    }
};

/**
 * [NOVO] Arquiva ficheiros de mídia em ZIP e limpa a pasta original.
 * Focado em 'ticket_attachments' para auditoria.
 */
const archiveMediaFiles = async (req, res) => {
    const { type } = req.body;

    if (type !== 'ticket_attachments') {
        return res.status(400).json({ message: 'Apenas anexos de tickets suportam arquivamento em lote.' });
    }

    const sourceDir = path.join(__dirname, '../public/uploads/ticket_attachments');
    const archiveDir = path.join(__dirname, '../public/uploads/archives');

    // Garante que a pasta de arquivos existe
    if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
    }

    try {
        // Verifica se há ficheiros para arquivar
        const files = fs.readdirSync(sourceDir).filter(file => {
            // [CORREÇÃO] Expande a lista de extensões para incluir todos os tipos suportados (igual ao listMediaFiles)
            return fs.lstatSync(path.join(sourceDir, file)).isFile() && /\.(jpg|jpeg|png|gif|svg|webp|pdf|doc|docx|txt|zip|rar|7z|csv|xls|xlsx)$/i.test(file);
        });

        if (files.length === 0) {
            return res.status(400).json({ message: 'Não há ficheiros para arquivar nesta pasta.' });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archiveName = `tickets_audit_${timestamp}.zip`;
        const archivePath = path.join(archiveDir, archiveName);

        // Cria o stream de escrita
        const output = fs.createWriteStream(archivePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', async () => {
            console.log(`[ARCHIVE] Arquivo criado: ${archiveName} (${archive.pointer()} bytes)`);
            
            // Após criar o ZIP com sucesso, apaga os ficheiros originais
            files.forEach(file => fs.unlinkSync(path.join(sourceDir, file)));

            await logAction({
                req,
                action: 'MEDIA_ARCHIVE_BATCH',
                status: 'SUCCESS',
                description: `Utilizador "${req.user.email}" arquivou e limpou ${files.length} anexos de tickets. Arquivo: ${archiveName}`,
                target_type: 'file_archive',
                details: { archiveName, fileCount: files.length }
            });

            res.json({ success: true, message: `Sucesso! ${files.length} ficheiros arquivados em "${archiveName}" e removidos da pasta principal.` });
        });

        archive.on('error', (err) => { throw err; });
        archive.pipe(output);
        archive.directory(sourceDir, false); // Adiciona os ficheiros da pasta ao ZIP
        archive.finalize();

    } catch (error) {
        console.error('Erro ao arquivar mídia:', error);
        res.status(500).json({ message: 'Erro interno ao processar arquivamento.' });
    }
};

// Exporta todas as funções do controller
module.exports = {
    getGeneralSettings,
    getHotspotSettings,
    updateHotspotSettings,
    updateAppearanceSettings, // EXPORTA A NOVA FUNÇÃO
    resetAppearanceSettings,
    updateSmtpSettings, // EXPORTA A NOVA FUNÇÃO
    updatePolicies, // [NOVO] EXPORTA A NOVA FUNÇÃO
    listMediaFiles, // [NOVO]
    deleteMediaFile, // [NOVO]
    archiveMediaFiles // [NOVO]
};
