// Ficheiro: connection.js
// Descrição: Centraliza e valida a conexão com a base de dados PostgreSQL (SRV-ADM)

let pgReconnectInterval = null;
const path = require('path');
const fs = require('fs');

// [REMOVIDO] A responsabilidade de carregar o .env foi movida para o ponto de entrada da aplicação (server.js),
// que já o faz condicionalmente (apenas em desenvolvimento). Isso evita conflitos em produção.

const { Pool } = require('pg');
const bcrypt = require('bcrypt'); // [NOVO] Necessário para criar a senha do admin padrão

// Cria a pool de conexões usando as variáveis de ambiente
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000 // [ADICIONADO] Aumenta o timeout de conexão para 10s para ser mais tolerante a redes lentas.
});

// [NOVO] Objeto para monitorizar o estado da conexão
const pgConnectionStatus = {
    connected: false,
    error: null,
};

// [NOVO] Flag para garantir que a manutenção só inicia uma vez
let maintenanceIntervalStarted = false;

// [NOVO] Função para registar logs em ficheiro quando a BD está offline
const logOfflineEvent = (type, message, details = null) => {
    const logDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, 'offline_events.log');
    const timestamp = new Date().toISOString();
    const logEntry = JSON.stringify({ timestamp, type, message, details }) + '\n';
    
    fs.appendFile(logFile, logEntry, (err) => {
        if (err) console.error('❌ Falha ao escrever no log offline:', err);
    });
};

// Evento: ligação estabelecida
pool.on('connect', () => {
  // Este evento é por cliente, não para a pool inteira. A verificação inicial é mais fiável.
});

// Evento: erro inesperado
pool.on('error', (err) => {
  console.error('❌ [SRV-ADM] Erro inesperado no cliente da base de dados:', err);
  pgConnectionStatus.connected = false;
  pgConnectionStatus.error = err.message;
  logOfflineEvent('DB_ERROR', 'Erro inesperado no cliente da base de dados', err.message); // [NOVO]
  // Inicia a tentativa de reconexão se não estiver a decorrer
  if (!pgReconnectInterval) {
      startPgReconnect();
  }
});

/**
 * [NOVO] Verifica e atualiza o esquema da base de dados, adicionando colunas em falta.
 * Esta função é idempotente, ou seja, pode ser executada várias vezes sem causar erros.
 */
