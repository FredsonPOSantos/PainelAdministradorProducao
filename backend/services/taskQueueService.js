// Ficheiro: backend/services/taskQueueService.js
// Descrição: Robô que processa ações pendentes em roteadores que voltaram a ficar online.

const { pool } = require('../connection');
const { logAction } = require('./auditLogService');

let RouterOSClient;
try {
    const routeros = require('node-routeros');
    RouterOSClient = routeros.RouterOSClient || routeros.RouterOSAPI || routeros.default || routeros;
} catch (e) {
    RouterOSClient = null;
}

const processPendingTasks = async () => {
    if (!RouterOSClient) return;

    let client;
    const dbErrorHandler = (err) => {
        console.error('❌ [TASK-QUEUE] Erro silencioso na conexão PG:', err.message);
    };

    try {
        client = await pool.connect();
        client.on('error', dbErrorHandler);

        // Busca tarefas 'pending' de roteadores que agora estão 'online'
        const query = `
            SELECT t.id, t.action, t.payload, t.retry_count, t.created_by,
                   r.id as router_id, r.name as router_name, r.ip_address, r.username, r.password, r.api_port
            FROM router_tasks t
            JOIN routers r ON t.router_id = r.id
            WHERE t.status = 'pending' AND r.status = 'online' AND r.is_maintenance = false
            ORDER BY t.created_at ASC
        `;
        const { rows: tasks } = await client.query(query);

        for (const task of tasks) {
            await executeTask(task, client);
        }
    } catch (err) {
        console.error('❌ [TASK-QUEUE] Erro ao consultar fila:', err.message);
    } finally {
        if (client) {
            client.removeListener('error', dbErrorHandler);
            client.release();
        }
    }
};

const executeTask = async (task, dbClient) => {
    const { id, action, payload, router_name, ip_address, username, password, api_port, retry_count } = task;
    const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
    
    let rosClient = null;
    try {
        console.log(`🤖 [TASK-QUEUE] A executar tarefa pendente '${action}' no roteador ${router_name}...`);
        
        rosClient = new RouterOSClient({
            host: ip_address, user: username, password: password, port: api_port || 8797, timeout: 20
        });
        rosClient.on('error', () => {}); // Evita crash de unhandled error

        await rosClient.connect();

        if (action === 'reboot') {
            try {
                await rosClient.write('/system/reboot');
            } catch (e) {
                if (!e.message.includes('closed') && !e.message.includes('ended') && !e.message.includes('ECONNRESET')) throw e;
            }
        } else if (action === 'set_ssid') {
            const { interfaceId, ssid } = parsedPayload;
            try {
                await rosClient.write('/interface/wireless/set', [`=.id=${interfaceId}`, `=ssid=${ssid}`]);
            } catch (e) {
                try { await rosClient.write('/interface/wifi/set', [`=.id=${interfaceId}`, `=configuration.ssid=${ssid}`]); } 
                catch (e2) { await rosClient.write('/interface/wifiwave2/set', [`=.id=${interfaceId}`, `=configuration.ssid=${ssid}`]); }
            }
        }

        // Sucesso: Marca como completo
        await dbClient.query("UPDATE router_tasks SET status = 'completed', executed_at = NOW() WHERE id = $1", [id]);
        console.log(`   ✅ [TASK-QUEUE] Tarefa ${id} resolvida com sucesso!`);

    } catch (error) {
        console.error(`   ❌ [TASK-QUEUE] Falha ao executar tarefa ${id}:`, error.message);
        const newRetryCount = (retry_count || 0) + 1;
        
        if (newRetryCount >= 5) {
            await dbClient.query("UPDATE router_tasks SET status = 'failed', retry_count = $1 WHERE id = $2", [newRetryCount, id]);
            console.log(`   🚫 [TASK-QUEUE] Tarefa ${id} cancelada após 5 tentativas falhadas.`);
        } else {
            await dbClient.query("UPDATE router_tasks SET retry_count = $1 WHERE id = $2", [newRetryCount, id]);
        }
    } finally {
        if (rosClient) {
            rosClient.removeAllListeners();
            try { rosClient.close(); } catch (e) {}
        }
    }
};

module.exports = { startTaskWorker: () => setInterval(processPendingTasks, 60000) };