// Carrega as variáveis de ambiente do ficheiro .env
const dotenv = require('dotenv');
const path = require('path');

// [SEGURANÇA] Carrega o .env se existir, permitindo o uso de credenciais seguras em produção.
const envPath = path.resolve(__dirname, '../.env');
if (require('fs').existsSync(envPath)) {
    // ...existing code...
    dotenv.config({ path: envPath });
}

const { Pool } = require('pg');
const { pool: pgPool } = require('./connection'); // [NOVO] Importa a pool de conexão principal
const { InfluxDB, Point } = require('@influxdata/influxdb-client');

// --- GUARDIÃO INTERNO: Previne que o agente pare em caso de erros ---
process.on('uncaughtException', (err) => {
    const msg = err.message || String(err);
    // [MELHORIA] Filtra erros de protocolo causados por instabilidade de rede (não são críticos do sistema)
    if (msg.includes('Tried to process unknown reply') || msg.includes('UNKNOWNREPLY') || msg.includes('!empty')) {
        console.warn(`[SISTEMA] ⚠️ Instabilidade de conexão detectada (Ignorando erro de protocolo): ${msg}`);
        return;
    }

    console.error(`[SISTEMA] ⚠️ Erro crítico capturado (o agente continuará rodando):`, err);
    // Não sai do processo (process.exit), permitindo que o setInterval continue
});

process.on('unhandledRejection', (reason, promise) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes('Tried to process unknown reply') || msg.includes('!empty')) {
         // Silencia erros de protocolo em promises para evitar poluição de logs
         return;
    }
    console.error('[SISTEMA] ⚠️ Promessa rejeitada não tratada:', reason);
});
// -------------------------------------------------------------------

// Ajuste da importação para suportar o pacote 'node-routeros'
let RouterOSClient;
try {
    const _mod = require('node-routeros');
    RouterOSClient = _mod.RouterOSAPI || _mod.default || _mod;
} catch (err) {
    console.error('[AGENTE] Não foi possível carregar "node-routeros":', err.message);
    console.error('Tente executar: npm install node-routeros --save');
    process.exit(1);
}

// --- 1. Configuração Inicial ---
const INFLUX_URL = process.env.INFLUXDB_URL;
const INFLUX_TOKEN = process.env.INFLUXDB_TOKEN;
const INFLUX_ORG = process.env.INFLUXDB_ORG;
const INFLUX_BUCKET = 'monitor';

const MIKROTIK_API_PORT = process.env.MIKROTIK_API_PORT || 8728;
const MIKROTIK_USER = process.env.MIKROTIK_USER;
const MIKROTIK_PASSWORD = process.env.MIKROTIK_PASSWORD;

const DB_HOST = process.env.DB_HOST;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_DATABASE = process.env.DB_DATABASE;
const DB_PORT = process.env.DB_PORT || 5432;

// Validação
if (!INFLUX_URL || !INFLUX_TOKEN || !INFLUX_ORG || !INFLUX_BUCKET) {
    console.error("❌ Erro: Variáveis do InfluxDB não definidas no .env.");
    process.exit(1);
}

if (!MIKROTIK_USER || !MIKROTIK_PASSWORD) {
    console.error("❌ Erro: Credenciais MikroTik não definidas.");
    process.exit(1);
}

// --- 2. Cliente InfluxDB ---
const influxDB = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
const writeApi = influxDB.getWriteApi(INFLUX_ORG, INFLUX_BUCKET);
// ...existing code...

// --- 3. Utilitários ---
const sanitizeKey = (k) => String(k).replace(/[^a-zA-Z0-9_]/g,'_').replace(/^_+|_+$/g,'').toLowerCase();

// Função para verificar se é número
const isNumeric = (value) => {
    if (value === null || value === undefined) return false;
    const str = String(value).trim();
    if (str === '' || str.toLowerCase() === 'na' || str.toLowerCase() === 'null' || 
        str.toLowerCase() === 'undefined' || str === '-' || str === '--') {
        return false;
    }
    const num = Number(str);
    return !isNaN(num) && isFinite(num);
};

