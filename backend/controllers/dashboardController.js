// Ficheiro: backend/controllers/dashboardController.js

const { pool, pgConnectionStatus } = require('../connection');
const { getInfluxConnectionStatus } = require('../services/influxService');
const fs = require('fs');
const path = require('path');
const si = require('systeminformation'); // [NOVO] Biblioteca para info do sistema
const cacheService = require('../services/cacheService'); // [NOVO]
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const getDashboardStats = async (req, res) => {
    try {
        // Usamos Promise.all para executar todas as queries em paralelo
        const [
            bannersRes,
            campaignsRes,
            templatesRes,
            usersRes
        ] = await Promise.all([
            pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active = true) AS active FROM banners;`),
            pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE CURRENT_DATE BETWEEN start_date AND end_date) AS active FROM campaigns;`),
            pool.query(`SELECT COUNT(*) AS total FROM templates;`), // Esta query já está correta, apenas total.
            pool.query(`SELECT 
                            COUNT(*) AS total, 
                            COUNT(*) FILTER (WHERE creationdate >= NOW() - INTERVAL '30 days') AS last30days 
                        FROM userdetails;`)
        ]);

        const stats = {
            banners: {
                total: parseInt(bannersRes.rows[0].total, 10),
                active: parseInt(bannersRes.rows[0].active, 10),
                inactive: parseInt(bannersRes.rows[0].total, 10) - parseInt(bannersRes.rows[0].active, 10)
            },
            campaigns: {
                total: parseInt(campaignsRes.rows[0].total, 10),
                active: parseInt(campaignsRes.rows[0].active, 10),
                inactive: parseInt(campaignsRes.rows[0].total, 10) - parseInt(campaignsRes.rows[0].active, 10)
            },
            templates: {
                total: parseInt(templatesRes.rows[0].total, 10),
                // Templates não possuem estado ativo/inativo, então não os retornamos.
                // O frontend será ajustado para lidar com isso.
            },
            users: {
                total: parseInt(usersRes.rows[0].total, 10),
                last30Days: parseInt(usersRes.rows[0].last30days, 10)
            }
        };

        res.json({ success: true, data: stats });

    } catch (error) {
        console.error('Erro ao buscar estatísticas do dashboard:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar estatísticas.' });
    }
};

/**
 * [NOVO] Obtém as estatísticas completas para o Dashboard Analítico.
 */