async function checkAndUpgradeSchema(client) {
    // console.log('🔍 [DB-UPGRADE] A verificar o esquema da base de dados para atualizações...');

    const checkColumn = async (tableName, columnName) => {
        const res = await client.query(`
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
        `, [tableName, columnName]);
        return res.rowCount > 0;
    };

    // [NOVO] Verifica se a tabela existe
    const checkTable = async (tableName) => {
        const res = await client.query(`
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = $1
        `, [tableName]);
        return res.rowCount > 0;
    };

    // [NOVO] Correção da tabela 'roles' (Garante que existe e tem a coluna 'slug')
    const rolesExists = await checkTable('roles');
    if (!rolesExists) {
        console.log("   -> Tabela 'roles' não encontrada. Criando...");
        await client.query(`
            CREATE TABLE roles (
                slug VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                is_system BOOLEAN DEFAULT FALSE
            );
        `);
        console.log("   ✅ Tabela 'roles' criada com sucesso.");
    } else {
        const slugExists = await checkColumn('roles', 'slug');
        if (!slugExists) {
            const roleNameExists = await checkColumn('roles', 'role_name');
            if (roleNameExists) {
                console.log("   -> Atualizando tabela 'roles': renomeando 'role_name' para 'slug'...");
                await client.query('ALTER TABLE roles RENAME COLUMN role_name TO slug');
                console.log("   ✅ Coluna 'role_name' renomeada para 'slug'.");
            } else {
                console.log("   -> Adicionando coluna 'slug' à tabela 'roles'...");
                await client.query('ALTER TABLE roles ADD COLUMN slug VARCHAR(50)');
            }
        }

        // [CORREÇÃO] Verifica e adiciona a coluna 'name' se faltar
        const nameExists = await checkColumn('roles', 'name');
        if (!nameExists) {
            console.log("   -> Adicionando coluna 'name' à tabela 'roles'...");
            await client.query('ALTER TABLE roles ADD COLUMN name VARCHAR(100)');
            await client.query("UPDATE roles SET name = slug WHERE name IS NULL"); // Popula com o slug temporariamente
            console.log("   ✅ Coluna 'name' adicionada e populada.");
        }

        // [CORREÇÃO] Verifica e adiciona a coluna 'is_system' se faltar
        const isSystemExists = await checkColumn('roles', 'is_system');
        if (!isSystemExists) {
            console.log("   -> Adicionando coluna 'is_system' à tabela 'roles'...");
            await client.query('ALTER TABLE roles ADD COLUMN is_system BOOLEAN DEFAULT FALSE');
            // Atualiza roles de sistema conhecidas para evitar que sejam deletadas acidentalmente
            await client.query("UPDATE roles SET is_system = true WHERE slug IN ('master', 'gestao', 'estetica', 'DPO')");
            console.log("   ✅ Coluna 'is_system' adicionada.");
        }
    }

    // [NOVO] Verifica e cria a tabela 'admin_users' se não existir
    const adminUsersTableExists = await checkTable('admin_users');
    if (!adminUsersTableExists) {
        console.log("   -> Tabela 'admin_users' não encontrada. Criando...");
        await client.query(`
            CREATE TABLE admin_users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL REFERENCES roles(slug) ON UPDATE CASCADE,
                nome_completo VARCHAR(255),
                phone VARCHAR(50),
                sector VARCHAR(100),
                matricula VARCHAR(100),
                cpf VARCHAR(20),
                is_active BOOLEAN DEFAULT TRUE,
                must_change_password BOOLEAN DEFAULT FALSE,
                reset_token VARCHAR(255),
                reset_token_expires TIMESTAMP,
                avatar_url VARCHAR(255),
                theme_preference VARCHAR(50) DEFAULT 'default',
                theme_preference VARCHAR(50) DEFAULT 'vscode',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("   ✅ Tabela 'admin_users' criada.");

        // Cria utilizador padrão: admin@rota.com / admin
        try {
            const salt = await bcrypt.genSalt(10);
            // [SEGURANÇA] Usa variável de ambiente ou fallback, evitando hardcode total
            const defaultPass = process.env.DEFAULT_ADMIN_PASS || 'admin';
            const hash = await bcrypt.hash(defaultPass, salt);
            
            await client.query(`
                INSERT INTO admin_users (email, password_hash, role, nome_completo, is_active)
                VALUES ('admin@rota.com', $1, 'master', 'Administrador Sistema', true)
            `, [hash]);
            console.log(`   ✅ Utilizador padrão criado: admin@rota.com / ${process.env.DEFAULT_ADMIN_PASS ? '******' : 'admin'}`);
        } catch (err) {
            console.error("   ❌ Erro ao criar utilizador padrão:", err.message);
        }
    }

    // [NOVO] Garante que a coluna 'role' em 'admin_users' seja VARCHAR e tenha uma chave estrangeira para 'roles'
    const adminUsersExists = await checkTable('admin_users');
    if (adminUsersExists) {
        const roleColumnTypeResult = await client.query(`
            SELECT data_type FROM information_schema.columns 
            WHERE table_name = 'admin_users' AND column_name = 'role'
        `);

        // Se a coluna 'role' não for do tipo 'character varying' (VARCHAR), converte-a.
        // O tipo 'USER-DEFINED' indica um ENUM, que é o que causa o erro.
        if (roleColumnTypeResult.rows.length > 0 && roleColumnTypeResult.rows[0].data_type !== 'character varying') {
            console.log("   -> A converter a coluna 'role' da tabela 'admin_users' de ENUM para VARCHAR...");
            await client.query('ALTER TABLE admin_users ALTER COLUMN role TYPE VARCHAR(50) USING role::text;');
            console.log("   ✅ Coluna 'role' convertida com sucesso.");
        }

        // Verifica se a chave estrangeira já existe
        const fkCheck = await client.query(`
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'admin_users_role_fkey' AND table_name = 'admin_users'
        `);

        if (fkCheck.rowCount === 0) {
            console.log("   -> A adicionar chave estrangeira para 'admin_users.role'...");
            // Adiciona a chave estrangeira referenciando a tabela 'roles'
            // ON UPDATE CASCADE: se o slug em 'roles' mudar, atualiza aqui também.
            // ON DELETE RESTRICT: impede que um perfil seja excluído se ainda estiver em uso.
            await client.query('ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_fkey FOREIGN KEY (role) REFERENCES roles(slug) ON UPDATE CASCADE ON DELETE RESTRICT;');
            console.log("   ✅ Chave estrangeira 'admin_users_role_fkey' adicionada.");
        }

        // [NOVO] Atualiza o tema padrão para 'vscode' para novos utilizadores
        await client.query("ALTER TABLE admin_users ALTER COLUMN theme_preference SET DEFAULT 'vscode'");
    }

    // [NOVO] Tabela para permissões individuais de utilizadores (Overrides)
    const userPermissionsExists = await checkTable('user_permissions');
    if (!userPermissionsExists) {
        console.log("   -> Tabela 'user_permissions' não encontrada. Criando...");
        await client.query(`
            CREATE TABLE user_permissions (
                user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
                permission_key VARCHAR(100) NOT NULL,
                is_granted BOOLEAN NOT NULL,
                PRIMARY KEY (user_id, permission_key)
            );
        `);
        console.log("   ✅ Tabela 'user_permissions' criada.");
    }

    // Colunas a serem adicionadas na tabela 'routers' para a API do MikroTik
    const columnsToAdd = [
        { name: 'username', type: 'VARCHAR(255)' },
        { name: 'password', type: 'VARCHAR(255)' },
        { name: 'api_port', type: 'INTEGER' }
    ];

    for (const col of columnsToAdd) {
        const exists = await checkColumn('routers', col.name);
        if (!exists) {
            console.log(`   -> A coluna '${col.name}' não foi encontrada na tabela 'routers'. A adicionar...`);
            await client.query(`ALTER TABLE routers ADD COLUMN ${col.name} ${col.type}`);
            console.log(`   ✅ Coluna '${col.name}' adicionada com sucesso.`);
        } else {
            // console.log(`   -> Coluna '${col.name}' já existe.`);
        }
    }

    // [NOVO] Verifica e adiciona a coluna 'is_maintenance' na tabela 'routers'
    const isMaintenanceExists = await checkColumn('routers', 'is_maintenance');
    if (!isMaintenanceExists) {
        console.log("   -> Adicionando coluna 'is_maintenance' à tabela 'routers'...");
        await client.query('ALTER TABLE routers ADD COLUMN is_maintenance BOOLEAN DEFAULT FALSE');
        console.log("   ✅ Coluna 'is_maintenance' adicionada.");
    }

    // [NOVO] Adiciona colunas para monitoramento de interface e tempo de inatividade
    const monitoringInterfaceExists = await checkColumn('routers', 'monitoring_interface');
    if (!monitoringInterfaceExists) {
        console.log("   -> Adicionando coluna 'monitoring_interface' à tabela 'routers'...");
        await client.query(`ALTER TABLE routers ADD COLUMN monitoring_interface VARCHAR(255)`);
        console.log("   ✅ Coluna 'monitoring_interface' adicionada.");
    }

    const statusChangedAtExists = await checkColumn('routers', 'status_changed_at');
    if (!statusChangedAtExists) {
        console.log("   -> Adicionando coluna 'status_changed_at' à tabela 'routers'...");
        await client.query(`ALTER TABLE routers ADD COLUMN status_changed_at TIMESTAMPTZ`);
        console.log("   ✅ Coluna 'status_changed_at' adicionada.");
    }

    // [NOVO] Adiciona coluna para comunidade SNMP
    const snmpCommunityExists = await checkColumn('routers', 'snmp_community');
    if (!snmpCommunityExists) {
        console.log("   -> Adicionando coluna 'snmp_community' à tabela 'routers'...");
        await client.query("ALTER TABLE routers ADD COLUMN snmp_community VARCHAR(50) DEFAULT 'public'");
        console.log("   ✅ Coluna 'snmp_community' adicionada.");
    }

    // [NOVO] Verifica e adiciona a coluna 'is_system' na tabela 'banners'
    const isSystemBannersExists = await checkColumn('banners', 'is_system');
    if (!isSystemBannersExists) {
        console.log("   -> Adicionando coluna 'is_system' à tabela 'banners'...");
        await client.query('ALTER TABLE banners ADD COLUMN is_system BOOLEAN DEFAULT FALSE');
        console.log("   ✅ Coluna 'is_system' adicionada em banners.");
    }

    // [NOVO] Verifica e adiciona a coluna 'is_system' na tabela 'templates'
    const isSystemTemplatesExists = await checkColumn('templates', 'is_system');
    if (!isSystemTemplatesExists) {
        console.log("   -> Adicionando coluna 'is_system' à tabela 'templates'...");
        await client.query('ALTER TABLE templates ADD COLUMN is_system BOOLEAN DEFAULT FALSE');
        console.log("   ✅ Coluna 'is_system' adicionada em templates.");
    }

    // [NOVO] Configurações do Loader (Preloader)
    const loaderEnabledExists = await checkColumn('system_settings', 'loader_enabled');
    if (!loaderEnabledExists) {
        console.log("   -> Adicionando coluna 'loader_enabled' à tabela 'system_settings'...");
        await client.query('ALTER TABLE system_settings ADD COLUMN loader_enabled BOOLEAN DEFAULT TRUE');
        console.log("   ✅ Coluna 'loader_enabled' adicionada.");
    }
    const loaderTimeoutExists = await checkColumn('system_settings', 'loader_timeout');
    if (!loaderTimeoutExists) {
        console.log("   -> Adicionando coluna 'loader_timeout' à tabela 'system_settings'...");
        await client.query('ALTER TABLE system_settings ADD COLUMN loader_timeout INTEGER DEFAULT 10000'); // 10 segundos (Generoso)
        console.log("   ✅ Coluna 'loader_timeout' adicionada.");
    }

    // [NOVO] Verifica e adiciona colunas para tickets públicos na tabela 'tickets'
    const ticketsTableExists = await checkTable('tickets');
    if (ticketsTableExists) {
        const guestColumns = [
            { name: 'guest_name', type: 'VARCHAR(255)' },
            { name: 'guest_email', type: 'VARCHAR(255)' },
            { name: 'guest_phone', type: 'VARCHAR(50)' },
            { name: 'guest_department', type: 'VARCHAR(100)' },
            { name: 'guest_location', type: 'VARCHAR(100)' }
        ];

        for (const col of guestColumns) {
            const exists = await checkColumn('tickets', col.name);
            if (!exists) {
                console.log(`   -> Adicionando coluna '${col.name}' à tabela 'tickets'...`);
                await client.query(`ALTER TABLE tickets ADD COLUMN ${col.name} ${col.type}`);
                console.log(`   ✅ Coluna '${col.name}' adicionada.`);
            }
        }

        // Verifica se created_by_user_id permite NULL (necessário para tickets públicos)
        const isNullableRes = await client.query(`
            SELECT is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'tickets' AND column_name = 'created_by_user_id'
        `);
        
        if (isNullableRes.rows.length > 0 && isNullableRes.rows[0].is_nullable === 'NO') {
             console.log("   -> Alterando 'created_by_user_id' em 'tickets' para permitir NULL (tickets públicos)...");
             await client.query('ALTER TABLE tickets ALTER COLUMN created_by_user_id DROP NOT NULL');
             console.log("   ✅ Coluna 'created_by_user_id' agora permite NULL.");
        }
    }

    // [NOVO] Tabela de log de uptime para cálculos de disponibilidade
    const uptimeLogExists = await checkTable('router_uptime_log');
    if (!uptimeLogExists) {
        console.log("   -> Tabela 'router_uptime_log' não encontrada. Criando...");
        await client.query(`
            CREATE TABLE router_uptime_log (
                id SERIAL PRIMARY KEY,
                router_host VARCHAR(50) NOT NULL,
                collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        await client.query('CREATE INDEX IF NOT EXISTS idx_router_uptime_log_host_time ON router_uptime_log (router_host, collected_at DESC);');
        console.log("   ✅ Tabela 'router_uptime_log' e seu índice foram criados.");
    }

    // [NOVO] Tabela de Consolidação Diária (Dados Frios/Mornos)
    // Armazena apenas 1 registo por dia por roteador com o resumo estatístico.
    const dailyStatsExists = await checkTable('router_daily_stats');
    if (!dailyStatsExists) {
        console.log("   -> Tabela 'router_daily_stats' não encontrada. Criando...");
        await client.query(`
            CREATE TABLE router_daily_stats (
                id SERIAL PRIMARY KEY,
                router_id INTEGER REFERENCES routers(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                uptime_percent DECIMAL(5,2) DEFAULT 0,
                downtime_minutes INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(router_id, date)
            );
        `);
        console.log("   ✅ Tabela 'router_daily_stats' criada para histórico consolidado.");
    }

    // [NOVO] Garante que todas as permissões do sistema existem na tabela 'permissions'
    // Isto assegura que o Master tenha acesso a tudo (exceto LGPD) e que as permissões apareçam na matriz.
    const systemPermissions = [
        // Principal
        { key: 'dashboard.read', feature: 'Principal: Dashboard', action: 'Visualizar' },
        { key: 'system_health.read', feature: 'Principal: Saúde do Sistema', action: 'Visualizar' },
        { key: 'analytics.read', feature: 'Principal: Dashboard Analítico', action: 'Visualizar' },
        { key: 'hotspot.read', feature: 'Principal: Relatório Hotspot', action: 'Visualizar' },

        // Detalhes do Dashboard Analítico
        { key: 'analytics.details.logins', feature: 'Principal: Dashboard Analítico (Detalhes)', action: 'Ver Detalhes de Acessos' },
        { key: 'analytics.details.hotspot_users', feature: 'Principal: Dashboard Analítico (Detalhes)', action: 'Ver Detalhes de Utilizadores Hotspot' },
        { key: 'analytics.details.routers', feature: 'Principal: Dashboard Analítico (Detalhes)', action: 'Ver Detalhes de Roteadores' },
        { key: 'analytics.details.tickets', feature: 'Principal: Dashboard Analítico (Detalhes)', action: 'Ver Detalhes de Tickets' },
        { key: 'analytics.details.lgpd', feature: 'Principal: Dashboard Analítico (Detalhes)', action: 'Ver Detalhes de Pedidos LGPD' },
        { key: 'analytics.details.admin_activity', feature: 'Principal: Dashboard Analítico (Detalhes)', action: 'Ver Detalhes de Atividade Admin' },
        { key: 'analytics.details.raffles', feature: 'Principal: Dashboard Analítico (Detalhes)', action: 'Ver Detalhes de Sorteios' },
        { key: 'analytics.details.campaigns', feature: 'Principal: Dashboard Analítico (Detalhes)', action: 'Ver Detalhes de Campanhas' },
        { key: 'analytics.details.server_health', feature: 'Principal: Dashboard Analítico (Detalhes)', action: 'Ver Detalhes de Saúde do Servidor' },

        // Gestão de Arquivos
        { key: 'files.read', feature: 'Gestão de Arquivos', action: 'Visualizar' },
        { key: 'files.delete', feature: 'Gestão de Arquivos', action: 'Excluir' },
        { key: 'files.archive', feature: 'Gestão de Arquivos', action: 'Arquivar' },
        
        // Gestão
        { key: 'users.read', feature: 'Gestão: Utilizadores', action: 'Visualizar' },
        { key: 'users.create', feature: 'Gestão: Utilizadores', action: 'Criar' },
        { key: 'users.update', feature: 'Gestão: Utilizadores', action: 'Editar' },
        { key: 'users.delete', feature: 'Gestão: Utilizadores', action: 'Eliminar' },

        { key: 'routers.read', feature: 'Gestão: Roteadores', action: 'Visualizar' },
        { key: 'routers.create', feature: 'Gestão: Roteadores', action: 'Criar' },
        { key: 'routers.update', feature: 'Gestão: Roteadores', action: 'Editar' },
        { key: 'routers.delete', feature: 'Gestão: Roteadores', action: 'Eliminar' },
        { key: 'routers.reboot', feature: 'Gestão: Roteadores', action: 'Reiniciar/Desligar' },
        { key: 'routers.individual.delete_permanent', feature: 'Gestão: Roteadores', action: 'Exclusão Permanente' },
        { key: 'routers.monitoring.read', feature: 'Gestão: Roteadores', action: 'Ver Monitoramento (NOC)' },
        { key: 'routers.dashboard.read', feature: 'Gestão: Roteadores', action: 'Ver Dashboard Individual' },
        { key: 'routers.dashboard.clients', feature: 'Gestão: Roteadores', action: 'Ver Clientes no Dashboard' },
        { key: 'routers.dashboard.interfaces', feature: 'Gestão: Roteadores', action: 'Ver Interfaces no Dashboard' },

        // Perfis (Roles)
        { key: 'roles.read', feature: 'Gestão: Perfis', action: 'Visualizar' },
        { key: 'roles.create', feature: 'Gestão: Perfis', action: 'Criar' },
        { key: 'roles.update', feature: 'Gestão: Perfis', action: 'Editar' },
        { key: 'roles.delete', feature: 'Gestão: Perfis', action: 'Eliminar' },

        { key: 'tickets.read', feature: 'Gestão: Suporte (Tickets)', action: 'Visualizar' },
        { key: 'tickets.create', feature: 'Gestão: Suporte (Tickets)', action: 'Criar' },
        { key: 'tickets.update', feature: 'Gestão: Suporte (Tickets)', action: 'Editar' },
        { key: 'tickets.manage', feature: 'Gestão: Suporte (Tickets)', action: 'Gerir (Atribuir/Status)' },
        { key: 'tickets.delete', feature: 'Gestão: Suporte (Tickets)', action: 'Eliminar' },

        // Marketing
        { key: 'templates.read', feature: 'Marketing: Templates', action: 'Visualizar' },
        { key: 'templates.create', feature: 'Marketing: Templates', action: 'Criar' },
        { key: 'templates.update', feature: 'Marketing: Templates', action: 'Editar' },
        { key: 'templates.delete', feature: 'Marketing: Templates', action: 'Eliminar' },

        { key: 'campaigns.read', feature: 'Marketing: Campanhas', action: 'Visualizar' },
        { key: 'campaigns.create', feature: 'Marketing: Campanhas', action: 'Criar' },
        { key: 'campaigns.update', feature: 'Marketing: Campanhas', action: 'Editar' },
        { key: 'campaigns.delete', feature: 'Marketing: Campanhas', action: 'Eliminar' },

        { key: 'banners.read', feature: 'Marketing: Banners', action: 'Visualizar' },
        { key: 'banners.create', feature: 'Marketing: Banners', action: 'Criar' },
        { key: 'banners.update', feature: 'Marketing: Banners', action: 'Editar' },
        { key: 'banners.delete', feature: 'Marketing: Banners', action: 'Eliminar' },

        { key: 'raffles.read', feature: 'Marketing: Ferramentas (Sorteios)', action: 'Visualizar' },
        { key: 'raffles.create', feature: 'Marketing: Ferramentas (Sorteios)', action: 'Criar' },
        { key: 'raffles.update', feature: 'Marketing: Ferramentas (Sorteios)', action: 'Editar' },
        { key: 'raffles.draw', feature: 'Marketing: Ferramentas (Sorteios)', action: 'Realizar Sorteio' },
        { key: 'raffles.delete', feature: 'Marketing: Ferramentas (Sorteios)', action: 'Eliminar' },

        // Administração
        { key: 'settings.appearance', feature: 'Administração: Configurações', action: 'Aparência' },
        { key: 'settings.login_page', feature: 'Administração: Configurações', action: 'Página de Login' },
        { key: 'settings.smtp', feature: 'Administração: Configurações', action: 'SMTP (E-mail)' },
        { key: 'settings.policies', feature: 'Administração: Configurações', action: 'Políticas' },
        { key: 'settings.media', feature: 'Administração: Configurações', action: 'Gestão de Arquivos' },
        { key: 'settings.hotspot.read', feature: 'Administração: Configurações', action: 'Ver Configs Hotspot' },
        { key: 'settings.hotspot.update', feature: 'Administração: Configurações', action: 'Editar Configs Hotspot' },

        { key: 'permissions.read', feature: 'Administração: Funções e Permissões', action: 'Visualizar' },
        { key: 'permissions.update', feature: 'Administração: Funções e Permissões', action: 'Editar' },

        { key: 'logs.activity.read', feature: 'Administração: Logs', action: 'Ver Logs de Atividade' },
        { key: 'logs.system.read', feature: 'Administração: Logs', action: 'Ver Logs de Sistema' },

        { key: 'lgpd.read', feature: 'Administração: LGPD', action: 'Visualizar' },
        { key: 'lgpd.update', feature: 'Administração: LGPD', action: 'Editar' },
        { key: 'lgpd.delete', feature: 'Administração: LGPD', action: 'Eliminar' }
    ];

    for (const perm of systemPermissions) {
        // Verifica se a permissão existe
        const permCheck = await client.query('SELECT 1 FROM permissions WHERE permission_key = $1', [perm.key]);
        if (permCheck.rowCount === 0) {
            console.log(`   -> Permissão '${perm.key}' em falta. A adicionar...`);
            await client.query(
                'INSERT INTO permissions (permission_key, feature_name, action_name, description) VALUES ($1, $2, $3, $4)',
                [perm.key, perm.feature, perm.action, `Permissão para ${perm.action} em ${perm.feature}`]
            );
        }
    }

    // [NOVO] Garante que a tabela 'roles' está populada com os perfis de sistema
    // Isto permite que o sistema funcione mesmo se a tabela tiver sido criada vazia
    const systemRoles = [
        { slug: 'master', name: 'Master', description: 'Acesso total ao sistema', is_system: true },
        { slug: 'gestao', name: 'Gestão', description: 'Gestão de roteadores e usuários', is_system: true },
        { slug: 'estetica', name: 'Marketing', description: 'Gestão de campanhas e banners', is_system: true }, // Slug 'estetica' mantido para compatibilidade com dados existentes
        { slug: 'DPO', name: 'DPO', description: 'Encarregado de Proteção de Dados', is_system: true }
    ];

    for (const role of systemRoles) {
        const roleCheck = await client.query('SELECT 1 FROM roles WHERE slug = $1', [role.slug]);
        if (roleCheck.rowCount === 0) {
            console.log(`   -> Perfil de sistema '${role.slug}' em falta. A adicionar...`);
            await client.query(
                'INSERT INTO roles (slug, name, description, is_system) VALUES ($1, $2, $3, $4)',
                [role.slug, role.name, role.description, role.is_system]
            );
        }
    }

    // [NOVO] Verifica e desativa campanhas expiradas (Limpeza na inicialização)
    const campaignsExists = await checkTable('campaigns');
    if (campaignsExists) {
        const result = await client.query(`
            UPDATE campaigns 
            SET is_active = false 
            WHERE is_active = true AND end_date < CURRENT_DATE
        `);
        if (result.rowCount > 0) {
            console.log(`   ✅ [AUTO-CLEANUP] ${result.rowCount} campanhas expiradas foram desativadas.`);
        }
    }

    // console.log('✅ [DB-UPGRADE] Verificação do esquema concluída.');
}

const startPgReconnect = () => {
    if (pgReconnectInterval) return; // Já está a tentar

    console.log('🔄 [PG-RECONNECT] A agendar tentativas de reconexão com o PostgreSQL a cada 30 segundos...');
    pgReconnectInterval = setInterval(async () => {
        console.log('🔄 [PG-RECONNECT] A tentar reconectar ao PostgreSQL...');
        try {
            const client = await pool.connect();
            // [CORREÇÃO] Proteção para o cliente de reconexão
            const reconnectErrorHandler = (err) => {
                console.error('❌ [PG-RECONNECT] Erro no cliente de teste:', err.message);
            };
            client.on('error', reconnectErrorHandler);

            console.log('✅ [PG-RECONNECT] Conexão com o PostgreSQL restabelecida!');
            logOfflineEvent('RECONNECT_SUCCESS', 'Conexão com o PostgreSQL restabelecida'); // [NOVO]
            pgConnectionStatus.connected = true;
            pgConnectionStatus.error = null;
            clearInterval(pgReconnectInterval); // Para as tentativas
            pgReconnectInterval = null;
            await checkAndUpgradeSchema(client); // Verifica o esquema após reconectar
            client.removeListener('error', reconnectErrorHandler); // [CORREÇÃO] Remove listener para evitar memory leak
            client.release();
            // Aqui poderíamos emitir um evento para reiniciar serviços dependentes, como o 'startPeriodicRouterCheck'
        } catch (err) {
            console.error('❌ [PG-RECONNECT] Tentativa de reconexão falhou:', err.message);
            logOfflineEvent('RECONNECT_FAIL', 'Tentativa de reconexão falhou', err.message); // [NOVO]
            pgConnectionStatus.connected = false;
            pgConnectionStatus.error = err.message;
        }
    }, 30000); // Tenta a cada 30 segundos
};

// Função de teste e validação inicial
const testInitialConnection = async () => {
  const startTime = Date.now();
  try {
    const client = await pool.connect();
    const duration = Date.now() - startTime;

    const result = await client.query(`
      SELECT current_database() AS database,
             current_user AS user,
             inet_server_addr() AS host,
             inet_server_port() AS port;
    `);

    const info = result.rows[0];

    // console.log('\n🔍 [SRV-ADM] Detalhes da conexão PostgreSQL:');
    // console.log(`   🧑 Usuário conectado: ${info.user}`);
    // console.log(`   🗃️ Banco de dados:     ${info.database}`);
    // console.log(`   🌐 Host:               ${info.host}`);
    // console.log(`   🔌 Porta:              ${info.port}`);
    // console.log(`   ⚡ Tempo de conexão:   ${duration} ms\n`);

    // console.log('✅ [SRV-ADM] Conectado com sucesso no PostgreSQL!\n');

    // [NOVO] Atualiza o status global
    pgConnectionStatus.connected = true;
    pgConnectionStatus.error = null;

    // [NOVO] Executa a verificação e atualização do esquema
    try {
        await checkAndUpgradeSchema(client);
    } catch (schemaError) {
        console.warn('⚠️ [DB-UPGRADE] Aviso: Não foi possível atualizar as colunas automaticamente (permissão negada).');
        console.warn(`   -> Erro: ${schemaError.message}`);
        console.warn('   -> O servidor continuará, mas algumas funcionalidades podem falhar até que o SQL seja executado manualmente.');
    }

    // [NOVO] Executa sincronização inicial de logins do FreeRADIUS (Correção Imediata)
    try {
        const checkRadacct = await client.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'radacct'");
        if (checkRadacct.rowCount > 0) {
            // console.log('🔄 [SYNC] A sincronizar histórico de logins do FreeRADIUS...');
            const syncResult = await client.query(`
                UPDATE userdetails u
                SET ultimo_login = r.last_login
                FROM (
                    SELECT username, MAX(acctstarttime) as last_login
                    FROM radacct
                    GROUP BY username
                ) r
                WHERE u.username = r.username
                AND (u.ultimo_login IS NULL OR u.ultimo_login < r.last_login)
            `);
            // console.log(`   ✅ [SYNC] ${syncResult.rowCount} registos de último login atualizados.`);
        }
    } catch (syncError) {
        console.warn('⚠️ [SYNC] Aviso: Falha na sincronização inicial de logins (verifique se o FreeRADIUS está configurado):', syncError.message);
    }

    // [NOVO] Inicia verificação periódica de campanhas (1x por hora)
    if (!maintenanceIntervalStarted) {
        maintenanceIntervalStarted = true;
        // console.log('🕒 [MAINTENANCE] Agendada verificação de campanhas expiradas (1h).');
        setInterval(async () => {
            try {
                // Usa uma nova conexão da pool para não interferir
                const client = await pool.connect();
                // [CORREÇÃO] Proteção para o cliente de manutenção
                const maintenanceErrorHandler = (err) => {
                    console.error('❌ [MAINTENANCE] Erro no cliente de campanhas:', err.message);
                };
                client.on('error', maintenanceErrorHandler);
                try {
                    const result = await client.query(`
                        UPDATE campaigns 
                        SET is_active = false 
                        WHERE is_active = true AND end_date < CURRENT_DATE
                    `);
                    if (result.rowCount > 0) {
                        // console.log(`[MAINTENANCE] ${result.rowCount} campanhas expiradas foram desativadas.`);
                    }

                    // [MODIFICADO] Arquivamento e Limpeza de logs de uptime antigos (mantém últimos 30 dias)
                    // 1. Seleciona os registos antigos
                    const oldLogsResult = await client.query("SELECT * FROM router_uptime_log WHERE collected_at < NOW() - INTERVAL '30 days' LIMIT 5000");
                    
                    if (oldLogsResult.rows.length > 0) {
                        const logsToArchive = oldLogsResult.rows;
                        const idsToDelete = logsToArchive.map(row => row.id);
                        
                        // 2. Prepara o diretório de arquivos
                        const archiveDir = path.join(__dirname, '../logs/archives');
                        if (!fs.existsSync(archiveDir)) {
                            fs.mkdirSync(archiveDir, { recursive: true });
                        }

                        // 3. Salva em ficheiro JSON (Acumulativo)
                        // O arquivo cresce até ser excluído manualmente ou via API.
                        const archiveFile = path.join(archiveDir, `uptime_archive_cumulative.json`);
                        
                        // Lê o arquivo existente ou inicia um array vazio
                        let fileContent = [];
                        if (fs.existsSync(archiveFile)) {
                            try {
                                fileContent = JSON.parse(fs.readFileSync(archiveFile, 'utf8'));
                            } catch (e) { /* Ignora erro de parse se arquivo estiver corrompido e sobrescreve/anexa */ }
                        }
                        
                        // Concatena e salva
                        const newContent = fileContent.concat(logsToArchive);
                        fs.writeFileSync(archiveFile, JSON.stringify(newContent, null, 2));

                        // 4. Apaga do banco de dados apenas os que foram arquivados
                        await client.query("DELETE FROM router_uptime_log WHERE id = ANY($1)", [idsToDelete]);
                        console.log(`[MAINTENANCE] ${idsToDelete.length} registos de uptime antigos foram arquivados em '${archiveFile}' e removidos do banco.`);
                    }

                } finally {
                    client.removeListener('error', maintenanceErrorHandler); // [CORREÇÃO] Remove listener
                    client.release();
                }
            } catch (err) {
                console.error('[MAINTENANCE] Erro ao verificar campanhas:', err.message);
            }
        }, 3600000); // 3600000 ms = 1 hora

        // [NOVO] Tarefas frequentes (5 min) - Sincronização de Logs Hotspot
        // console.log('🕒 [MAINTENANCE] Agendada sincronização de logins do FreeRADIUS (5m).');
        setInterval(async () => {
            try {
                const client = await pool.connect();
                // [CORREÇÃO] Proteção para o cliente de manutenção
                const syncErrorHandler = (err) => {
                    console.error('❌ [MAINTENANCE] Erro no cliente de logs:', err.message);
                };
                client.on('error', syncErrorHandler);
                try {
                    // Verifica se a tabela radacct existe
                    const checkRadacct = await client.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'radacct'");
                    
                    if (checkRadacct.rowCount > 0) {
                        // Sincroniza o último login da tabela radacct para userdetails
                        const syncResult = await client.query(`
                            UPDATE userdetails u
                            SET ultimo_login = r.last_login
                            FROM (
                                SELECT username, MAX(acctstarttime) as last_login
                                FROM radacct
                                GROUP BY username
                            ) r
                            WHERE u.username = r.username
                            AND (u.ultimo_login IS NULL OR u.ultimo_login < r.last_login)
                        `);
                        if (syncResult.rowCount > 0) {
                            // console.log(`[MAINTENANCE] Sincronizados ${syncResult.rowCount} registos de último login do Hotspot.`);
                        }
                    }
                } finally {
                    client.removeListener('error', syncErrorHandler); // [CORREÇÃO] Remove listener
                    client.release();
                }
            } catch (err) {
                console.error('[MAINTENANCE] Erro na sincronização de logins:', err.message);
            }
        }, 300000); // 5 minutos
    }

    client.release();
    return true; // Retorna sucesso
  } catch (err) {
    console.error('🚨 [SRV-ADM] Falha ao conectar ao PostgreSQL:', err.message);
    pgConnectionStatus.connected = false;
    pgConnectionStatus.error = err.message;
    startPgReconnect(); // Inicia as tentativas de reconexão
    return false; // Retorna falha
  }
};

module.exports = { pool, testInitialConnection, pgConnectionStatus, logOfflineEvent, startPgReconnect };
