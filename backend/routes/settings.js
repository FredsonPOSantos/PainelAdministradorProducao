// Ficheiro: backend/routes/settings.js
// [VERSÃO 13.6.1 - PERMISSÕES GRANULARES]

const express = require('express');
const router = express.Router();

const verifyToken = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');
const logoUploadMiddleware = require('../middlewares/logoUploadMiddleware');
// const backgroundUploadMiddleware = require('../middlewares/backgroundUploadMiddleware');
// const loginLogoUploadMiddleware = require('../middlewares/loginLogoUploadMiddleware');
const appearanceUploadMiddleware = require('../middlewares/appearanceUploadMiddleware'); // NOVO
const settingsController = require('../controllers/settingsController');

// --- ROTAS DE CONFIGURAÇÕES GERAIS ---

// Leitura das configurações gerais (PÚBLICA)
router.get(
    '/general',
    settingsController.getGeneralSettings
);

// ROTA UNIFICADA DE APARÊNCIA
router.post(
    '/appearance',
    [
        verifyToken, 
        // [CORRIGIDO] Middleware customizado para verificar uma de duas permissões
        (req, res, next) => {
            if (req.user.permissions['settings.appearance'] || req.user.permissions['settings.login_page']) return next();
            return res.status(403).json({ message: `Acesso negado. Permissão necessária: 'settings.appearance' ou 'settings.login_page'` });
        },
        appearanceUploadMiddleware
    ],
    settingsController.updateAppearanceSettings // NOVA FUNÇÃO DO CONTROLLER
);

// ROTA PARA REPOR AS CONFIGURAÇÕES DE APARÊNCIA
router.put(
    '/appearance/reset',
    [verifyToken, checkPermission('settings.appearance')],
    settingsController.resetAppearanceSettings
);

// [NOVO] ROTA PARA CONFIGURAÇÕES DE SMTP
router.post(
    '/smtp',
    [verifyToken, checkPermission('settings.smtp')],
    settingsController.updateSmtpSettings
);

// [NOVO] ROTA PARA ATUALIZAR AS POLÍTICAS
router.post(
    '/policies',
    [verifyToken, checkPermission('settings.policies')], // Permissão a ser criada
    settingsController.updatePolicies
);

// [NOVO] ROTA PARA CONFIGURAÇÕES DE NOTIFICAÇÕES
router.post(
    '/notifications',
    [verifyToken, checkPermission('settings.smtp')], // Reutiliza permissão de SMTP ou cria nova
    settingsController.updateNotificationSettings
);

// [NOVO] ROTA PARA TESTAR NOTIFICAÇÕES
router.post(
    '/notifications/test',
    [verifyToken, checkPermission('settings.smtp')],
    settingsController.testNotificationSettings
);

// [NOVO] ROTAS PARA GESTÃO DE ARQUIVOS (MEDIA MANAGER)
// Apenas Master deve ter acesso a exclusão permanente de arquivos
router.get(
    '/media',
    [verifyToken, checkPermission('settings.media')], // Permissão sugerida (Master tem acesso total)
    settingsController.listMediaFiles
);

router.delete(
    '/media',
    [verifyToken, checkPermission('settings.media')],
    settingsController.deleteMediaFile
);

// [NOVO] Rota para arquivar e limpar ficheiros (Auditoria)
router.post(
    '/media/archive',
    [verifyToken, checkPermission('settings.media')],
    settingsController.archiveMediaFiles
);



/* ROTAS ANTIGAS - AGORA UNIFICADAS EM /appearance
// Atualização da imagem de fundo
router.post(
    '/background',
    [verifyToken, checkPermission('settings.appearance'), backgroundUploadMiddleware],
    settingsController.updateBackgroundImage
);

// Atualização das configurações de aparência da página de login
router.post(
    '/login-appearance',
    [verifyToken, checkPermission('settings.login_page')],
    settingsController.updateLoginAppearanceSettings
);

// Atualização do logo da página de login
router.post(
    '/login-logo',
    [verifyToken, checkPermission('settings.login_page'), loginLogoUploadMiddleware],
    settingsController.updateLoginLogo
);
*/

// --- ROTAS DE CONFIGURAÇÕES DO PORTAL HOTSPOT ---

// Leitura das configurações do hotspot
router.get(
    '/hotspot',
    verifyToken,
    checkPermission('settings.hotspot.read'),
    settingsController.getHotspotSettings
);

// Atualização das configurações do hotspot
router.post(
    '/hotspot',
    verifyToken,
    checkPermission('settings.hotspot.update'),
    settingsController.updateHotspotSettings
);

module.exports = router;
