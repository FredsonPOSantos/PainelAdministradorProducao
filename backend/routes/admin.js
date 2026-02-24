// Ficheiro: routes/admin.js
// [VERSÃO 13.6.1 - PERMISSÕES GRANULARES]

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const verifyToken = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');
const adminController = require('../controllers/adminController');

// --- ROTA DE PERFIL ---
router.get('/profile', verifyToken, adminController.getUserProfile);
router.post('/profile/change-own-password', verifyToken, adminController.changeOwnPassword);

// --- ROTAS DE GESTÃO DE UTILIZADORES ---

// Lista todos os utilizadores (Leitura)
router.get('/users', verifyToken, checkPermission('users.read'), adminController.getAllAdminUsers);

// Cria um novo utilizador (Criação)
router.post('/users', verifyToken, checkPermission('users.create'), adminController.createAdminUser);

// Atualiza um utilizador por ID (Atualização)
router.put('/users/:id', verifyToken, checkPermission('users.update'), adminController.updateUser);

// Elimina um utilizador por ID (Deleção)
router.delete('/users/:id', verifyToken, checkPermission('users.delete'), adminController.deleteUser);

// Resetar a senha de um utilizador (Ação Especial, pode ser considerada uma 'Atualização')
router.post('/users/:id/reset-password', verifyToken, checkPermission('users.update'), adminController.resetUserPassword);

// [NOVO] Rotas para permissões individuais
router.get('/users/:id/permissions', verifyToken, checkPermission('permissions.read'), adminController.getUserPermissions);
router.put('/users/:id/permissions', verifyToken, checkPermission('permissions.update'), adminController.updateUserPermissions);

// [NOVO] Rota para ler logs offline (Buffer de Emergência)
router.get('/logs/offline-buffer', verifyToken, checkPermission('logs.system.read'), (req, res) => { // [CORREÇÃO] A rota estava em logRoutes.js, mas faz mais sentido aqui ou numa rota de logs dedicada.
    const logFile = path.join(__dirname, '../logs/offline_events.log');
    if (!fs.existsSync(logFile)) {
        return res.json({ success: true, data: [] });
    }
    
    fs.readFile(logFile, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ message: 'Erro ao ler logs offline.' });
        
        // Converte linhas JSON em array e inverte para mostrar mais recentes primeiro
        const logs = data.trim().split('\n').map(line => {
            try { return JSON.parse(line); } catch (e) { return null; }
        }).filter(l => l !== null).reverse();
        
        res.json({ success: true, data: logs });
    });
});

// [NOVO] Rota para listar utilizadores para menções e atribuições (Simplificada e Acessível)
// Permite que qualquer utilizador autenticado veja a lista básica de colegas.
router.get('/users/mention-list', verifyToken, async (req, res) => {
    try {
        const { pool } = require('../connection');
        // Busca apenas dados públicos necessários para identificação
        const result = await pool.query("SELECT id, email, role, avatar_url FROM admin_users WHERE is_active = true ORDER BY email ASC");
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Erro ao listar utilizadores para menção:', error);
        res.status(500).json({ message: 'Erro ao buscar utilizadores.' });
    }
});

// [NOVO] Rota para criar notificação de menção em um ticket
router.post('/tickets/:ticketId/mention', verifyToken, async (req, res) => {
    const { ticketId } = req.params;
    const { mentionedUserId } = req.body;
    const mentioningUser = req.user;

    if (!mentionedUserId) {
        return res.status(400).json({ message: 'ID do utilizador mencionado é obrigatório.' });
    }

    try {
        const { pool } = require('../connection');
        const { logAction } = require('../services/auditLogService');

        // 1. Buscar o número do ticket para a mensagem
        const ticketResult = await pool.query('SELECT ticket_number FROM tickets WHERE id = $1', [ticketId]);
        if (ticketResult.rowCount === 0) {
            return res.status(404).json({ message: 'Ticket não encontrado.' });
        }
        const ticketNumber = ticketResult.rows[0].ticket_number;

        // 2. Criar a notificação
        const message = `${mentioningUser.email} mencionou você no ticket #${ticketNumber}.`;
        await pool.query(
            `INSERT INTO notifications (user_id, type, message, related_ticket_id) VALUES ($1, 'mention', $2, $3)`,
            [mentionedUserId, message, ticketId]
        );

        res.status(201).json({ success: true, message: 'Notificação de menção criada.' });

    } catch (error) {
        console.error('Erro ao criar notificação de menção:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
});

module.exports = router;
