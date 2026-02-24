// Ficheiro: backend/controllers/logController.js
// Descrição: Lida com a busca e visualização de logs de auditoria.

const { pool } = require('../connection');
const fs = require('fs');
const path = require('path');

/**
 * Busca os logs de auditoria do sistema.
 * Por enquanto, busca os 200 registos mais recentes.
 */
const getAuditLogs = async (req, res) => {
    const { keyword, startDate, endDate, target_type, target_id, actionType } = req.query;

    try {
        let query = `
            SELECT id, timestamp, user_email, ip_address, action, status, description, target_type, target_id
            FROM audit_logs
        `;

        const whereClauses = [];
        const params = [];
        let paramIndex = 1;

        if (keyword) {
            whereClauses.push(`(user_email ILIKE $${paramIndex++} OR action ILIKE $${paramIndex++} OR description ILIKE $${paramIndex++})`);
            params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }

        if (startDate) {
            whereClauses.push(`timestamp >= $${paramIndex++}`);
            params.push(startDate);
        }

        if (endDate) {
            whereClauses.push(`timestamp <= $${paramIndex++}`);
            params.push(endDate);
        }

        if (target_type) {
            whereClauses.push(`target_type = $${paramIndex++}`);
            params.push(target_type);
        }

        if (target_id) {
            whereClauses.push(`target_id::text = $${paramIndex++}`); // Cast para text para garantir compatibilidade
            params.push(String(target_id));
        }

        // [NOVO] Filtro por Categoria de Ação
        if (actionType) {
            if (actionType === 'maintenance') {
                whereClauses.push(`action LIKE 'ROUTER_MAINTENANCE%'`);
            } else if (actionType === 'login') {
                whereClauses.push(`action LIKE 'LOGIN_%'`);
            } else if (actionType === 'user') {
                whereClauses.push(`action LIKE 'USER_%'`);
            } else if (actionType === 'router') {
                whereClauses.push(`(action LIKE 'ROUTER_%' AND action NOT LIKE 'ROUTER_MAINTENANCE%')`);
            } else if (actionType === 'settings') {
                whereClauses.push(`action LIKE 'SETTINGS_%'`);
            } else if (actionType === 'system') {
                whereClauses.push(`(action LIKE 'SERVER_%' OR action LIKE 'MEDIA_%')`);
            }
        }

        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        query += ` ORDER BY timestamp DESC LIMIT 200`;

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar logs de auditoria:', error);
        res.status(500).json({ message: 'Erro interno ao buscar logs.' });
    }
};

/**
 * [NOVO] Busca os logs de erro do sistema.
 */
const getSystemLogs = async (req, res) => {
    const { keyword, startDate, endDate } = req.query;

    try {
        let query = `
            SELECT id, timestamp, error_message, stack_trace, request_method, request_url, request_body, user_email
            FROM system_errors
        `;

        const whereClauses = [];
        const params = [];
        let paramIndex = 1;

        if (keyword) {
            whereClauses.push(`(error_message ILIKE $${paramIndex++} OR stack_trace ILIKE $${paramIndex++} OR request_url ILIKE $${paramIndex++})`);
            params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }

        if (startDate) {
            whereClauses.push(`timestamp >= $${paramIndex++}`);
            params.push(startDate);
        }

        if (endDate) {
            whereClauses.push(`timestamp <= $${paramIndex++}`);
            params.push(endDate);
        }

        if (whereClauses.length > 0) {
            query += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        query += ` ORDER BY timestamp DESC LIMIT 500`;

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar logs de sistema:', error);
        res.status(500).json({ message: 'Erro interno ao buscar logs de sistema.' });
    }
};

/**
 * [NOVO] Lê e retorna o conteúdo do ficheiro de log de erros offline.
 */
const getOfflineErrorLog = async (req, res) => {
    const logFilePath = path.join(__dirname, '../services/offline_error_log.json');
    try {
        if (fs.existsSync(logFilePath)) {
            const fileContent = fs.readFileSync(logFilePath, 'utf-8');
            const logs = fileContent ? JSON.parse(fileContent) : [];
            res.json({ success: true, data: logs });
        } else {
            res.json({ success: true, data: [] }); // Ficheiro não existe, retorna array vazio
        }
    } catch (error) {
        console.error('Erro ao ler o ficheiro de log offline:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao ler o ficheiro de log.' });
    }
};

/**
 * [NOVO] Lista os arquivos de relatório de uptime arquivados.
 */
const listArchivedReports = async (req, res) => {
    const archiveDir = path.join(__dirname, '../../logs/archives');
    try {
        if (!fs.existsSync(archiveDir)) {
            return res.json({ success: true, data: [] });
        }
        const files = fs.readdirSync(archiveDir).filter(f => f.endsWith('.json'));
        
        const fileStats = files.map(file => {
            const stat = fs.statSync(path.join(archiveDir, file));
            return {
                name: file,
                size: (stat.size / 1024).toFixed(2) + ' KB',
                created_at: stat.birthtime
            };
        });
        
        res.json({ success: true, data: fileStats });
    } catch (error) {
        console.error('Erro ao listar arquivos:', error);
        res.status(500).json({ message: 'Erro ao listar relatórios arquivados.' });
    }
};

/**
 * [NOVO] Baixa um relatório específico.
 */
const downloadArchivedReport = async (req, res) => {
    const { filename } = req.params;
    // Segurança básica para evitar Directory Traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(__dirname, '../../logs/archives', safeFilename);

    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ message: 'Arquivo não encontrado.' });
    }
};

/**
 * [NOVO] Exclui um relatório arquivado.
 */
const deleteArchivedReport = async (req, res) => {
    const { filename } = req.params;
    const safeFilename = path.basename(filename);
    const filePath = path.join(__dirname, '../../logs/archives', safeFilename);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true, message: 'Arquivo de relatório excluído com sucesso.' });
    } else {
        res.status(404).json({ message: 'Arquivo não encontrado.' });
    }
};

module.exports = { 
    getAuditLogs, 
    getSystemLogs, 
    getOfflineErrorLog,
    listArchivedReports,    // [NOVO]
    downloadArchivedReport,  // [NOVO]
    deleteArchivedReport    // [NOVO]
};