// Converte tempo MikroTik para segundos
const parseMikroTikTime = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    
    let totalSeconds = 0;
    const weeks = timeStr.match(/(\d+)w/);
    const days = timeStr.match(/(\d+)d/);
    const hours = timeStr.match(/(\d+)h/);
    const minutes = timeStr.match(/(\d+)m/);
    const seconds = timeStr.match(/(\d+)s/);

    if (weeks) totalSeconds += parseInt(weeks[1], 10) * 604800;
    if (days) totalSeconds += parseInt(days[1], 10) * 86400;
    if (hours) totalSeconds += parseInt(hours[1], 10) * 3600;
    if (minutes) totalSeconds += parseInt(minutes[1], 10) * 60;
    if (seconds) totalSeconds += parseInt(seconds[1], 10);

    return totalSeconds;
};

// Campos a serem completamente ignorados durante a coleta.
const ignoredFields = {
    'interface_stats': new Set([
        'mtu', 'actual-mtu', 'l2mtu', 'max-l2mtu', '.id', 'fp-rx-byte', 'fp-tx-byte',
        'fp-rx-packet', 'fp-tx-packet', 'fp-rx-packets-per-second', 'fp-tx-packets-per-second',
        'fp-rx-bits-per-second', 'fp-tx-bits-per-second', 'comment', 'default_name', 'disabled', 'mac_address', 'running', 'slave', 'type'
    ]),
    'system_resource': new Set([
        'write-sect-since-reboot', 'write-sect-total', 'architecture-name', 
        'board-name', 'platform', 'build-time', 'factory-software'
    ]),
    'system_clock': new Set([
        'gmt-offset', 'dst-active', 'time-zone-name', 'time-zone-autodetect'
    ]),
    'ip_arp': new Set([
        '.id', 'dynamic', 'complete', 'published'
    ]),
    'ip_dhcp_server_lease': new Set([
        '.id', 'radius', 'dynamic', 'blocked', 'disabled', 'dhcp-option',
        'expires_after', 'last_seen', 'expires-after', 'last-seen' // [NOVO] Ignora campos de tempo que causam conflito
    ]),
    'hotspot_active': new Set(['.id']),
    'interface_wireless_registration_table': new Set([
        '.id', 'authentication-type', 'encryption', 'group-encryption', 'wmm-enabled'
    ])
};

// Lista de campos que devem SEMPRE ser números (FLOAT)
const alwaysNumericFields = new Set([
    // Campos de interface
    'rx_byte','tx_byte','rx_packet','tx_packet','rx_drop','tx_drop','tx_queue_drop','rx_error','tx_error', 'link_downs',
    'rx_packets_per_second','tx_packets_per_second','rx_bits_per_second','tx_bits_per_second',
    'rx_drops_per_second','tx_drops_per_second','rx_errors_per_second','tx_errors_per_second','tx_queue_drops_per_second',
    
    // Campos de sistema
    'cpu_load','free_memory','total_memory','free_hdd_space','total_hdd_space',
    'cpu_count','cpu_frequency','bad_blocks','write_sect_since_reboot','write_sect_total',
    
    // Campos de tempo convertidos (APENAS a versão em segundos)
    'uptime_seconds','age_seconds','expires_after_seconds','last_seen_seconds','session_time_left_seconds',
    
    // Campos de hotspot
    'bytes_in','bytes_out','packets_in','packets_out',
    
    // Campos wireless
    'p_throughput','tx_ccq','signal_strength','signal_to_noise','strength_at_rates',
    'rx_rate','tx_rate','packets','bytes','frames','frame_bytes','hw_frames','hw_frame_bytes',
    
    // Campo de saúde
    'value'
]);

// Lista de campos que devem SEMPRE ser strings
const alwaysStringFields = new Set([
    // IDs e identificadores
    '.id', 'id',
    
    // Endereços
    'address', 'mac-address', 'mac_address', 'active_address', 'active_mac_address',
    'server', 'active_server', 'host_name', 'client_id', 'active_client_id',
    
    // Nomes e descrições
    'name', 'user', 'default_name', 'interface_name', 'actual_interface',
    'version', // [NOVO] Informações de hardware e versão
    
    // Status e tipos
    'status', 'type', 'disabled', 'dynamic', 'invalid', 'running', 'slave',
    'group', 'last_logged_in', 'expired', 'address_lists',
    
    // Interfaces e redes
    'interface', 'network', 'ap', 'wds', 'routeros-version', 'last-ip',
    
    // DHCP
    'dhcp', 'dhcp_option',
    
    // Tempo original (antes da conversão) - SEMPRE string
    'uptime', 'age', 'expires_after', 'last_seen', 'session-time-left', 'date',
    'dst_active', 'gmt_offset', 'time_zone_autodetect', 'time_zone_name', 'last_link_down_time',
    
    // Campos de tempo e estado - SEMPRE string para evitar conflitos
    'idle_time', 'idle_timeout', 'keepalive_timeout', 
    'last_link_down_time', 'last_link_up_time',

    // Wireless
    'tx-rate-set', 'ssid', 'radio_name', 'security',
    
    // Adicionais para evitar conflitos
    'comment', 'default-name'
]);

