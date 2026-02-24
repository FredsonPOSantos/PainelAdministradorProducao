// Ficheiro: backend/controllers/publicController.js
// Descrição: Lida com a lógica para endpoints públicos.

const { query } = require('express');
const { pool } = require('../connection');
const { getCampaignPreviewData } = require('../services/campaignService');

/**
 * @description Obtém a campanha ativa, o template e os banners para um roteador específico.
 * Esta é uma rota pública e não requer autenticação.
 * @route GET /api/public/active-campaign?routerName=NOME_DO_ROUTER
 */
const getActiveCampaign = async (req, res) => {
    const { routerName } = req.query;

    if (!routerName) {
        return res.status(400).json({ message: 'O parâmetro routerName é obrigatório.' });
    }

    const client = await pool.connect();
    try {
        // console.log(`[Public API] Recebida solicitação de campanha para o roteador: ${routerName}`);

        // 1. Buscar as configurações gerais do sistema. Elas são úteis em ambos os casos (com ou sem campanha).
        const settingsResult = await client.query('SELECT * FROM system_settings WHERE id = 1');
        const loginPageSettings = settingsResult.rows[0] || {};

        // 2. Encontrar o ID e o group_id do roteador
        const routerResult = await client.query('SELECT id, group_id FROM routers WHERE name = $1', [routerName]);

        if (routerResult.rows.length === 0) {
            // console.log(`[Public API] Roteador '${routerName}' não encontrado. Servindo layout padrão.`);
            return res.status(200).json({ use_default: true, loginPageSettings });
        }

        const router = routerResult.rows[0];

        // 3. Encontrar a campanha ativa com a lógica de prioridade
        const campaignQuery = `
            SELECT *
            FROM campaigns
            WHERE
                is_active = true
                AND CURRENT_DATE BETWEEN start_date AND end_date
                AND (
                    (target_type = 'single_router' AND target_id = $1) OR
                    (target_type = 'group' AND target_id = $2) OR
                    (target_type = 'all')
                )
            ORDER BY
                CASE target_type
                    WHEN 'single_router' THEN 1
                    WHEN 'group' THEN 2
                    WHEN 'all' THEN 3
                    ELSE 4
                END
            LIMIT 1;
        `;
        const campaignResult = await client.query(campaignQuery, [router.id, router.group_id]);

        // 4. Se nenhuma campanha for encontrada, servir o layout padrão
        if (campaignResult.rows.length === 0) {
            // console.log(`[Public API] Nenhuma campanha ativa para '${routerName}'. Servindo layout padrão.`);
            return res.status(200).json({ use_default: true, loginPageSettings });
        }

        const activeCampaign = campaignResult.rows[0];
        // console.log(`[Public API] Campanha ativa encontrada: "${activeCampaign.name}" (ID: ${activeCampaign.id})`);

        // [NOVO] Incrementa o contador de visualizações da campanha.
        // Usamos um `await` aqui para garantir que a atualização ocorra, mas não bloqueamos a resposta ao cliente.
        // O `client.query` é rápido e não deve impactar a performance.
        await client.query('UPDATE campaigns SET view_count = view_count + 1 WHERE id = $1', [activeCampaign.id]);


        // 5. Buscar todos os dados associados à campanha

        // 5.1. Buscar o template e o banner de pré-login associado a ele
        const templateQuery = `
            SELECT 
                t.id, t.name, t.base_model, t.login_type, 
                t.primary_color, t.font_color, t.font_size,
                t.login_background_url, t.logo_url,
                b.image_url AS pre_login_banner_url, 
                b.target_url AS pre_login_target_url
            FROM templates t
            LEFT JOIN banners b ON t.prelogin_banner_id = b.id AND b.type = 'pre-login' AND b.is_active = true
            WHERE t.id = $1;
        `;
        const templateResult = await client.query(templateQuery, [activeCampaign.template_id]);
        if (templateResult.rows.length === 0) {
            console.error(`[Public API] ERRO: Template com ID ${activeCampaign.template_id} não encontrado para a campanha ativa.`);
            return res.status(500).json({ message: 'Erro de configuração: o template da campanha não foi encontrado.' });
        }
        const templateData = templateResult.rows[0];

        // 5.2. Buscar os banners de pós-login
        const postLoginBannersQuery = `
            SELECT 
                cb.placeholder_id,
                b.image_url,
                b.target_url
            FROM campaign_banners cb
            JOIN banners b ON cb.banner_id = b.id
            WHERE cb.campaign_id = $1 AND b.type = 'post-login' AND b.is_active = true;
        `;
        const postLoginBannersResult = await client.query(postLoginBannersQuery, [activeCampaign.id]);

        // 6. Montar o objeto de resposta final
        const responsePayload = {
            use_default: false,
            campaign: {
                id: activeCampaign.id,
                name: activeCampaign.name
            },
            template: {
                name: templateData.name,
                loginType: templateData.login_type,
                // Adicionando os novos campos para o frontend usar
                primaryColor: templateData.primary_color,
                fontColor: templateData.font_color,
                fontSize: templateData.font_size,
                backgroundUrl: templateData.login_background_url,
                logoUrl: templateData.logo_url
            },
            preLoginBanner: templateData.pre_login_banner_url ? {
                imageUrl: templateData.pre_login_banner_url,
                targetUrl: templateData.pre_login_target_url
            } : null,
            postLoginBanners: postLoginBannersResult.rows.map(b => ({ placeholderId: b.placeholder_id, imageUrl: b.image_url, targetUrl: b.target_url })),
            loginPageSettings: loginPageSettings
        };

        res.status(200).json(responsePayload);

    } catch (error) {
        console.error(`[Public API] Erro ao buscar campanha para ${routerName}:`, error);
        res.status(500).json({ message: 'Erro interno do servidor ao processar a solicitação.' });
    } finally {
        if (client) {
            client.release();
        }
    }
};

/**
 * @description Obtém os dados de pré-visualização de uma campanha.
 * @route GET /api/public/campaign-preview?campaignId=ID
 */
const getCampaignPreview = async (req, res) => {
    const { campaignId } = req.query;
    if (!campaignId) {
        return res.status(400).json({ message: 'Campaign ID is required' });
    }
    try {
        const campaignData = await getCampaignPreviewData(campaignId);
        res.json(campaignData);
    } catch (error) {
        console.error('Erro ao buscar preview da campanha:', error);
        res.status(500).json({ message: 'Erro interno ao gerar preview.' });
    }
};

module.exports = {
    getActiveCampaign,
    getCampaignPreview
};