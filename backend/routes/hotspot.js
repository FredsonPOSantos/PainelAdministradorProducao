// Ficheiro: routes/hotspot.js
// [VERSÃO 13.6.1 - PERMISSÕES GRANULARES]

const express = require('express');
const router = express.Router();
const hotspotController = require('../controllers/hotspotController');
const verifyToken = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');

// Rota para pesquisar utilizadores do hotspot
router.get(
    '/users',
    [verifyToken, checkPermission('hotspot.read')],
    hotspotController.searchUsers
);

// Rota para obter a contagem total de utilizadores do hotspot
router.get(
    '/total-users',
    [verifyToken, checkPermission('dashboard.read')], // Acesso geral de dashboard
    hotspotController.getTotalHotspotUsers
);

// [NOVO] Rota para estatísticas do relatório completo (Gráfico + Tabela)
router.get(
    '/report-stats',
    [verifyToken, checkPermission('hotspot.read')],
    hotspotController.getHotspotReportStats
);

module.exports = router;
