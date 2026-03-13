// Ficheiro: backend/reset_clean_data.js
// Descrição: Script para limpar dados de Marketing (Templates/Campanhas), Suporte (Tickets) e Sorteios e resetar IDs.
// Uso: node backend/reset_clean_data.js

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
    console.warn('⚠️ Arquivo .env não encontrado. Tentando conexão com variáveis do sistema...');
}

// 2. Importar a pool de conexão
const { pool } = require('./connection');

async function resetData() {
    const client = await pool.connect();
    try {
        console.log('🚀 Iniciando limpeza profunda e reset de IDs...');
        await client.query('BEGIN');

        // --- 1. SORTEIOS ---
        console.log('📦 Limpando Sorteios e Participantes...');
        await client.query('DELETE FROM raffle_participants');
        await client.query('DELETE FROM raffles');
        await client.query('ALTER SEQUENCE IF EXISTS raffles_id_seq RESTART WITH 1');

        // --- 2. TICKETS (SUPORTE) ---
        console.log('🎫 Limpando Tickets, Mensagens e Notificações associadas...');
        await client.query('DELETE FROM ticket_ratings');
        await client.query('DELETE FROM ticket_messages');
        // Limpa notificações relacionadas com tickets
        await client.query("DELETE FROM notifications WHERE related_ticket_id IS NOT NULL OR type IN ('new_ticket', 'ticket_assigned', 'new_message', 'mention')");
        await client.query('DELETE FROM tickets');
        
        await client.query('ALTER SEQUENCE IF EXISTS tickets_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE IF EXISTS ticket_messages_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE IF EXISTS ticket_ratings_id_seq RESTART WITH 1');

        // --- 3. CAMPANHAS E TEMPLATES ---
        console.log('🎨 Limpando Campanhas e Templates...');
        // Tenta limpar campaign_banners se existir
        try { await client.query('DELETE FROM campaign_banners'); } catch (e) {}
        
        await client.query('DELETE FROM campaigns');
        await client.query('ALTER SEQUENCE IF EXISTS campaigns_id_seq RESTART WITH 1');

        await client.query('DELETE FROM templates');
        await client.query('ALTER SEQUENCE IF EXISTS templates_id_seq RESTART WITH 1');

        await client.query('COMMIT');
        console.log('✅ SUCESSO! Todas as tabelas foram limpas e os IDs reiniciados para 1.');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erro crítico ao resetar dados:', error);
    } finally {
        client.release();
        await pool.end(); // Encerra a conexão para finalizar o script
    }
}

resetData();