// Função principal para escrever dados - REVISADA
const flattenAndWrite = (measurementName, item, extraTags = {}, host) => {
    const meas = String(measurementName).toLowerCase();
    const p = new Point(meas).tag('router_host', host || 'unknown');
    const debugFields = {}; // [DIAGNÓSTICO] Coleta campos para log

    // Adiciona tags extras
    for (const [k, v] of Object.entries(extraTags || {})) {
        if (v !== undefined && v !== null && v !== '') {
            p.tag(sanitizeKey(k), String(v));
        }
    }

    // Processa cada campo do item
    for (const [key, value] of Object.entries(item || {})) {
        if (value === undefined || value === null) continue;
        
        const sanitizedKey = sanitizeKey(key);
        const rawValue = String(value).trim();

        // 1. Verifica se o campo deve ser ignorado
        if (ignoredFields[meas] && (ignoredFields[meas].has(key) || ignoredFields[meas].has(sanitizedKey))) {
            continue;
        }

        // 2. Tratamento especial para cpu-load que pode vir com %
        if (sanitizedKey === 'cpu_load' && typeof value === 'string' && value.includes('%')) {
            const num = parseFloat(value.replace('%', ''));
            if (!isNaN(num)) {
                p.floatField(sanitizedKey, num);
                debugFields[sanitizedKey] = num;
                continue;
            }
        }
 // 3. Campos que DEVEM ser strings
        if (alwaysStringFields.has(sanitizedKey) || alwaysStringFields.has(key)) {
            // Garante que valores vazios não sejam escritos
    if (rawValue !== '') {
                p.stringField(sanitizedKey, rawValue);
                debugFields[sanitizedKey] = rawValue;
            }
            continue;
        }

        // 4. Campos que DEVEM ser números (FLOAT)
        if (alwaysNumericFields.has(sanitizedKey) || alwaysNumericFields.has(key)) {
            if (isNumeric(value)) {
                p.floatField(sanitizedKey, Number(value));
                debugFields[sanitizedKey] = Number(value);
            } else {
                // Se não for numérico, força 0.0 para manter tipo consistente
                p.floatField(sanitizedKey, 0.0);
                debugFields[sanitizedKey] = 0.0;
            }
            continue;
        }

        // 5. Campos não especificados: decide baseado no valor
        // Para evitar conflitos de schema, ignora campos desconhecidos
        if (isNumeric(value)) {
            // Se for numérico, escreve como float
            p.floatField(sanitizedKey, Number(value));
            debugFields[sanitizedKey] = Number(value);
        }
        // Campos não numéricos e não especificados são ignorados
    }

    try {
        // [DIAGNÓSTICO] Log do que está sendo gravado
        // console.log(`[GRAVANDO] ${meas} | Host: ${host}`);
        writeApi.writePoint(p);
    } catch (e) {
        console.error(`[INFLUXDB] Erro ao escrever ponto ${measurementName}:`, e.message);
    }
};

// Coleta usuários do Hotspot
const getHotspotActiveUsers = async (host, client, writer, runCommand) => {
    try {
        const hotspotUsers = await runCommand('/ip/hotspot/active/print');
        if (hotspotUsers && hotspotUsers.length > 0) {
            // console.log(`[API] ${hotspotUsers.length} usuários ativos no Hotspot em ${host}.`);
            hotspotUsers.forEach(user => {
                const filteredUser = { ...user };
                delete filteredUser['.id'];
                
                const tags = user.user ? { user: user.user } : {};
                writer('hotspot_active', filteredUser, tags, host);
            });
        }
    } catch (e) {
        console.warn(`[API] Hotspot em ${host}: ${e.message}`);
    }
};

// [NOVO] Inicializa tabela de logs no PostgreSQL
const initLogTable = async () => {
    // [CORRIGIDO] Usa a pool de conexão importada diretamente.
    // A declaração local de 'pgPool' foi removida para evitar o erro 'Identifier has already been declared'.
    const pool = pgPool;
    if (!pool) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS connection_logs (
                id SERIAL PRIMARY KEY,
                router_host VARCHAR(50),
                level VARCHAR(20),
                message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('[DB] Tabela de logs verificada/criada.');
    } catch (e) {
        console.error('[DB] Erro ao criar tabela de logs:', e.message);
    }
};

