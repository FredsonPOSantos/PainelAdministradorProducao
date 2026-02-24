// Ficheiro: backend/clear_logs.js
// Descrição: Script para limpar todos os logs de auditoria, sistema e acessos.
// Uso: node backend/clear_logs.js

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 1. Carregar variáveis de ambiente
let envPath = path.resolve(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    envPath = path.resolve(__dirname, '../.env');
}

if (fs.existsSync(envPath)) {
    console.log('📄 Carregando variáveis de ambiente de:', envPath);
    dotenv.config({ path: envPath });
} else {
    console.warn('⚠️ Arquivo .env não encontrado.');
}

// 2. Importar a pool de conexão
const { pool } = require('./connection');

async function clearLogs() {
    const client = await pool.connect();
    try {
        console.log('🗑️  Iniciando limpeza de logs (Auditoria, Sistema, Acessos)...');
        
        await client.query('BEGIN');

        // 1. Limpar Logs de Auditoria (Tabela audit_logs)
        // Isso zera os contadores de "Acessos ao Painel" e a lista de "Logs de Atividade"
        const resAudit = await client.query('DELETE FROM audit_logs');
        console.log(`   - Logs de Auditoria/Acessos removidos: ${resAudit.rowCount}`);

        // 2. Limpar Logs de Erros do Sistema (Tabela system_errors)
        // Verifica se a tabela existe antes de tentar limpar
        const checkSystemErrors = await client.query("SELECT to_regclass('public.system_errors')");
        if (checkSystemErrors.rows[0].to_regclass) {
            const resSystem = await client.query('DELETE FROM system_errors');
            console.log(`   - Logs de Erros do Sistema removidos: ${resSystem.rowCount}`);
        }

        // 3. Limpar Logs de Conexão do Agente (Tabela connection_logs)
        const checkConnectionLogs = await client.query("SELECT to_regclass('public.connection_logs')");
        if (checkConnectionLogs.rows[0].to_regclass) {
            const resConn = await client.query('DELETE FROM connection_logs');
            console.log(`   - Logs de Conexão (Agente) removidos: ${resConn.rowCount}`);
        }

        // 4. Resetar sequências de IDs para começar do 1
        const sequences = ['audit_logs_id_seq', 'system_errors_id_seq', 'connection_logs_id_seq'];
        for (const seq of sequences) {
            try {
                await client.query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
            } catch (e) {
                // Ignora se a sequência não existir
            }
        }

        // 5. Limpar arquivo de buffer offline (JSON)
        const offlineLogPath = path.join(__dirname, 'services/offline_error_log.json');
        if (fs.existsSync(offlineLogPath)) {
            fs.writeFileSync(offlineLogPath, '[]');
            console.log(`   - Arquivo de buffer offline limpo.`);
        }

        await client.query('COMMIT');
        console.log('✅ Limpeza concluída com sucesso! Todos os históricos de logs foram apagados.');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erro ao limpar logs:', error);
    } finally {
        client.release();
        await pool.end(); // Encerra a conexão
    }
}

clearLogs();