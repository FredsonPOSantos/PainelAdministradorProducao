// Ficheiro: routes/routers.js
// [VERSÃO 13.6.1 - PERMISSÕES GRANULARES]

const express = require('express');
const router = express.Router();

console.log('[ROUTERS] Carregando rotas de roteadores...'); // [DEBUG] Confirma carregamento

const verifyToken = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');
const routerController = require('../controllers/routerController');

// --- ROTAS DE ROTEADORES INDIVIDUAIS ---
router.get('/', verifyToken, checkPermission('routers.read'), routerController.getAllRouters);
router.put('/:id', verifyToken, checkPermission('routers.update'), routerController.updateRouter);
router.delete('/:id', verifyToken, checkPermission('routers.delete'), routerController.deleteRouter);

// [NOVO] Rota para relatório detalhado de roteadores (Disponibilidade e Histórico)
router.get('/report', verifyToken, checkPermission('routers.read'), routerController.getRouterReport);

// [NOVO] Rota para relatório de Uptime por período (Central de Relatórios)
router.get('/uptime-report', verifyToken, checkPermission('routers.read'), routerController.getRouterUptimeReport);

// [NOVO] Rota para exclusão permanente de um roteador
router.delete('/:id/permanent', verifyToken, checkPermission('routers.individual.delete_permanent'), routerController.deleteRouterPermanently);

// --- ROTA DE VERIFICAÇÃO DE STATUS ---
router.post('/:id/ping', verifyToken, checkPermission('routers.read'), routerController.checkRouterStatus);

// [NOVO] Rota para reiniciar o roteador
router.post('/:id/reboot', verifyToken, checkPermission('routers.reboot'), routerController.rebootRouter);

// [NOVO] Rotas para buscar dados de clientes em tempo real do MikroTik
router.post('/:id/dhcp-leases', verifyToken, checkPermission('routers.dashboard.clients'), routerController.getDhcpLeases);
router.post('/:id/wifi-clients', verifyToken, checkPermission('routers.dashboard.clients'), routerController.getWifiClients);
router.post('/:id/hotspot-active', verifyToken, checkPermission('routers.dashboard.clients'), routerController.getHotspotActive);

// [NOVO] Rotas de Gestão Avançada (Kick, Diagnóstico, Hardware, Backup)
router.post('/:id/kick-client', verifyToken, checkPermission('routers.update'), routerController.kickClient);
router.post('/:id/diagnostics', verifyToken, checkPermission('routers.read'), routerController.runDiagnostics);
router.post('/:id/hardware-health', verifyToken, checkPermission('routers.read'), routerController.getHardwareHealth);
router.post('/:id/backups', verifyToken, checkPermission('routers.update'), routerController.manageBackups);

// [NOVO] Rotas de Gestão Extrema e Wi-Fi
router.post('/:id/wifi-config', verifyToken, checkPermission('routers.update'), routerController.manageWifi);
router.post('/:id/reset-config', verifyToken, checkPermission('routers.update'), routerController.resetRouterConfig);

// [NOVO] Rota para obter o status de todos os roteadores para a página de monitoramento
router.get('/status', verifyToken, checkPermission('routers.monitoring.read'), routerController.getRoutersStatus);

// --- ROTAS DE DETEÇÃO AUTOMÁTICA ---
router.get('/discover', verifyToken, checkPermission('routers.create'), routerController.discoverNewRouters);
router.post('/batch-add', verifyToken, checkPermission('routers.create'), routerController.batchAddRouters);

// --- ROTAS DE GRUPOS DE ROTEADORES ---
router.get('/groups', verifyToken, checkPermission('routers.read'), routerController.getAllRouterGroups);
router.post('/groups', verifyToken, checkPermission('routers.create'), routerController.createRouterGroup);
router.put('/groups/:id', verifyToken, checkPermission('routers.update'), routerController.updateRouterGroup);
router.delete('/groups/:id', verifyToken, checkPermission('routers.delete'), routerController.deleteRouterGroup);

// [NOVO] Rota para obter a distribuição de utilizadores por roteador dentro de um grupo
router.get('/groups/:id/user-distribution', verifyToken, checkPermission('analytics.read'), routerController.getRouterGroupUserDistribution);

module.exports = router;