// [NOVO] Função centralizada para salvar logs (Console + Banco)
const logToDB = async (level, message, host = null) => {
    const prefix = host ? `[${host}]` : `[SISTEMA]`;
    
    // 1. Log no Console (mantém o comportamento visual atual)
    if (level === 'ERROR') console.error(`${prefix} ❌ ${message}`);
    else if (level === 'WARN') console.warn(`${prefix} ⚠️ ${message}`);
    else console.log(`${prefix} ℹ️ ${message}`);

    // 2. Log no Banco de Dados
    const pool = pgPool; // [CORRIGIDO] Usa a pool importada
    if (!pool) return;

    try {
        await pool.query(
            'INSERT INTO connection_logs (router_host, level, message, created_at) VALUES ($1, $2, $3, NOW())',
            [host, level, message]
        );
    } catch (e) {
        console.error(`[DB] Erro ao salvar log: ${e.message}`);
    }
};

// Busca a lista de roteadores do PostgreSQL.
const getRoutersFromDB = async () => {
    if (!DB_HOST || !DB_USER || !DB_DATABASE) {
        console.warn('[AVISO] PostgreSQL não configurado. Usando ROUTER_HOSTS do .env.');
        return process.env.ROUTER_HOSTS ? process.env.ROUTER_HOSTS.split(',').map(h => h.trim()) : [];
    }

    const pool = pgPool; // [CORRIGIDO] Usa a pool importada
    if (!pool) {
        console.warn('[AVISO] Pool PostgreSQL não disponível.');
        return [];
    }

    try {
        const res = await pool.query("SELECT ip_address FROM routers WHERE ip_address IS NOT NULL AND ip_address <> ''");
        return res.rows.map(row => row.ip_address.trim());
    } catch (err) {
        logToDB('ERROR', `Erro PostgreSQL ao buscar roteadores: ${err.message}`);
        return [];
    }
};

