// Ficheiro: backend/clear_tickets.js
// Descrição: Script para remover todos os tickets e dados relacionados (mensagens, avaliações, notificações).
// Uso: node backend/clear_tickets.js

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 1. Carregar variáveis de ambiente (Crucial fazer isso ANTES de importar connection.js)
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

async function clearTickets() {
    const client = await pool.connect();
    try {
        console.log('🗑️  Iniciando limpeza completa de tickets...');
        
        await client.query('BEGIN');

        // 1. Limpar avaliações (se a tabela existir)
        const checkRatings = await client.query("SELECT to_regclass('public.ticket_ratings')");
        if (checkRatings.rows[0].to_regclass) {
            const resRatings = await client.query('DELETE FROM ticket_ratings');
            console.log(`   - Avaliações removidas: ${resRatings.rowCount}`);
        }

        // 2. Limpar tickets (Cascade deve limpar mensagens e notificações vinculadas)
        // Nota: Mensagens e Notificações vinculadas a tickets serão removidas automaticamente
        // devido à constraint ON DELETE CASCADE definida no banco.
        const resTickets = await client.query('DELETE FROM tickets');
        console.log(`   - Tickets removidos: ${resTickets.rowCount}`);

        // 3. Resetar a sequência de IDs dos tickets
        // Isso faz com que o próximo ticket comece do ID 1 novamente
        try {
            await client.query("ALTER SEQUENCE tickets_id_seq RESTART WITH 1");
            console.log(`   - Sequência de IDs (tickets_id_seq) reiniciada para 1.`);
        } catch (seqError) {
            console.warn(`   ⚠️ Aviso: Não foi possível resetar a sequência (pode ter um nome diferente): ${seqError.message}`);
        }

        // 4. Resetar a sequência de IDs das mensagens (opcional)
        try {
            await client.query("ALTER SEQUENCE ticket_messages_id_seq RESTART WITH 1");
            console.log(`   - Sequência de IDs (ticket_messages_id_seq) reiniciada para 1.`);
        } catch (e) {}

        await client.query('COMMIT');
        console.log('✅ Limpeza concluída com sucesso! Todos os tickets de teste foram removidos.');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erro ao limpar tickets:', error);
    } finally {
        client.release();
        await pool.end(); // Encerra a conexão para o script terminar
    }
}

clearTickets();