const getAnalyticsStats = async (req, res) => {
    try {
        // [NOVO] Tenta buscar do cache primeiro
        const cachedStats = await cacheService.get('analytics_stats');
        if (cachedStats) {
            console.log('[CACHE] Retornando estatísticas analíticas do cache.');
            return res.json({ success: true, data: cachedStats });
        }

        // Executa todas as consultas de agregação em paralelo para maior eficiência
        const [
            loginsRes,
            hotspotUsersRes,
            routersRes,
            ticketsRes,
            lgpdRes,
            adminActivityRes, // [CORRIGIDO] Nome da variável ajustado para clareza (era routerActivityRes na ordem errada ou implícita)
            lastWinnersRes,
            rafflesRes, // [NOVO]
            campaignsRes, // [NOVO]
            bufferCountRes, // [NOVO] Resultado do buffer offline
            groupDistRes,   // [NOVO] Distribuição por grupo
            topRoutersRes   // [NOVO] Top roteadores
        ] = await Promise.all([
            // 1. Acessos ao Painel
            pool.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE action = 'LOGIN_SUCCESS') AS success,
                    COUNT(*) FILTER (WHERE action = 'LOGIN_FAILURE') AS failure
                FROM audit_logs;
            `),
            // 2. Utilizadores do Hotspot
            pool.query(`
                SELECT 
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE accepts_marketing = true) AS marketing
                FROM userdetails;
            `),
            // 3. Status dos Roteadores
            pool.query(`SELECT status, COUNT(*) FROM routers GROUP BY status;`),
            // 4. Tickets de Suporte
            pool.query(`SELECT status, COUNT(*) FROM tickets GROUP BY status;`),
            // 5. Pedidos LGPD
            pool.query(`SELECT status, COUNT(*) FROM data_exclusion_requests GROUP BY status;`),
            // 6. Atividade por Roteador
            // [CORREÇÃO] Esta query estava a ser usada para routerActivity, mas precisamos de adminActivity também.
            // Vamos adicionar uma query específica para adminActivity ou ajustar a ordem.
            // Para corrigir o erro relatado, precisamos garantir que adminActivity venha preenchido.
            // Vou adicionar a query de atividade de admin aqui.
            pool.query(`
                SELECT COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours') as actions_last_24h FROM audit_logs;
            `),
            // 7. Últimos Vencedores de Sorteios
            pool.query(`
                SELECT r.raffle_number, r.title, u.username AS winner_email
                FROM raffles r
                JOIN userdetails u ON r.winner_id = u.id
                WHERE r.winner_id IS NOT NULL
                ORDER BY r.created_at DESC
                LIMIT 5;
            `),
            // 8. Estatísticas de Sorteios [NOVO]
            pool.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE winner_id IS NULL) as active,
                    COUNT(*) as total
                FROM raffles;
            `),
            // 9. Estatísticas de Campanhas [NOVO]
            pool.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE is_active = true AND CURRENT_DATE BETWEEN start_date AND end_date) as active,
                    SUM(view_count) as total_views
                FROM campaigns;
            `),
            // 10. Buffer de Erros Offline [NOVO]
            (async () => {
                const logFilePath = path.join(__dirname, '../services/offline_error_log.json');
                if (fs.existsSync(logFilePath)) {
                    try {
                        const fileContent = fs.readFileSync(logFilePath, 'utf-8');
                        const logs = fileContent ? JSON.parse(fileContent) : [];
                        return logs.length;
                    } catch (e) { return 0; }
                }
                return 0;
            })(),
            // 11. Distribuição de Usuários por Grupo [NOVO]
            pool.query(`
                SELECT rg.name as group_name, COUNT(u.id)::int as user_count
                FROM router_groups rg
                JOIN routers r ON r.group_id = rg.id
                JOIN userdetails u ON u.router_name = r.name
                GROUP BY rg.name
            `),
            // 12. Top Roteadores por Usuários [NOVO]
            pool.query(`
                SELECT router_name, COUNT(*)::int as user_count
                FROM userdetails
                WHERE router_name IS NOT NULL
                GROUP BY router_name
                ORDER BY user_count DESC
                LIMIT 10
            `)
        ]);

        // Formata os resultados para enviar ao frontend
        const stats = {
            logins: loginsRes.rows[0],
            hotspotUsers: hotspotUsersRes.rows[0],
            routers: routersRes.rows.reduce((acc, row) => ({ ...acc, [row.status]: parseInt(row.count) }), { online: 0, offline: 0 }),
            tickets: ticketsRes.rows.reduce((acc, row) => ({ ...acc, [row.status]: parseInt(row.count) }), { open: 0, in_progress: 0, closed: 0 }),
            lgpd: lgpdRes.rows.reduce((acc, row) => ({ ...acc, [row.status]: parseInt(row.count) }), { pending: 0, completed: 0 }),
            adminActivity: {
                actionsLast24h: parseInt(adminActivityRes.rows[0].actions_last_24h, 10) || 0,
                mostActiveAdmin: 'N/A' // Simplificação para evitar query complexa se não for crítica
            },
            lastWinners: lastWinnersRes.rows,
            raffles: {
                active: parseInt(rafflesRes.rows[0].active, 10) || 0,
                total: parseInt(rafflesRes.rows[0].total, 10) || 0
            },
            campaigns: {
                active: parseInt(campaignsRes.rows[0].active, 10) || 0,
                totalViews: parseInt(campaignsRes.rows[0].total_views, 10) || 0
            },
            serverHealth: {
                uptime: process.uptime() * 1000, // Em milissegundos para consistência com JS Date
                radiusStatus: 'online', // Simulado, idealmente viria de uma verificação real
                bufferCount: typeof bufferCountRes === 'number' ? bufferCountRes : 0,
                postgres: { ...pgConnectionStatus },
                influx: getInfluxConnectionStatus()
            },
            // [NOVO] Dados para os gráficos de roteadores
            userDistributionByGroup: {
                labels: groupDistRes.rows.map(r => r.group_name),
                data: groupDistRes.rows.map(r => parseInt(r.user_count, 10))
            },
            userDistributionByRouter: {
                labels: topRoutersRes.rows.map(r => r.router_name),
                data: topRoutersRes.rows.map(r => parseInt(r.user_count, 10))
            }
        };

        // Calcula o total de tickets
        stats.tickets.total = stats.tickets.open + stats.tickets.in_progress + stats.tickets.closed;

        // [NOVO] Salva no cache por 5 minutos (300 segundos)
        await cacheService.set('analytics_stats', stats, 300);

        res.json({ success: true, data: stats });

    } catch (error) {
        console.error('Erro ao buscar estatísticas do Dashboard Analítico:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar estatísticas.' });
    }
};

// [NOVO] Função auxiliar para buscar métricas de servidores remotos via SSH
const getRemoteServerStats = async (name, ip) => {
    try {
        // [SEGURANÇA] Validação rigorosa de IP para prevenir Command Injection
        // Aceita apenas IPv4 válido.
        const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ip || !ipRegex.test(ip)) {
            return { name, ip, online: false, error: 'Endereço IP inválido.' };
        }

        // Comando SSH otimizado para buscar Load Avg, Memória e Disco numa única conexão
        // Requer configuração de chaves SSH (ssh-copy-id) para o utilizador root (ou outro configurado)
        const cmd = `ssh -o BatchMode=yes -o ConnectTimeout=2 -o StrictHostKeyChecking=no root@${ip} 'cat /proc/loadavg; echo "---"; free -b; echo "---"; df -B1 /'`;
        
        const { stdout } = await exec(cmd);
        const parts = stdout.split('---');

        // 1. CPU (Load Average 1min)
        const loadAvg = parseFloat(parts[0].trim().split(' ')[0]);
        // Estima % de uso baseado em 1 core (ajuste simples para visualização)
        // MX Linux geralmente é leve, load > 1.0 indica uso intenso
        const cpuPercent = Math.min(Math.round(loadAvg * 100), 100); 

        // 2. Memória
        const memLines = parts[1].trim().split('\n');
        // free -b output: Mem: total used free ...
        const memValues = memLines[1].match(/(\d+)/g); 
        const totalMem = parseInt(memValues[0], 10);
        const usedMem = parseInt(memValues[1], 10);
        const memPercent = Math.round((usedMem / totalMem) * 100);

        // 3. Disco
        const diskLines = parts[2].trim().split('\n');
        // df output: Filesystem 1B-blocks Used Available Use% ...
        const diskValues = diskLines[1].match(/(\d+)/g);
        const totalDisk = parseInt(diskValues[0], 10);
        const usedDisk = parseInt(diskValues[1], 10);
        const diskPercent = Math.round((usedDisk / totalDisk) * 100);

        return { name, ip, online: true, cpu: cpuPercent, load: loadAvg, memory: { total: totalMem, used: usedMem, percent: memPercent }, disk: { total: totalDisk, used: usedDisk, percent: diskPercent } };
    } catch (error) {
        // console.warn(`Falha ao conectar ao servidor ${name} (${ip}): ${error.message}`);
        return { name, ip, online: false, error: error.message };
    }
};

/**
 * [NOVO] Obtém dados de saúde do sistema (Conexões, Uptime, Erros).
 */
const getSystemHealth = async (req, res) => {
    try {
        const checkRemote = req.query.checkRemote === 'true';

        // 1. Status das Conexões
        const pgStatus = { ...pgConnectionStatus };
        const influxStatus = getInfluxConnectionStatus();

        // 2. Uptime do Servidor (em segundos)
        const uptimeSeconds = process.uptime();

        // [NOVO] Métricas de Hardware do Servidor
        const promises = [
            si.currentLoad(),
            si.mem(),
            si.fsSize(),
            si.cpuTemperature()
        ];

        // Só adiciona as promessas de SSH se solicitado explicitamente
        if (checkRemote) {
            promises.push(getRemoteServerStats('SRV Service', '10.0.0.45'));
            promises.push(getRemoteServerStats('SRV Portal Hotspot', '10.0.0.46'));
        }

        const results = await Promise.all(promises);
        const [cpuLoad, mem, fsSize, temp] = results;

        let remoteServers = [];
        if (checkRemote) {
            remoteServers = [results[4], results[5]];
        } else {
            // Retorna estado neutro se não for solicitado
            const srvService = { name: 'SRV Service', ip: '10.0.0.45', online: false, error: 'Clique em "Verificar Conexão" para atualizar.' };
            const srvPortal = { name: 'SRV Portal Hotspot', ip: '10.0.0.46', online: false, error: 'Clique em "Verificar Conexão" para atualizar.' };
            remoteServers = [srvService, srvPortal];
        }

        // 3. Buffer de Erros Offline
        const logFilePath = path.join(__dirname, '../services/offline_error_log.json');
        let bufferCount = 0;
        if (fs.existsSync(logFilePath)) {
            try {
                const fileContent = fs.readFileSync(logFilePath, 'utf-8');
                const logs = fileContent ? JSON.parse(fileContent) : [];
                bufferCount = logs.length;
            } catch (e) {
                console.error("Erro ao ler buffer offline:", e);
            }
        }

        // 4. Últimos Erros de Sistema (apenas se DB estiver online)
        let recentErrors = [];
        if (pgStatus.connected) {
            try {
                const errorsResult = await pool.query('SELECT id, error_message, timestamp FROM system_errors ORDER BY timestamp DESC LIMIT 5');
                recentErrors = errorsResult.rows;
            } catch (e) {
                console.error("Erro ao buscar erros recentes:", e);
                recentErrors = [];
            }
        }

        res.json({
            success: true,
            data: {
                postgres: pgStatus,
                influx: influxStatus,
                uptime: uptimeSeconds,
                bufferCount: bufferCount,
                recentErrors: recentErrors,
                // [NOVO] Dados de Hardware
                hardware: {
                    cpu: Math.round(cpuLoad.currentLoad),
                    memory: {
                        total: mem.total,
                        used: mem.active,
                        percent: Math.round((mem.active / mem.total) * 100)
                    },
                    disk: fsSize.length > 0 ? { used: fsSize[0].use, size: fsSize[0].size, usedBytes: fsSize[0].used } : null,
                    temp: (temp.main && temp.main > 0) ? temp.main : 'N/A'
                },
                remoteServers: remoteServers // [NOVO] Envia dados dos servidores remotos
            }
        });
    } catch (error) {
        console.error('Erro ao buscar saúde do sistema:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar saúde do sistema.' });
    }
};

/**
 * [NOVO] Obtém a lista de utilizadores de um roteador específico (ou todos).
 * Retorna: Nome de Utilizador, E-mail, Último Login.
 */
const getRouterUsers = async (req, res) => {
    const { routerName } = req.query;

    try { // [CORRIGIDO] A coluna de email na tabela 'userdetails' é 'username'.
        let query = `
            SELECT nome_completo as fullname, username as email, ultimo_login as last_login
            FROM userdetails
        `;

        const params = [];

        if (routerName && routerName !== 'all') {
            query += ` WHERE router_name = $1`;
            params.push(routerName);
        }

        query += ` ORDER BY ultimo_login DESC NULLS LAST LIMIT 100;`;

        const { rows } = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Erro ao buscar utilizadores do roteador:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar utilizadores.' });
    }
};

/**
 * [NOVO] Obtém detalhes analíticos das campanhas (Templates mais usados, Top Campanhas)
 */
const getCampaignsAnalytics = async (req, res) => {
    try {
        // 1. Templates mais utilizados em campanhas ativas
        const templatesQuery = `
            SELECT t.name as template_name, COUNT(c.id)::int as campaign_count, COALESCE(SUM(c.view_count), 0)::int as total_views
            FROM templates t
            JOIN campaigns c ON c.template_id = t.id
            WHERE c.is_active = true
            GROUP BY t.name
            ORDER BY total_views DESC
            LIMIT 5
        `;
        
        // 2. Top 10 Campanhas por visualização
        const campaignsQuery = `
            SELECT name, view_count
            FROM campaigns
            WHERE is_active = true
            ORDER BY view_count DESC
            LIMIT 10
        `;

        const [templatesRes, campaignsRes] = await Promise.all([
            pool.query(templatesQuery),
            pool.query(campaignsQuery)
        ]);

        res.json({
            success: true,
            data: {
                top_templates_table: templatesRes.rows,
                top_campaigns_chart: {
                    labels: campaignsRes.rows.map(c => c.name),
                    data: campaignsRes.rows.map(c => parseInt(c.view_count, 10))
                }
            }
        });
    } catch (error) {
        console.error('Erro ao buscar análise de campanhas:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
};

/**
 * [NOVO] Obtém detalhes analíticos de saúde do servidor (Eventos recentes)
 */
const getServerHealthAnalytics = async (req, res) => {
    try {
        const eventsRes = await pool.query("SELECT timestamp, action, description FROM audit_logs ORDER BY timestamp DESC LIMIT 20");
        res.json({ success: true, data: { service_events: eventsRes.rows } });
    } catch (error) {
        console.error('Erro ao buscar análise de saúde:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
};

module.exports = { getDashboardStats, getAnalyticsStats, getSystemHealth, getRouterUsers, getCampaignsAnalytics, getServerHealthAnalytics };