// Ficheiro: backend/routes/dashboard.js
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const verifyToken = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');

// Rotas do Dashboard
router.get('/stats', verifyToken, checkPermission('dashboard.read'), dashboardController.getDashboardStats);
router.get('/analytics', verifyToken, checkPermission('analytics.read'), dashboardController.getAnalyticsStats);
router.get('/health', verifyToken, checkPermission('system_health.read'), dashboardController.getSystemHealth); // Garante que esta rota existe
router.get('/router-users', verifyToken, checkPermission('routers.read'), dashboardController.getRouterUsers);

// [NOVO] Rotas de Detalhes Analíticos
router.get('/analytics/campaigns', verifyToken, checkPermission('analytics.details.campaigns'), dashboardController.getCampaignsAnalytics);
router.get('/analytics/server-health', verifyToken, checkPermission('analytics.details.server_health'), dashboardController.getServerHealthAnalytics);

module.exports = router;