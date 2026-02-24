// Ficheiro: backend/routes/logRoutes.js
// Descrição: Define as rotas para a visualização de logs.

const express = require('express');
const router = express.Router();
const logController = require('./logController'); // [CORRIGIDO] Caminho relativo para o controller
const verifyToken = require('../middlewares/authMiddleware');
// [CORRIGIDO] Usa a desestruturação para importar a função 'checkPermission' corretamente.
const { checkPermission } = require('../middlewares/permissionMiddleware');

// Rota para buscar os logs de auditoria (atividade)
router.get('/activity', verifyToken, checkPermission('logs.activity.read'), logController.getAuditLogs);

// Rota para buscar os logs de sistema (erros)
router.get('/system', verifyToken, checkPermission('logs.system.read'), logController.getSystemLogs);

// Rota para buscar os logs de erro offline
router.get('/offline-buffer', verifyToken, checkPermission('logs.system.read'), logController.getOfflineErrorLog);

module.exports = router;