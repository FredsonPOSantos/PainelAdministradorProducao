// Ficheiro: backend/routes/lgpd.js
// Descrição: Define as rotas para a gestão de pedidos de exclusão de dados (LGPD).

const express = require('express');
const router = express.Router();
const { requestExclusion, getExclusionRequests, completeExclusionRequest, searchUsers, deleteUser, getLgpdActivityLogs } = require('../controllers/lgpdController');
const verifyToken = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');

// Rota pública para um utilizador solicitar a exclusão dos seus dados
router.post('/request-exclusion', requestExclusion);

// Rota para administradores (Master/DPO) verem todos os pedidos
router.get('/requests', verifyToken, checkPermission('lgpd.read'), getExclusionRequests);

// Rota para um administrador marcar um pedido como concluído
router.put('/requests/:id/complete', verifyToken, checkPermission('lgpd.update'), completeExclusionRequest);

// Rota para administradores (Master/DPO) pesquisarem utilizadores no hotspot
router.get('/search-users', verifyToken, checkPermission('lgpd.read'), searchUsers);

// Rota para um administrador eliminar um utilizador do hotspot
router.delete('/users/:id', verifyToken, checkPermission('lgpd.delete'), deleteUser);

// [NOVO] Rota para buscar os logs de atividade da página LGPD
router.get('/logs', verifyToken, checkPermission('lgpd.read'), getLgpdActivityLogs);

module.exports = router;
