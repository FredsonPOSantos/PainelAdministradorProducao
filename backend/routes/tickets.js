// Ficheiro: backend/routes/tickets.js
// Descrição: Define as rotas da API para o sistema de tickets.

const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const verifyToken = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');
const ticketAttachmentUploadMiddleware = require('../middlewares/ticketAttachmentUploadMiddleware');

const uploadTicketAttachment = (req, res, next) => {
    ticketAttachmentUploadMiddleware.single('file')(req, res, (err) => {
        if (!err) return next();
        const message = err.message || 'Erro ao enviar anexo.';
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ success: false, message });
    });
};

// Todas as rotas de tickets requerem autenticação
router.use(verifyToken);

// Criar um novo ticket
router.post('/', ticketController.createTicket); // Não precisa de permissão especial

// Obter todos os tickets
router.get('/', checkPermission('tickets.read'), ticketController.getAllTickets);

// Obter um ticket específico pelo ID
router.get('/:id', checkPermission('tickets.read'), ticketController.getTicketById);

// Adicionar uma mensagem a um ticket
router.post('/:id/messages', checkPermission('tickets.read'), ticketController.addMessageToTicket);

// Atribuir um ticket
router.put('/:id/assign', checkPermission('tickets.manage'), ticketController.assignTicket); // Já estava correto

// Mudar o status de um ticket
router.put('/:id/status', checkPermission('tickets.manage'), ticketController.updateTicketStatus); // Já estava correto

// Avaliar um ticket
router.post('/:id/rate', ticketController.addTicketRating); // Não precisa de permissão especial

// Upload de anexo
router.post('/attachments', uploadTicketAttachment, ticketController.uploadAttachment); // Não precisa de permissão especial

module.exports = router;
