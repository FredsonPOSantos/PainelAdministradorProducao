// Ficheiro: backend/services/historyService.js
const { pool } = require('../connection');
const fs = require('fs');
const path = require('path');

/**
 * Executa a consolidação diária dos dados de uptime.
 * Deve ser executado uma vez por dia (ex: 00:30).
 */
const runDailyConsolidation = async () => {
    console.log('📅 [HISTÓRICO] Iniciando consolidação diária de dados...');
    const client = await pool.connect();
    
    try {
        // 1. Define o dia a ser processado (Ontem)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const targetDate = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

        console.log(`   -> Processando dados de: ${targetDate}`);

        // 2. Busca todos os roteadores
        const routers = await client.query('SELECT id, ip_address, name FROM routers');
        
        // 3. Para cada roteador, calcula o resumo
        for (const router of routers.rows) {
            if (!router.ip_address) continue;

            // Conta quantos "pings" de sucesso tivemos ontem
            // O agente roda a cada 30s. Em 24h, o ideal é 2880 registos.
            const countResult = await client.query(`
                SELECT COUNT(*) as total 
                FROM router_uptime_log 
                WHERE router_host = $1 
                AND collected_at::date = $2
            `, [router.ip_address, targetDate]);

            const successCount = parseInt(countResult.rows[0].total, 10);
            
            // Cálculos baseados no intervalo de 30s do agente
            const expectedChecks = 2880; // 24h * 60m * 2 (2 checks por minuto)
            
            // Limita a 100% caso haja duplicidade de execução manual
            let uptimePercent = (successCount / expectedChecks) * 100;
            if (uptimePercent > 100) uptimePercent = 100;
            
            // Tempo offline estimado
            const downtimeMinutes = Math.round((expectedChecks - successCount) * 0.5); // 0.5 minutos por falha

            // Salva o resumo na tabela consolidada
            await client.query(`
                INSERT INTO router_daily_stats (router_id, date, uptime_percent, downtime_minutes)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (router_id, date) 
                DO UPDATE SET 
                    uptime_percent = EXCLUDED.uptime_percent,
                    downtime_minutes = EXCLUDED.downtime_minutes
            `, [router.id, targetDate, uptimePercent.toFixed(2), downtimeMinutes]);
        }

        console.log(`   ✅ [HISTÓRICO] Consolidação concluída para ${routers.rows.length} roteadores.`);
        
        // 4. Executa a limpeza (Retention Policy)
        await runRetentionPolicy(client);

    } catch (error) {
        console.error('❌ [HISTÓRICO] Erro na consolidação:', error.message);
    } finally {
        client.release();
    }
};

/**
 * Aplica a política de retenção: Apaga logs brutos antigos.
 */
const runRetentionPolicy = async (client) => {
    try {
        console.log('🧹 [RETENÇÃO] Verificando logs brutos antigos (> 30 dias)...');
        
        // Apaga logs brutos com mais de 30 dias
        const result = await client.query(`
            DELETE FROM router_uptime_log 
            WHERE collected_at < NOW() - INTERVAL '30 days'
        `);
        
        if (result.rowCount > 0) {
            console.log(`   ✅ [RETENÇÃO] Limpeza realizada: ${result.rowCount} registos brutos removidos.`);
        } else {
            console.log('   -> Nenhum registo antigo para limpar.');
        }

        // [NOVO] Apaga dispositivos do histórico DHCP que não são vistos há mais de 60 dias
        const dhcpOldResult = await client.query(`
            SELECT * FROM dhcp_leases_history 
            WHERE last_seen < NOW() - INTERVAL '60 days'
        `);
        
        if (dhcpOldResult.rowCount > 0) {
            // 1. Arquivar em ficheiro JSON
            const archiveDir = path.join(__dirname, '../public/uploads/arquivos/dhcplease');
            if (!fs.existsSync(archiveDir)) {
                fs.mkdirSync(archiveDir, { recursive: true });
            }
            
            const filename = `dhcp_archive_cumulative.json`;
            const filePath = path.join(archiveDir, filename);
            
            // [NOVO] Rotação de Ficheiros (Evita que o ficheiro fique gigante)
            const MAX_SIZE = 10 * 1024 * 1024; // 10 MB em bytes
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                if (stats.size > MAX_SIZE) {
                    const ts = new Date().toISOString().replace(/[:.]/g, '-');
                    const rotatedName = path.join(archiveDir, `dhcp_archive_cumulative_${ts}.json`);
                    fs.renameSync(filePath, rotatedName);
                    console.log(`   ✅ [RETENÇÃO] Ficheiro DHCP excedeu 10MB. Rotacionado!`);
                }
            }

            let fileContent = [];
            if (fs.existsSync(filePath)) {
                try { fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) {}
            }
            
            const newContent = fileContent.concat(dhcpOldResult.rows);
            fs.writeFileSync(filePath, JSON.stringify(newContent, null, 2));
            console.log(`   ✅ [RETENÇÃO] Arquivo de backup DHCP criado: ${filename}`);

            // 2. Apagar do banco de dados os que acabaram de ser arquivados
            const idsToDelete = dhcpOldResult.rows.map(r => r.id);
            const deleteResult = await client.query(`DELETE FROM dhcp_leases_history WHERE id = ANY($1::int[])`, [idsToDelete]);
            
            console.log(`   ✅ [RETENÇÃO] Limpeza DHCP: ${deleteResult.rowCount} dispositivos inativos removidos do banco.`);
        } else {
            console.log('   -> Nenhum registro DHCP antigo para arquivar e limpar.');
        }

    } catch (error) {
        console.error('❌ [RETENÇÃO] Erro ao limpar logs:', error.message);
    }
};

module.exports = { runDailyConsolidation };
