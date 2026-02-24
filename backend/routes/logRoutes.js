// Ficheiro: backend/routes/logRoutes.js
// Descrição: Define as rotas para a visualização de logs.

const express = require('express');
const router = express.Router();
const logController = require('../controllers/logController');
const verifyToken = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');

// Rota para buscar os logs de auditoria
// Rota para buscar os logs de auditoria (atividade)
router.get('/activity', verifyToken, checkPermission('logs.activity.read'), logController.getAuditLogs);

// Rota para buscar os logs de sistema (erros)
router.get('/system', verifyToken, checkPermission('logs.system.read'), logController.getSystemLogs);

// Rota para buscar os logs de erro offline
router.get('/offline-buffer', verifyToken, checkPermission('logs.system.read'), logController.getOfflineErrorLog);

// [NOVO] Rotas para gestão de arquivos de relatório (Arquivos JSON)
router.get('/archives', verifyToken, checkPermission('logs.system.read'), logController.listArchivedReports);

// [NOVO] Rota para baixar um relatório específico
router.get('/archives/:filename', verifyToken, checkPermission('logs.system.read'), logController.downloadArchivedReport);

// [NOVO] Rota para excluir um relatório específico
router.delete('/archives/:filename', verifyToken, checkPermission('files.delete'), logController.deleteArchivedReport);

module.exports = router;