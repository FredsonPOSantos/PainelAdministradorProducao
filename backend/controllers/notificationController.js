// Ficheiro: backend/controllers/notificationController.js
// Descrição: Contém a lógica para gerir as notificações.

const { pool } = require('../connection');

// Obter a contagem de notificações não lidas para o utilizador logado
const getUnreadCount = async (req, res) => {
    const { userId } = req.user;

    try {
        const result = await pool.query(
            'SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = $1 AND is_read = false',
            [userId]
        );
        const count = parseInt(result.rows[0].unread_count, 10);
        res.json({ success: true, data: { count } });
    } catch (error) {
        console.error('Erro ao buscar contagem de notificações não lidas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro de banco de dados ao buscar contagem de notificações.'
        });
    }
};

// Obter as últimas notificações não lidas
const getUnreadNotifications = async (req, res) => {
    const { userId } = req.user;

    try {
        const result = await pool.query(
            'SELECT id, message, type, related_ticket_id, created_at FROM notifications WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC LIMIT 5',
            [userId]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Erro ao buscar notificações não lidas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro de banco de dados ao buscar notificações.'
        });
    }
};

// Marcar uma notificação específica como lida
const markAsRead = async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;

    try {
        await pool.query(
            'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        res.json({ success: true, message: 'Notificação marcada como lida.' });
    } catch (error) {
        console.error('Erro ao marcar notificação como lida:', error);
        res.status(500).json({
            success: false,
            message: 'Erro de banco de dados ao marcar notificação como lida.'
        });
    }
};

// Marcar todas as notificações do utilizador como lidas
const markAllAsRead = async (req, res) => {
    const { userId } = req.user;

    try {
        await pool.query(
            'UPDATE notifications SET is_read = true WHERE user_id = $1',
            [userId]
        );
        res.json({ success: true, message: 'Notificações marcadas como lidas.' });
    } catch (error) {
        console.error('Erro ao marcar notificações como lidas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro de banco de dados ao marcar notificações como lidas.'
        });
    }
};

module.exports = {
    getUnreadCount,
    getUnreadNotifications,
    markAsRead,
    markAllAsRead
};
