// Ficheiro: backend/dump_db.js
// Descrição: Script para exportar todas as tabelas e dados do PostgreSQL para um ficheiro JSON.
// Uso: node backend/dump_db.js

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 1. Carregar variáveis de ambiente
// [CORRIGIDO] Verifica primeiro na pasta atual (backend), depois na raiz
let envPath = path.resolve(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    envPath = path.resolve(__dirname, '../.env');
}

if (fs.existsSync(envPath)) {
    console.log('📄 Carregando variáveis de ambiente de:', envPath);
    dotenv.config({ path: envPath });
} else {
    console.warn('⚠️ Arquivo .env não encontrado (verificado em ./backend/.env e ./.env)');
}

// 2. Importar a pool de conexão existente
const { pool } = require('./connection');

async function exportDatabase() {
    console.log('🔄 Iniciando exportação do banco de dados...');
    let client;

    try {
        // Conecta ao banco
        client = await pool.connect();
        
        // 3. Obter lista de todas as tabelas do esquema 'public'
        const resTables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);

        const tables = resTables.rows.map(r => r.table_name);
        console.log(`📊 Tabelas encontradas (${tables.length}):`, tables.join(', '));

        const fullDump = {};

        // 4. Iterar sobre cada tabela e buscar todos os dados
        for (const table of tables) {
            process.stdout.write(`   📥 Baixando dados da tabela: ${table}... `);
            try {
                // Usa aspas duplas no nome da tabela para lidar com casos sensíveis a maiúsculas/minúsculas ou palavras reservadas
                const resData = await client.query(`SELECT * FROM "${table}"`);
                fullDump[table] = resData.rows;
                console.log(`✅ (${resData.rowCount} registos)`);
            } catch (tableErr) {
                console.log(`❌ Erro: ${tableErr.message}`);
                fullDump[table] = { error: tableErr.message };
            }
        }

        // 5. Salvar em arquivo JSON
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `db_dump_${timestamp}.json`;
        const filePath = path.join(__dirname, filename);

        console.log('💾 Salvando arquivo...');
        fs.writeFileSync(filePath, JSON.stringify(fullDump, null, 2));
        
        console.log(`\n✅ Exportação concluída com sucesso!`);
        console.log(`📁 Arquivo salvo em: ${filePath}`);
        console.log(`   (Você pode abrir este arquivo no VS Code para analisar os dados)`);

    } catch (err) {
        console.error('\n❌ Erro crítico durante a exportação:', err);
    } finally {
        if (client) client.release();
        // Encerra a pool para que o script termine a execução no terminal
        await pool.end(); 
    }
}

// Executa a função
exportDatabase();