// Coleta métricas de um roteador
const collectMetrics = async (host) => {
    console.log(`[${new Date().toISOString()}] [AGENT] ⏳ Iniciando coleta para ${host}...`);

    const client = new RouterOSClient({
        host: host,
        port: MIKROTIK_API_PORT,
        user: MIKROTIK_USER,
        password: MIKROTIK_PASSWORD,
        timeout: 30, // [AUMENTADO] Timeout de conexão aumentado para 30s para redes lentas
        keepalive: false
    });

    // [CORREÇÃO] Adiciona listener para erros de conexão (evita o crash "Unhandled 'error' event")
    client.on('error', (err) => {
        const msg = err.message || String(err);
        if (msg.includes('Tried to process unknown reply') || msg.includes('!empty')) {
            // Ignora erros de protocolo conhecidos para não poluir o log
            return;
        }
        logToDB('ERROR', `Erro de conexão (Socket): ${msg}`, host);
    });

    const runCommand = async (cmd, args = []) => {
        try {
            // [MELHORIA] Timeout forçado por comando (10s).
            // Essencial para 4G/Ônibus: Se o sinal cair DURANTE o comando, evita que o agente fique travado esperando.
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout: O roteador parou de responder (possível perda de sinal)')), 20000) // [AUMENTADO] 20s para comandos
            );
            
            return await Promise.race([client.write(cmd, args), timeoutPromise]);
        } catch (e) {
            throw e;
        }
    };

    try {
        // Conectar
        await client.connect();
        // console.log(`[API] Conectado a ${host}. Coletando...`);

        // Verificar pacotes
        const packages = await runCommand('/system/package/print');
        const isWave2Enabled = packages.some(pkg => pkg.name === 'wifiwave2' && pkg.disabled === 'false');
        const isLegacyWirelessEnabled = packages.some(pkg => pkg.name === 'wireless' && pkg.disabled === 'false');

        // Comandos básicos
        const commands = [
            '/system/resource/print',
            '/system/clock/print',
            '/ip/address/print',
            // '/ip/arp/print', // Desativado para focar em dados numéricos
            '/ip/dhcp-server/lease/print', // [ATIVADO] Coleta de clientes DHCP.
            '/user/print'
        ];

        // Adicionar comando wireless apropriado
        if (isWave2Enabled) {
            // console.log(`[API] wifiwave2 detectado em ${host}.`);
            commands.push('/interface/wifiwave2/registration-table/print');
        } else if (isLegacyWirelessEnabled) {
            // console.log(`[API] wireless detectado em ${host}.`);
            commands.push('/interface/wireless/registration-table/print');
        }

        // Executar comandos
        for (const cmd of commands) {
            try {
                const res = await runCommand(cmd);
                if (!res) continue;

                const rows = Array.isArray(res) ? res : [res];
                let measurement = cmd
                    .replace(/^\//, '')
                    .replace(/\/print$/, '')
                    .replace(/\//g, '_')
                    .replace(/-/g, '_');

                // Normalizar nome da medição wireless
                if (measurement === 'interface_wifiwave2_registration_table') {
                    measurement = 'interface_wireless_registration_table';
                }

                // Processar cada linha
                rows.forEach(row => {
                    const filteredRow = { ...row };
                    
                    // Converter campos de tempo e adicionar versão em segundos
                    // IMPORTANTE: Remover campos originais de tempo para evitar conflitos
                    if (measurement === 'system_resource' && row.uptime) {
                        filteredRow.uptime_seconds = parseMikroTikTime(row.uptime);
                        // REMOVE o campo original para evitar conflito string/float
                        delete filteredRow.uptime;
                    }
                    
                    if (measurement === 'ip_dhcp_server_lease') {
                        if (row.age) {
                            filteredRow.age_seconds = parseMikroTikTime(row.age);
                            delete filteredRow.age; // Remove original
                        }
                        // [REMOVIDO] Conversão de expires_after e last_seen removida conforme solicitado
                    }
                    
                    if (measurement === 'interface_wireless_registration_table' && row.uptime) {
                        filteredRow.uptime_seconds = parseMikroTikTime(row.uptime);
                        delete filteredRow.uptime; // Remove original
                    }
                    
                    flattenAndWrite(measurement, filteredRow, {}, host);
                });
            } catch (e) {
                console.warn(`[API] Comando "${cmd}" em ${host}: ${e.message}`);
            }
        }

        // Coletar métricas de interface - REVISADO
        try {
            const intfRes = await runCommand('/interface/print');
            const interfaces = Array.isArray(intfRes) ? intfRes : [intfRes];
            
            for (const iface of interfaces) {
                const name = iface.name;
                if (!name) continue;

                // [NOVO] Escreve os dados de status da interface (link-downs, etc) do comando /interface/print
                // A função flattenAndWrite já tem a lógica de ignorar campos desnecessários.
                flattenAndWrite('interface_stats', iface, {
                    interface_name: name,
                    interface_type: iface.type || 'unknown'
                }, host);

                // Pular interfaces específicas que causam problemas
                if (name.includes('bridge') || name.includes('vlan') || name.includes('ppp')) {
                    continue;
                }

                const trafficStats = await runCommand(
                    '/interface/monitor-traffic', 
                    [`=interface=${name}`, '=once=yes']
                );
                
                if (trafficStats && trafficStats[0]) {
                    const stats = trafficStats[0];
                    
                    // Criar objeto limpo com APENAS campos numéricos conhecidos
                    const interfaceData = {
                        rx_byte: stats['rx-byte'] || 0,
                        tx_byte: stats['tx-byte'] || 0,
                        rx_packet: stats['rx-packet'] || 0,
                        tx_packet: stats['tx-packet'] || 0,
                        rx_drop: stats['rx-drop'] || 0,
                        tx_drop: stats['tx-drop'] || 0,
                        rx_error: stats['rx-error'] || 0,
                        tx_error: stats['tx-error'] || 0,
                        rx_packets_per_second: stats['rx-packets-per-second'] || 0,
                        tx_packets_per_second: stats['tx-packets-per-second'] || 0,
                        rx_bits_per_second: stats['rx-bits-per-second'] || 0,
                        tx_bits_per_second: stats['tx-bits-per-second'] || 0
                    };
                    
                    flattenAndWrite('interface_stats', interfaceData, { 
                        interface_name: name,
                        interface_type: iface.type || 'unknown'
                    }, host);
                }
            }
        } catch (e) {
            console.warn(`[API] Interfaces em ${host}: ${e.message}`);
        }

        // Coletar usuários Hotspot (com tratamento especial)
        try {
            const hotspotUsers = await runCommand('/ip/hotspot/active/print');
            if (hotspotUsers && hotspotUsers.length > 0) {
                // console.log(`[API] ${hotspotUsers.length} usuários ativos no Hotspot em ${host}.`);
                hotspotUsers.forEach(user => {
                    const filteredUser = { 
                        user: user.user || '',
                        address: user.address || '',
                        mac_address: user['mac-address'] || '',
                        bytes_in: user['bytes-in'] || 0,
                        bytes_out: user['bytes-out'] || 0,
                        packets_in: user['packets-in'] || 0,
                        packets_out: user['packets-out'] || 0,
                        uptime_seconds: parseMikroTikTime(user.uptime || '0s'),
                        session_time_left_seconds: parseMikroTikTime(user['session-time-left'] || '0s')
                    };
                    
                    const tags = user.user ? { user: user.user } : {};
                    flattenAndWrite('hotspot_active', filteredUser, tags, host);
                });
            }
        } catch (e) {
            console.warn(`[API] Hotspot em ${host}: ${e.message}`);
        }

        // Desconectar
        await client.close();
        // console.log(`[${new Date().toISOString()}] [AGENT] ✅ Coleta finalizada para ${host}.`);
        return true; // Sucesso
    } catch (err) {
        logToDB('ERROR', `Falha na coleta: ${err.message}`, host);
        try { 
            await client.close(); 
        } catch (_) {
            // Ignora erros de fechamento
        }
        return false; // Falha
    }
};

// --- 4. Ciclo Principal ---
const runMonitoringCycle = async () => {
    // console.log(`\n[${new Date().toISOString()}] 🔄 Iniciando coleta de roteadores.`);
    
    let routerHosts = [];
    try {
        routerHosts = await getRoutersFromDB();
        // console.log(`[CONFIG] ${routerHosts.length} roteadores encontrados: ${routerHosts.join(', ')}`);
    } catch (err) {
        console.error('❌ Erro ao obter lista de roteadores:', err.message);
        return;
    }

    if (routerHosts.length === 0) {
        console.warn('[AVISO] Nenhum roteador configurado. Aguardando próximo ciclo.');
        return;
    }

    const successfulHosts = [];
    const failedHosts = [];

    // Processar em sequência para evitar sobrecarga
    for (const host of routerHosts) {
        const success = await collectMetrics(host);
        if (success) successfulHosts.push(host);
        else failedHosts.push(host);
    }

    // console.log(`[${new Date().toISOString()}] ✅ Coleta finalizada.`);

    // console.log(`[${new Date().toISOString()}] 📤 Enviando para o DB influx...`);
    try {
        await writeApi.flush();
        // console.log(`[${new Date().toISOString()}] ✅ Enviado com sucesso (Influx).`);
    } catch (e) {
        logToDB('ERROR', `Erro InfluxDB: ${e.message || e}`);
    }

    if (successfulHosts.length > 0) {
        // console.log(`[${new Date().toISOString()}] 📤 Enviando para o DB postgre...`);
        try {
            const client = await pgPool.connect();
            try {
                await client.query('BEGIN');
                for (const host of successfulHosts) {
                    await client.query('INSERT INTO router_uptime_log (router_host, collected_at) VALUES ($1, NOW())', [host]);
                }
                await client.query('COMMIT');
                // console.log(`[${new Date().toISOString()}] ✅ Enviado com sucesso (Postgres).`);
            } catch (pgErr) {
                await client.query('ROLLBACK');
                console.error(`[DB] Erro ao salvar logs de uptime: ${pgErr.message}`);
            } finally {
                client.release();
            }
        } catch (e) {
             console.error(`[DB] Erro de conexão PG: ${e.message}`);
        }
    }

    if (failedHosts.length > 0) {
        console.error(`[${new Date().toISOString()}] ❌ Falha ao coletar nos roteadores: ${failedHosts.join(', ')}`);
    }
};

// Limpeza de recursos
const cleanup = () => {
    // ...existing code...
    if (pgPool) {
        pgPool.end();
    }
    writeApi.close();
};

// Iniciar agente
const startAgent = async () => {
    await initLogTable(); // Garante que a tabela de logs existe antes de começar

    const intervalSeconds = 30;
    // ...existing code...
    
    // Executar imediatamente
    runMonitoringCycle();
    
    // Agendar próximo ciclo - CORRIGIDO: usar intervalSeconds * 1000
    const interval = setInterval(runMonitoringCycle, intervalSeconds * 1000);
    
    // Configurar handlers para encerramento
    process.on('SIGINT', () => {
        clearInterval(interval);
        cleanup();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        clearInterval(interval);
        cleanup();
        process.exit(0);
    });
};

// Iniciar
startAgent();