const express = require('express');
const router = express.Router();
const { pool } = require('../connection'); // [MODIFICADO] Usa a pool de conexão do PostgreSQL
const { queryApi, influxBucket } = require('../services/influxService'); // [NOVO] Importa o serviço centralizado do InfluxDB
const verifyToken = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');

/**
 * @route   GET /api/monitoring/router-status
 * @desc    Busca todos os roteadores do PostgreSQL e o seu status de monitorização mais recente da InfluxDB.
 * @access  Private (adicione o seu middleware de autenticação aqui)
 */
router.get('/router-status', [verifyToken, checkPermission('routers.monitoring.read')], async (req, res) => {
    // [REFEITO] Esta rota está obsoleta. A lógica foi movida e melhorada na rota /all-routers-status.
    // Mantida para compatibilidade, mas redireciona para a nova lógica para centralizar o código.
    console.warn('[AVISO] A rota /api/monitoring/router-status está obsoleta. Use /api/monitoring/all-routers-status.');
    res.redirect(301, '/api/monitoring/all-routers-status');
});

/**
 * @route   GET /api/monitoring/router/:id/cpu-history
 * @desc    Busca o histórico de uso de CPU para um roteador específico.
 * @access  Private
 * @query   range - O período de tempo (ex: '1h', '6h', '24h', '7d'). Padrão: '1h'.
 */
router.get('/router/:id/cpu-history', [verifyToken, checkPermission('routers.dashboard.read')], async (req, res) => {
    try {
        const { id } = req.params;
        const range = req.query.range || '1h'; // Padrão de 1 hora se não for especificado

        // 1. Buscar o IP do roteador no PostgreSQL usando o ID
        const routerQuery = await pool.query(
            "SELECT ip_address FROM routers WHERE id = $1", // CORREÇÃO: Usa a coluna 'ip_address'
            [id]
        );

        if (routerQuery.rows.length === 0) {
            return res.status(404).json({ message: 'Roteador não encontrado.' });
        }
        const routerIp = routerQuery.rows[0].ip_address; // CORREÇÃO: Usa a coluna correta

        // 2. Criar a query Flux para buscar a série temporal
        const fluxQuery = `
            from(bucket: "${influxBucket}")
              |> range(start: -${range})
              |> filter(fn: (r) => r._measurement == "system_resource")
              |> filter(fn: (r) => r._field == "cpu_load")
              |> filter(fn: (r) => r.router_host == "${routerIp}")
              |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
              |> yield(name: "mean")
        `;

        const data = [];
        await new Promise((resolve, reject) => {
            queryApi.queryRows(fluxQuery, {
                next(row, tableMeta) {
                    const o = tableMeta.toObject(row);
                    // Formata para o padrão que as bibliotecas de gráfico esperam (x, y)
                    data.push({ x: o._time, y: o._value });
                },
                error: reject,
                complete: resolve,
            });
        });

        res.json(data);
    } catch (error) {
        console.error(`Erro na rota /api/monitoring/router/${req.params.id}/cpu-history:`, error);
        res.status(500).send('Erro ao buscar histórico de CPU.');
    }
});

/**
 * @route   GET /api/monitoring/router/:id/metrics
 * @desc    Busca múltiplas métricas para um roteador específico (CPU, Memória, Tráfego, etc).
 * @access  Private
 * @query   range - O período de tempo (ex: '1h', '6h', '24h', '7d'). Padrão: '24h'.
 */
router.get('/router/:id/metrics', [verifyToken, checkPermission('routers.dashboard.read')], async (req, res) => {
    try {
        const { id } = req.params;
        const range = req.query.range || '24h';

        // 1. Buscar o IP do roteador no PostgreSQL
        const routerQuery = await pool.query(
            "SELECT ip_address, name FROM routers WHERE id = $1",
            [id]
        );

        if (routerQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Roteador não encontrado.' });
        }

        const routerIp = routerQuery.rows[0].ip_address;
        const routerName = routerQuery.rows[0].name;

        // 2. Buscar dados de CPU
        const cpuQuery = `
            from(bucket: "${influxBucket}")
              |> range(start: -${range})
              |> filter(fn: (r) => r._measurement == "system_resource")
              |> filter(fn: (r) => r._field == "cpu_load")
              |> filter(fn: (r) => r.router_host == "${routerIp}")
              |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
        `;

        // 3. Buscar dados de Memória
        const memoryQuery = `
            from(bucket: "${influxBucket}")
              |> range(start: -${range})
              |> filter(fn: (r) => r._measurement == "system_resource")
              |> filter(fn: (r) => r._field == "free_memory" or r._field == "total_memory") // CORREÇÃO: Busca campos de memória
              |> filter(fn: (r) => r.router_host == "${routerIp}")
              |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
              |> map(fn: (r) => ({ r with _value: (r.total_memory - r.free_memory) * 100.0 / r.total_memory })) // Calcula o uso em %
              |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
        `;

        // 4. Buscar dados de Tráfego de Rede
        const trafficQuery = `
            from(bucket: "${influxBucket}")
              |> range(start: -${range}) 
              |> filter(fn: (r) => r._measurement == "interface_stats")
              |> filter(fn: (r) => r._field == "rx_bits_per_second" or r._field == "tx_bits_per_second") // CORREÇÃO: Usa underscore (_) em vez de hífen (-)
              |> filter(fn: (r) => r.router_host == "${routerIp}")
              |> group(columns: ["_time", "_start", "_stop"]) // Agrupa para somar RX e TX
              |> sum() // Soma RX e TX para ter o tráfego total
              |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
        `;

        const cpuData = [];
        const memoryData = [];
        const trafficData = [];

        // Executar queries em paralelo
        await Promise.all([
            new Promise((resolve, reject) => {
                queryApi.queryRows(cpuQuery, {
                    next(row, tableMeta) {
                        const o = tableMeta.toObject(row);
                        cpuData.push({ x: o._time, y: o._value });
                    },
                    error: reject,
                    complete: resolve,
                });
            }),
            new Promise((resolve, reject) => {
                queryApi.queryRows(memoryQuery, {
                    next(row, tableMeta) {
                        const o = tableMeta.toObject(row);
                        memoryData.push({ x: o._time, y: o._value });
                    },
                    error: reject,
                    complete: resolve,
                });
            }),
            new Promise((resolve, reject) => {
                queryApi.queryRows(trafficQuery, {
                    next(row, tableMeta) {
                        const o = tableMeta.toObject(row);
                        trafficData.push({ x: o._time, y: o._value });
                    },
                    error: reject,
                    complete: resolve,
                });
            })
        ]);

        // console.log(`[MONITORING] /metrics (${routerIp}): CPU=${cpuData.length}, Mem=${memoryData.length}, Traf=${trafficData.length} pontos.`);

        // Calcular estatísticas
        const calculateStats = (data) => {
            if (data.length === 0) return { min: 0, max: 0, avg: 0, current: 0 };
            const values = data.map(d => d.y);
            return {
                min: Math.min(...values),
                max: Math.max(...values),
                avg: values.reduce((a, b) => a + b, 0) / values.length,
                current: values[values.length - 1]
            };
        };

        res.json({
            success: true,
            data: {
                routerId: id,
                routerName: routerName,
                routerIp: routerIp,
                cpu: {
                    data: cpuData,
                    stats: calculateStats(cpuData)
                },
                memory: {
                    data: memoryData,
                    stats: calculateStats(memoryData)
                },
                traffic: {
                    data: trafficData,
                    stats: calculateStats(trafficData)
                }
            }
        });
    } catch (error) {
        console.error(`Erro na rota /api/monitoring/router/${req.params.id}/metrics:`, error);
        res.status(500).json({ success: false, message: 'Erro ao buscar métricas.' });
    }
});

/**
 * @route   GET /api/monitoring/router/:id/clients
 * @desc    Busca informações sobre clientes conectados (Wi-Fi, DHCP, Hotspot).
 * @access  Private
 */
router.get('/router/:id/clients', [verifyToken, checkPermission('routers.dashboard.clients')], async (req, res) => { // [MODIFICADO]
    try {
        const reqId = Math.random().toString(36).substring(7);
        // console.time(`[REQ-${reqId}] GET /clients/${req.params.id}`);
        // console.log(`[${new Date().toISOString()}] [REQ-${reqId}] Iniciando busca de clientes...`);
        const { id } = req.params;
        const { range } = req.query; // [NOVO] Aceita um parâmetro de range
        const queryRange = range || '1h'; // [NOVO] Usa o range fornecido ou '1h' como padrão

        // 1. Buscar o IP do roteador no PostgreSQL
        const routerQuery = await pool.query(
            "SELECT ip_address, name FROM routers WHERE id = $1",
            [id]
        );

        if (routerQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Roteador não encontrado.' });
        }

        const routerIp = routerQuery.rows[0].ip_address;
        const routerName = routerQuery.rows[0].name;

        // [FIX] Verifica se o IP do roteador existe antes de consultar o InfluxDB
        if (!routerIp) {
            return res.json({
                success: true,
                data: {
                    routerId: id,
                    routerName: routerName,
                    routerIp: null,
                    clients: {
                        dhcp: { count: 0, details: [] },
                        wifi: { count: 0, details: [] },
                        hotspot: { count: 0, details: [] },
                        total: 0
                    }
                }
            });
        }

        // 2. Buscar clientes DHCP
        const dhcpQuery = `
            from(bucket: "${influxBucket}")
              |> range(start: -${queryRange}) // [CORRIGIDO] Removidas as aspas para ser um literal de duração válido
              |> filter(fn: (r) => r._measurement == "ip_dhcp_server_lease")
              |> filter(fn: (r) => r.router_host == "${routerIp}")
              |> filter(fn: (r) => r._field == "address" or r._field == "mac_address" or r._field == "status" or r._field == "host_name" or r._field == "server" or r._field == "active_address")
              |> last() // [OTIMIZAÇÃO] last() antes de map() reduz drasticamente o processamento
              |> map(fn: (r) => ({ r with _value: string(v: r._value) }))
              |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        `;

        const dhcpClients = [];
        await new Promise((resolve, reject) => {
            queryApi.queryRows(dhcpQuery, {
                next(row, tableMeta) {
                    const o = tableMeta.toObject(row);
                    dhcpClients.push(o);
                },
                error: reject,
                complete: resolve,
            });
        });

        // 3. Buscar clientes Hotspot
        const hotspotQuery = `
            from(bucket: "${influxBucket}")
              |> range(start: -${queryRange}) // [CORRIGIDO] Removidas as aspas
              |> filter(fn: (r) => r._measurement == "hotspot_active")
              |> filter(fn: (r) => r.router_host == "${routerIp}")
              |> rename(columns: {user: "hotspot_user_tag"}) // [FIX] Renomeia a tag 'user' para evitar conflito no pivot
              |> filter(fn: (r) => r._field == "user" or r._field == "mac_address" or r._field == "address" or r._field == "uptime")
              |> last() // [OTIMIZAÇÃO] last() antes de map()
              |> map(fn: (r) => ({ r with _value: string(v: r._value) }))
              |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        `;

        const hotspotClients = [];
        await new Promise((resolve, reject) => {
            queryApi.queryRows(hotspotQuery, {
                next(row, tableMeta) {
                    const o = tableMeta.toObject(row);
                    hotspotClients.push(o);
                },
                error: reject,
                complete: resolve,
            });
        });

        // 3. Buscar clientes Wi-Fi (wireless registration table)
        const wifiQuery = `
            from(bucket: "${influxBucket}")
              |> range(start: -${queryRange}) // [CORRIGIDO] Removidas as aspas
              |> filter(fn: (r) => r._measurement == "interface_wireless_registration_table")
              |> filter(fn: (r) => r.router_host == "${routerIp}")
              |> filter(fn: (r) => r._field == "mac_address" or r._field == "interface" or r._field == "uptime" or r._field == "last_ip")
              |> last() // [OTIMIZAÇÃO] last() antes de map()
              |> map(fn: (r) => ({ r with _value: string(v: r._value) }))
              |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        `;

        const wifiClients = [];
        await new Promise((resolve, reject) => {
            queryApi.queryRows(wifiQuery, {
                next(row, tableMeta) {
                    const o = tableMeta.toObject(row);
                    wifiClients.push(o);
                },
                error: reject,
                complete: resolve,
            });
        });

        // 4. Contar clientes por tipo
        const dhcpCount = dhcpClients.length;
        const wifiCount = wifiClients.length;
        const hotspotCount = hotspotClients.length;

        // console.log(`[${new Date().toISOString()}] [REQ-${reqId}] Clientes retornados para ${routerIp}:`, {
        //     dhcp: dhcpCount,
        //     wifi: wifiCount,
        //     hotspot: hotspotCount
        // });

        res.json({
            success: true,
            data: {
                routerId: id,
                routerName: routerName,
                routerIp: routerIp,
                clients: {
                    dhcp: {
                        count: dhcpCount,
                        details: dhcpClients
                    },
                    wifi: {
                        count: wifiCount,
                        details: wifiClients
                    },
                    hotspot: {
                        count: hotspotCount,
                        details: hotspotClients
                    },
                    total: dhcpCount + wifiCount + hotspotCount
                }
            }
        });
        // console.timeEnd(`[REQ-${reqId}] GET /clients/${req.params.id}`);

    } catch (error) {
        console.error(`Erro na rota /api/monitoring/router/${req.params.id}/clients:`, error);
        res.status(500).json({ success: false, message: 'Erro ao buscar clientes.' });
    }
});

/**
 * @route   GET /api/monitoring/router/:id/detailed-metrics
 * @desc    Busca métricas detalhadas por interface (Gateway, Wi-Fi, LANs, etc).
 * @access  Private
 * @query   range - O período de tempo. Padrão: '24h'.
 */
router.get('/router/:id/detailed-metrics', [verifyToken, checkPermission('routers.dashboard.read')], async (req, res) => {
    try {
        const reqId = Math.random().toString(36).substring(7);
        // console.time(`[REQ-${reqId}] GET /detailed-metrics/${req.params.id}`);
        // console.log(`[${new Date().toISOString()}] [REQ-${reqId}] Iniciando métricas detalhadas...`);
        const { id } = req.params;
        const range = req.query.range || '24h';

        // 1. Buscar o IP do roteador no PostgreSQL
        const routerQuery = await pool.query(
            "SELECT ip_address, name FROM routers WHERE id = $1",
            [id]
        );

        if (routerQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Roteador não encontrado.' });
        }

        const routerIp = routerQuery.rows[0].ip_address;
        const routerName = routerQuery.rows[0].name;

        // Função auxiliar para buscar dados de uma métrica
        const fetchMetricData = (measurement, field, filterTag = null, filterValue = null) => {
            return new Promise((resolve, reject) => {
                let query = `
                    from(bucket: "${influxBucket}")
                      |> range(start: -${range})
                      |> filter(fn: (r) => r._measurement == "${measurement}")
                      |> filter(fn: (r) => r._field == "${field}")
                      |> filter(fn: (r) => r.router_host == "${routerIp}")
                `;

                if (filterTag && filterValue) {
                    // [CORREÇÃO] Escapa caracteres especiais (barras invertidas e aspas duplas) no valor do filtro
                    // para prevenir erros de sintaxe na query Flux.
                    const escapedFilterValue = String(filterValue).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    query += `|> filter(fn: (r) => r.${filterTag} == "${escapedFilterValue}")`;
                }
                query += `|> aggregateWindow(every: 5m, fn: mean, createEmpty: false)`;

                const data = [];
                queryApi.queryRows(query, {
                    next(row, tableMeta) {
                        const o = tableMeta.toObject(row);
                        data.push({ x: o._time, y: o._value });
                    },
                    error: reject,
                    complete: () => resolve(data),
                });
            });
        };

        // Função auxiliar para buscar dados de memória com cálculo de percentual
        const fetchMemoryData = () => {
            return new Promise((resolve, reject) => {
                const query = `
                    from(bucket: "${influxBucket}")
                        |> range(start: -${range})
                        |> filter(fn: (r) => r._measurement == "system_resource")
                        |> filter(fn: (r) => r._field == "free_memory" or r._field == "total_memory")
                        |> filter(fn: (r) => r.router_host == "${routerIp}")
                        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
                        |> map(fn: (r) => ({ r with _value: if exists r.total_memory and exists r.free_memory and r.total_memory > 0 then (float(v: r.total_memory) - float(v: r.free_memory)) / float(v: r.total_memory) * 100.0 else 0.0 }))
                        |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
                `;
                const data = [];
                queryApi.queryRows(query, {
                    next(row, tableMeta) {
                        const o = tableMeta.toObject(row);
                        data.push({ x: o._time, y: o._value });
                    },
                    error: reject,
                    complete: () => resolve(data),
                });
            });
        };

        // Função para calcular estatísticas
        const calculateStats = (data) => {
            if (data.length === 0) return { min: 0, max: 0, avg: 0, current: 0 };
            const values = data.map(d => d.y);
            return {
                min: Math.min(...values),
                max: Math.max(...values),
                avg: values.reduce((a, b) => a + b, 0) / values.length,
                current: values[values.length - 1]
            };
        };

        // Buscar todas as interfaces disponíveis
        // [CORREÇÃO] Usar schema.tagValues para obter nomes de interface de forma mais robusta
        const interfacesQuery = `
            import "influxdata/influxdb/schema"

            schema.tagValues(
              bucket: "${influxBucket}",
              tag: "interface_name",
              predicate: (r) => r._measurement == "interface_stats" and r.router_host == "${routerIp}",
              start: -${range}
            )
        `;

        const interfaces = [];
        await new Promise((resolve, reject) => {
            queryApi.queryRows(interfacesQuery, {
                next(row, tableMeta) { // Esta função pode não ser chamada se não houver resultados
                    const o = tableMeta.toObject(row);
                    if (o._value) { // schema.tagValues retorna o valor na coluna _value
                        interfaces.push(o._value);
                    }
                },
                error: reject,
                complete: resolve,
            });
        });

        // console.log(`[MONITORING] Interfaces encontradas para ${routerIp}: ${interfaces.join(', ')}`);

        // Buscar dados para cada interface
        const interfaceMetrics = {};
        for (const iface of interfaces) {
            const rxData = await fetchMetricData('interface_stats', 'rx_bits_per_second', 'interface_name', iface);
            const txData = await fetchMetricData('interface_stats', 'tx_bits_per_second', 'interface_name', iface);

            interfaceMetrics[iface] = {
                rx: { data: rxData, stats: calculateStats(rxData) },
                tx: { data: txData, stats: calculateStats(txData) }
            };
        }

        // Buscar métricas do sistema
        const cpuData = await fetchMetricData('system_resource', 'cpu_load');
        const memoryData = await fetchMemoryData(); // CORREÇÃO: Usa a nova função para calcular a porcentagem
        const uptimeData = await fetchMetricData('system_resource', 'uptime_seconds');

        // [NOVO] Buscar versão do roteador
        let routerVersion = null;
        try {
            const versionQuery = `
                from(bucket: "${influxBucket}")
                  |> range(start: -30d)
                  |> filter(fn: (r) => r._measurement == "system_resource")
                  |> filter(fn: (r) => r._field == "version")
                  |> filter(fn: (r) => r.router_host == "${routerIp}")
                  |> last()
            `;
            const versionRows = await queryApi.collectRows(versionQuery);
            if (versionRows.length > 0) {
                routerVersion = versionRows[0]._value;
            }
        } catch (err) {
            console.error(`Erro ao buscar versão para ${routerIp}:`, err);
        }

        // [NOVO] Buscar uptime atual exato em segundos
        let currentUptime = 0;
        try {
            const uptimeQuery = `
                from(bucket: "${influxBucket}")
                  |> range(start: -1h) // Busca na última hora para garantir que pega o último dado
                  |> filter(fn: (r) => r._measurement == "system_resource")
                  |> filter(fn: (r) => r._field == "uptime_seconds")
                  |> filter(fn: (r) => r.router_host == "${routerIp}")
                  |> last()
            `;
            const uptimeRows = await queryApi.collectRows(uptimeQuery);
            if (uptimeRows.length > 0) {
                currentUptime = uptimeRows[0]._value;
            }
        } catch (err) {
            console.error(`Erro ao buscar uptime atual para ${routerIp}:`, err);
        }

        // console.log(`[${new Date().toISOString()}] [REQ-${reqId}] Dados detalhados retornados para ${id}:`, {
        //     routerName,
        //     routerIp,
        //     routerVersion,
        //     systemMetrics: { cpu: cpuData.length, memory: memoryData.length, uptime: uptimeData.length },
        //     interfaces: Object.keys(interfaceMetrics)
        // });

        res.json({
            success: true,
            data: {
                routerId: id,
                routerName: routerName,
                routerIp: routerIp,
                routerVersion: routerVersion, // [NOVO] Envia a versão para o frontend
                currentUptime: currentUptime, // [NOVO] Envia o uptime atual em segundos
                system: {
                    cpu: { data: cpuData, stats: calculateStats(cpuData) },
                    memory: { data: memoryData, stats: calculateStats(memoryData) },
                    uptime: { data: uptimeData, stats: calculateStats(uptimeData) }
                },
                interfaces: interfaceMetrics
            }
        });
        // console.timeEnd(`[REQ-${reqId}] GET /detailed-metrics/${req.params.id}`);
    } catch (error) {
        console.error(`Erro na rota /api/monitoring/router/${req.params.id}/detailed-metrics:`, error);
        res.status(500).json({ success: false, message: 'Erro ao buscar métricas detalhadas.' });
    }
});

/**
 * @route   GET /api/monitoring/router/:id/availability
 * @desc    Calcula métricas de disponibilidade (uptime %, quedas, status atual).
 * @access  Private
 */
router.get('/router/:id/availability', [verifyToken, checkPermission('routers.dashboard.read')], async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Buscar o IP do roteador no PostgreSQL
        const routerQuery = await pool.query("SELECT ip_address FROM routers WHERE id = $1", [id]);
        if (routerQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Roteador não encontrado.' });
        }
        const routerIp = routerQuery.rows[0].ip_address;

        // Lógica para determinar o status atual (Online/Offline)
        const statusQuery = `
            from(bucket: "${influxBucket}")
              |> range(start: -5m) // Verifica se há dados nos últimos 5 minutos
              |> filter(fn: (r) => r._measurement == "system_resource" and r.router_host == "${routerIp}")
              |> first()
        `;

        // Função para calcular a porcentagem de uptime para um dado período
        const calculateUptimePercent = (range) => {
            return new Promise((resolve, reject) => {
                // A cada 5 minutos, verifica se houve pelo menos 1 ponto de dado.
                // Se sim, a janela é "online" (1), senão é "offline" (0).
                // CORREÇÃO DEFINITIVA: A query agora apenas CONTA as janelas online. O cálculo da % será feito em JS.
                const query = `
                    from(bucket: "${influxBucket}")
                      |> range(start: -${range}h)
                      |> filter(fn: (r) => r._measurement == "system_resource" and r.router_host == "${routerIp}")
                      |> aggregateWindow(every: 5m, fn: count)
                      |> filter(fn: (r) => r._value > 0)
                      |> count()
                `;

                queryApi.queryRows(query, {
                    next: (row, tableMeta) => resolve(tableMeta.toObject(row)._value || 0),
                    error: reject,
                    complete: () => resolve(0), // Retorna 0 se não houver dados
                });
            });
        };

        // Função para contar as quedas (períodos offline) em 24h
        const countOfflineEvents = () => {
            return new Promise((resolve, reject) => {
                // Cria janelas de 5 minutos e preenche as vazias com 'null'.
                // Conta quantas vezes um estado 'online' é seguido por um 'offline'.
                const query = `
                    data = from(bucket: "${influxBucket}")
                      |> range(start: -24h)
                      |> filter(fn: (r) => r._measurement == "system_resource" and r.router_host == "${routerIp}")
                      |> aggregateWindow(every: 5m, fn: count, createEmpty: true)
                      |> map(fn: (r) => ({ r with is_online: if exists r._value and r._value > 0 then 1 else 0 }))
                      
                    data
                      |> difference(columns: ["is_online"])
                      |> filter(fn: (r) => r.is_online == -1) // Transição de online (1) para offline (0)
                      |> count()
                      |> yield(name: "offline_events")
                `;
                queryApi.queryRows(query, {
                    next: (row, tableMeta) => resolve(tableMeta.toObject(row)._value || 0),
                    error: reject,
                    complete: () => resolve(0),
                });
            });
        };

        // Executa todas as consultas em paralelo
        const [statusResult, uptime7d, uptime30d, offlineEvents24h] = await Promise.all([
            new Promise(resolve => queryApi.queryRows(statusQuery, { next: () => resolve('Online'), error: (err) => { console.error("Erro na query de status:", err); resolve('Offline'); }, complete: () => resolve('Offline') })),
            calculateUptimePercent(7 * 24),   // 7 dias em horas
            calculateUptimePercent(30 * 24),  // 30 dias em horas
            countOfflineEvents()
        ]);

        // CORREÇÃO: Cálculo da porcentagem movido para o JavaScript
        const totalWindows7d = 7 * 24 * 12;
        const totalWindows30d = 30 * 24 * 12;
        const percent7d = totalWindows7d > 0 ? (uptime7d / totalWindows7d) * 100 : 0;
        const percent30d = totalWindows30d > 0 ? (uptime30d / totalWindows30d) * 100 : 0;

        res.json({
            success: true,
            data: {
                status: statusResult,
                last24h: {
                    offline_events: offlineEvents24h
                },
                last7d: {
                    uptime_percent: percent7d.toFixed(2)
                },
                last30d: {
                    uptime_percent: percent30d.toFixed(2)
                }
            }
        });

    } catch (error) {
        console.error(`Erro na rota /api/monitoring/router/${req.params.id}/availability:`, error);
        res.status(500).json({ success: false, message: 'Erro ao buscar dados de disponibilidade.' });
    }
});

/**
 * @route   GET /api/monitoring/router/:id/wifi-analytics
 * @desc    Busca análises detalhadas sobre clientes Wi-Fi (atuais, 1h, 7d, 30d).
 * @access  Private
 */
router.get('/router/:id/wifi-analytics', [verifyToken, checkPermission('routers.dashboard.clients')], async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Buscar o IP do roteador no PostgreSQL
        const routerQuery = await pool.query("SELECT ip_address FROM routers WHERE id = $1", [id]);
        if (routerQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Roteador não encontrado.' });
        }
        const routerIp = routerQuery.rows[0].ip_address;

        // Função para contar clientes únicos em um período
        const countUniqueClients = (range) => {
            return new Promise((resolve, reject) => {
                const query = `
                    from(bucket: "${influxBucket}")
                      |> range(start: -${range})
                      |> filter(fn: (r) => r._measurement == "interface_wireless_registration_table")
                      |> filter(fn: (r) => r.router_host == "${routerIp}")
                      |> filter(fn: (r) => r._field == "mac_address")
                      |> distinct(column: "_value")
                      |> count()
                `;
                queryApi.queryRows(query, {
                    next: (row, tableMeta) => resolve(tableMeta.toObject(row)._value || 0),
                    error: reject,
                    complete: () => resolve(0),
                });
            });
        };

        // Contagem de clientes atualmente conectados (nos últimos 5 minutos)
        const currentClientsPromise = countUniqueClients('5m');
        // Contagem de clientes únicos na última hora
        const last1hPromise = countUniqueClients('1h');
        // Contagem de clientes únicos nos últimos 7 dias
        const last7dPromise = countUniqueClients('7d');
        // Contagem de clientes únicos nos últimos 30 dias
        const last30dPromise = countUniqueClients('30d');

        // Executa todas as consultas em paralelo
        const [
            currentCount,
            count1h,
            count7d,
            count30d
        ] = await Promise.all([
            currentClientsPromise,
            last1hPromise,
            last7dPromise,
            last30dPromise
        ]);

        res.json({
            success: true,
            data: {
                current: currentCount,
                last_1h: count1h,
                last_7d: count7d,
                last_30d: count30d
            }
        });

    } catch (error) {
        console.error(`Erro na rota /api/monitoring/router/${req.params.id}/wifi-analytics:`, error);
        res.status(500).json({ success: false, message: 'Erro ao buscar análise de clientes Wi-Fi.' });
    }
});

/**
 * @route   GET /api/monitoring/router/:id/dhcp-analytics
 * @desc    Busca análises detalhadas sobre clientes DHCP.
 * @access  Private
 */
router.get('/router/:id/dhcp-analytics', [verifyToken, checkPermission('routers.dashboard.clients')], async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Buscar o IP do roteador no PostgreSQL
        const routerQuery = await pool.query("SELECT ip_address FROM routers WHERE id = $1", [id]);
        if (routerQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Roteador não encontrado.' });
        }
        const routerIp = routerQuery.rows[0].ip_address;

        // [REFEITO] Query para buscar todos os leases ativos (bound) para processamento no lado do servidor.
        // Isso evita erros de contagem causados por `last()` ou `distinct()` em dados esparsos.
        const dhcpAnalyticsQuery = `
            from(bucket: "${influxBucket}")
              |> range(start: -10m) // Busca recente para dados de estado
              |> filter(fn: (r) => r._measurement == "ip_dhcp_server_lease")
              |> filter(fn: (r) => r.router_host == "${routerIp}")
              |> filter(fn: (r) => r._field == "status" or r._field == "mac_address" or r._field == "server")
              |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
              |> filter(fn: (r) => r.status == "bound") // Apenas clientes conectados
        `;

        const results = await queryApi.collectRows(dhcpAnalyticsQuery);

        // Processa os resultados para o formato do gráfico, garantindo contagem única
        const uniqueLeases = new Map();
        results.forEach(item => {
            if (item.mac_address) {
                uniqueLeases.set(item.mac_address, item.server || 'Desconhecido');
            }
        });

        const totalCount = uniqueLeases.size;

        const distribution = {};
        for (const server of uniqueLeases.values()) {
            distribution[server] = (distribution[server] || 0) + 1;
        }

        const chartData = {
            labels: Object.keys(distribution),
            series: Object.values(distribution)
        };

        res.json({
            success: true,
            data: {
                current: totalCount,
                distribution: chartData
            }
        });

    } catch (error) {
        console.error(`Erro na rota /api/monitoring/router/${req.params.id}/dhcp-analytics:`, error);
        res.status(500).json({ success: false, message: 'Erro ao buscar análise de clientes DHCP.' });
    }
});


/**
 * @route   GET /api/monitoring/router/:id/hotspot-analytics
 * @desc    Busca análises detalhadas sobre clientes Hotspot.
 * @access  Private
 */
router.get('/router/:id/hotspot-analytics', [verifyToken, checkPermission('routers.dashboard.clients')], async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Buscar o IP do roteador no PostgreSQL
        const routerQuery = await pool.query("SELECT ip_address FROM routers WHERE id = $1", [id]);
        if (routerQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Roteador não encontrado.' });
        }
        const routerIp = routerQuery.rows[0].ip_address;

        // Função reutilizável para contar clientes únicos do hotspot em um período
        const countUniqueHotspotClients = (range) => {
            return new Promise((resolve, reject) => {
                const query = `
                    from(bucket: "${influxBucket}")
                      |> range(start: -${range})
                      |> filter(fn: (r) => r._measurement == "hotspot_active")
                      |> filter(fn: (r) => r.router_host == "${routerIp}")
                      |> filter(fn: (r) => r._field == "mac_address")
                      |> keep(columns: ["_value"]) // Otimiza, busca apenas a coluna de valor
                `;
                // [CORREÇÃO] A contagem de valores distintos é feita no lado do servidor (JS)
                // para garantir que todos os pontos de dados sejam processados,
                // contornando qualquer comportamento inesperado do 'distinct' do Flux.
                const uniqueMacs = new Set();
                queryApi.queryRows(query, {
                    next: (row, tableMeta) => {
                        const o = tableMeta.toObject(row);
                        if (o._value) {
                            uniqueMacs.add(o._value);
                        }
                    },
                    error: reject,
                    complete: () => {
                        resolve(uniqueMacs.size);
                    },
                });
            });
        };

        // Executa todas as consultas em paralelo para máxima eficiência
        const [
            currentCount,
            count1h,
            count24h,
            count7d,
            count15d,
            count30d
        ] = await Promise.all([
            countUniqueHotspotClients('5m'),   // "Agora" são os clientes nos últimos 5 minutos
            countUniqueHotspotClients('1h'),
            countUniqueHotspotClients('24h'),
            countUniqueHotspotClients('7d'),
            countUniqueHotspotClients('15d'),
            countUniqueHotspotClients('30d')
        ]);

        res.json({
            success: true,
            data: {
                current: currentCount,
                last_1h: count1h,
                last_24h: count24h,
                last_7d: count7d,
                last_15d: count15d,
                last_30d: count30d
            }
        });

    } catch (error) {
        console.error(`Erro na rota /api/monitoring/router/${req.params.id}/hotspot-analytics:`, error);
        res.status(500).json({ success: false, message: 'Erro ao buscar análise de clientes Hotspot.' });
    }
});

/**
 * Calcula a diferença de tempo entre agora e uma data fornecida, retornando uma string formatada.
 * @param {Date | string} lastSeenDate A data da última vez que foi visto.
 * @returns {{formatted: string, hours: number}} Objeto com o tempo formatado e o total de horas.
 */
const calculateDowntime = (lastSeenDate) => {
    if (!lastSeenDate) {
        return { formatted: 'Sem Dados', hours: 0 }; // [MODIFICADO] Exibe 'Sem Dados' se nunca foi visto
    }

    const now = new Date();
    const lastSeen = new Date(lastSeenDate);
    const diffSeconds = Math.floor((now - lastSeen) / 1000);

    if (diffSeconds < 60) {
        return { formatted: '<1m', hours: 0 };
    }

    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    let formatted;
    if (diffDays > 0) {
        formatted = `${diffDays}d ${diffHours % 24}h`;
    } else if (diffHours > 0) {
        formatted = `${diffHours}h ${diffMinutes % 60}m`;
    } else {
        formatted = `${diffMinutes}m`;
    }
    return { formatted, hours: diffHours };
};

/**
 * @route   GET /api/monitoring/all-routers-status
 * @desc    [NOVO] Busca um resumo do estado atual de todos os roteadores para o dashboard NOC.
 * @access  Private
 */
router.get('/all-routers-status', [verifyToken, checkPermission('routers.monitoring.read')], async (req, res) => {
    try {
        // 1. Buscar todos os roteadores com seus grupos e configurações
        // [MODIFICADO] Adiciona as colunas de credenciais da API para o modal de edição.
        const routerQuery = await pool.query(`SELECT id, name, ip_address, status, last_seen, last_seen_manual, group_id, observacao, monitoring_interface, username, api_port, is_maintenance FROM routers`);
        const allRouters = routerQuery.rows;

        // [NOVO] Busca todos os grupos para criar um mapa de ID -> Nome, otimizando a busca do nome do grupo.
        const groupsQuery = await pool.query('SELECT id, name FROM router_groups');
        const groupMap = new Map(groupsQuery.rows.map(g => [g.id, g.name]));

        if (!allRouters || allRouters.length === 0) {
            return res.json([]);
        }


        // Pega a lista de IPs dos roteadores que estão ONLINE para otimizar as queries no InfluxDB
        const onlineRouterIPs = allRouters
            .filter(r => r.status === 'online' && r.ip_address)
            .map(r => r.ip_address.trim());

        // [NOVO] Pega a lista de IPs dos roteadores OFFLINE para buscar a última vez que foram vistos no InfluxDB
        const offlineRouterIPs = allRouters
            .filter(r => r.status === 'offline' && r.ip_address)
            .map(r => r.ip_address.trim());

        let clientCountMap = new Map(); // [CORRIGIDO] Alterado para 'let' para permitir reatribuição
        const influxInterfacesMap = new Map();
        const interfaceStatusMap = new Map();
        const lastSeenPgMap = new Map(); // [NOVO] Para guardar o último timestamp do PostgreSQL para roteadores offline
        const uptimeMap = new Map(); // [NOVO] Para guardar o uptime dos roteadores online

        // 2. Se houver roteadores online, busca dados do InfluxDB (clientes e interfaces) SÓ PARA ELES.
        if (onlineRouterIPs.length > 0) {
            // [OTIMIZAÇÃO] Usa a função 'contains' do Flux, que é mais eficiente do que um longo encadeamento de 'or'.
            // Transforma o array de IPs em uma string de array Flux: `["ip1", "ip2", ...]`
            const ipFilterArray = JSON.stringify(onlineRouterIPs);

            // [NOVO] Query para status da interface (quedas e última queda)
            const interfaceStatusQuery = `
                from(bucket: "${influxBucket}")
                    |> range(start: -1h) // [OTIMIZAÇÃO] Reduz o range para 1 hora. Como a query usa 'last()', um range menor é suficiente e muito mais rápido.
                    |> filter(fn: (r) => r._measurement == "interface_stats")
                    |> filter(fn: (r) => contains(value: r.router_host, set: ${ipFilterArray}))
                    |> filter(fn: (r) => r._field == "link_downs" or r._field == "last_link_down_time")
                    |> last() // Pega o valor mais recente para cada interface
                    |> pivot(rowKey:["router_host", "interface_name"], columnKey: ["_field"], valueColumn: "_value")
            `;

            // [NOVO] Query para buscar o uptime atual dos roteadores online
            const uptimeQuery = `
                from(bucket: "${influxBucket}")
                    |> range(start: -1h)
                    |> filter(fn: (r) => r._measurement == "system_resource" and r._field == "uptime_seconds")
                    |> filter(fn: (r) => contains(value: r.router_host, set: ${ipFilterArray}))
                    |> last()
                    |> keep(columns: ["router_host", "_value"])
            `;

            // Query para interfaces
            const interfacesQuery = `
                from(bucket: "${influxBucket}")
                  |> range(start: -30m)
                  |> filter(fn: (r) => r._measurement == "interface_stats")
                  |> filter(fn: (r) => contains(value: r.router_host, set: ${ipFilterArray}))
                  |> keep(columns: ["router_host", "interface_name"])
                  |> distinct()
            `;

            // Query para clientes
            const clientsQuery = `
                hotspot_clients = from(bucket: "${influxBucket}")
                    |> range(start: -10m)
                    |> filter(fn: (r) => r._measurement == "hotspot_active" and r._field == "mac_address")
                    |> filter(fn: (r) => contains(value: r.router_host, set: ${ipFilterArray}))
                    |> group(columns: ["router_host"])
                    |> distinct() |> count() |> set(key: "client_type", value: "hotspot")
    
                wifi_clients = from(bucket: "${influxBucket}")
                    |> range(start: -10m)
                    |> filter(fn: (r) => r._measurement == "interface_wireless_registration_table" and r._field == "mac_address")
                    |> filter(fn: (r) => contains(value: r.router_host, set: ${ipFilterArray}))
                    |> group(columns: ["router_host"])
                    |> distinct() |> count() |> set(key: "client_type", value: "wifi")
    
                union(tables: [hotspot_clients, wifi_clients])
                    |> pivot(rowKey:["router_host"], columnKey: ["client_type"], valueColumn: "_value")
                    |> map(fn: (r) => ({
                        r with
                        connected_clients: if exists r.hotspot then r.hotspot else if exists r.wifi then r.wifi else 0
                    }))
            `;


            // [CORREÇÃO] Envolve a chamada ao InfluxDB em um try-catch para não quebrar a rota inteira em caso de timeout.
            try {
                // Executar queries em paralelo
                const [interfaceResults, clientCountResults, interfaceStatusResults, uptimeResults] = await Promise.all([
                    queryApi.collectRows(interfacesQuery),
                    queryApi.collectRows(clientsQuery),
                    queryApi.collectRows(interfaceStatusQuery),
                    queryApi.collectRows(uptimeQuery) // [NOVO]
                ]);

                // Processar resultados
                clientCountMap = new Map(clientCountResults.map(r => [r.router_host, r.connected_clients]));
                interfaceResults.forEach(result => {
                    if (result.interface_name) {
                        if (!influxInterfacesMap.has(result.router_host)) {
                            influxInterfacesMap.set(result.router_host, []);
                        }
                        influxInterfacesMap.get(result.router_host).push({ name: result.interface_name });
                    }
                });

                // [NOVO] Processar resultados de status da interface
                interfaceStatusResults.forEach(result => {
                    const key = `${result.router_host}|${result.interface_name}`;
                    interfaceStatusMap.set(key, {
                        link_downs: result.link_downs,
                        last_link_down_time: result.last_link_down_time
                    });
                });

                // [NOVO] Processar resultados de uptime
                uptimeResults.forEach(result => {
                    uptimeMap.set(result.router_host, result._value);
                });
            } catch (influxError) {
                console.warn(`[AVISO] Falha ao buscar dados do InfluxDB na rota all-routers-status. A resposta conterá apenas dados do PostgreSQL. Erro: ${influxError.message}`);
                // As maps 'clientCountMap' e 'influxInterfacesMap' continuarão vazias, o que é o comportamento esperado.
            }
        }

        // [NOVO] Se houver roteadores offline, busca a última coleta deles no PostgreSQL
        if (offlineRouterIPs.length > 0) {
            try {
                const lastSeenQuery = `
                    SELECT router_host, MAX(collected_at) as last_seen
                    FROM router_uptime_log
                    WHERE router_host = ANY($1)
                    GROUP BY router_host;
                `;
                const lastSeenResults = await pool.query(lastSeenQuery, [offlineRouterIPs]);
                lastSeenResults.rows.forEach(row => {
                    lastSeenPgMap.set(row.router_host, row.last_seen);
                });
            } catch (pgError) {
                console.warn(`[AVISO] Falha ao buscar último status do PostgreSQL para roteadores offline. Erro: ${pgError.message}`);
            }
        }

        // 3. Combinar todos os dados
        const responseData = allRouters.map(router => {
            const ip = router.ip_address ? router.ip_address.trim() : null;
            const clientCount = clientCountMap.get(ip) || 0;
            const interfaces = influxInterfacesMap.get(ip) || [];

            // [REFEITO] Lógica de cálculo de inatividade para ser mais robusta
            let downtime = '-';
            let downtime_alert = false;
            
            // [NOVO] Determina o last_seen mais recente entre a tabela routers e o log de uptime (Agente)
            const lastSeenLog = ip ? lastSeenPgMap.get(ip) : null;
            let effectiveLastSeen = router.last_seen;
            if (lastSeenLog && (!router.last_seen || new Date(lastSeenLog) > new Date(router.last_seen))) {
                effectiveLastSeen = lastSeenLog;
            }

            if (router.status === 'offline' || !router.status) {
                const downtimeResult = calculateDowntime(effectiveLastSeen);
                downtime = downtimeResult.formatted;
                downtime_alert = downtimeResult.hours >= 24;
            }
            
            // [CORRIGIDO] Busca o nome do grupo a partir do mapa, em vez de retornar null.
            const groupName = router.group_id ? groupMap.get(router.group_id) : null;

            // [NOVO] Lógica para obter dados da interface monitorada
            let interfaceStatus = null;
            if (router.status === 'online' && router.monitoring_interface) {
                const key = `${ip}|${router.monitoring_interface}`;
                interfaceStatus = interfaceStatusMap.get(key) || null;
            }

            // [NOVO] Obtém o uptime se estiver online
            let uptimeSeconds = null;
            if (router.status === 'online' && ip) {
                uptimeSeconds = uptimeMap.get(ip) || null;
            }

            return {
                id: router.id,
                name: router.name,
                ip: ip,
                last_seen: effectiveLastSeen, // [NOVO] Envia a data real para o frontend
                last_seen_manual: router.last_seen_manual, // [NOVO] Envia a data de verificação manual para exibição consistente
                status: router.status || 'offline', // Usa o status do PG
                downtime: downtime, // Agora sempre terá um valor ('-' ou o tempo calculado)
                group_name: groupName, // [CORRIGIDO] Retorna o nome do grupo correto.
                group_id: router.group_id, // [NOVO] Retorna o ID do grupo para consistência.
                latency: null, // Latency não é coletado por este endpoint para manter a velocidade
                connected_clients: clientCount,
                interface_traffic: {}, // Deixado para o frontend buscar sob demanda
                interfaces: interfaces,
                default_interface: null, // [CORRIGIDO] Coluna não existe, retorna null.
                bandwidth_limit: null,    // [CORRIGIDO] Coluna não existe, retorna null.
                downtime_alert: downtime_alert, // [NOVO] Flag para o frontend
                observacao: router.observacao, // [CORRIGIDO] Retorna o campo de observação.
                link_downs: interfaceStatus ? interfaceStatus.link_downs : null, // [NOVO]
                last_link_down_time: interfaceStatus ? interfaceStatus.last_link_down_time : null, // [NOVO]
                monitoring_interface: router.monitoring_interface, // Adiciona para o modal de edição
                username: router.username, // [NOVO] Adiciona para o modal de edição
                api_port: router.api_port,  // [NOVO] Adiciona para o modal de edição
                uptime_seconds: uptimeSeconds, // [NOVO] Envia o uptime para o frontend
                is_maintenance: router.is_maintenance // [NOVO] Envia o status de manutenção para exibir corretamente na tabela
            };
        });

        res.json(responseData);

    } catch (error) {
        console.error('Erro na rota /api/monitoring/all-routers-status:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar status de todos os roteadores.' });
    }
});

/**
 * @route   GET /api/monitoring/router/:id/interface-traffic
 * @desc    [NOVO] Busca o histórico de tráfego (RX/TX) para uma interface específica.
 * @access  Private
 * @query   interface - O nome da interface (obrigatório).
 * @query   range - O período de tempo (ex: '15m', '1h'). Padrão: '15m'.
 */
router.get('/router/:id/interface-traffic', [verifyToken, checkPermission('routers.dashboard.interfaces')], async (req, res) => {
    try {
        const { id } = req.params;
        const { interface: interfaceName, range = '15m' } = req.query;

        if (!interfaceName) {
            return res.status(400).json({ success: false, message: 'O nome da interface é obrigatório.' });
        }

        // 1. Buscar o IP do roteador no PostgreSQL
        const routerQuery = await pool.query("SELECT ip_address FROM routers WHERE id = $1", [id]);
        if (routerQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Roteador não encontrado.' });
        }
        const routerIp = routerQuery.rows[0].ip_address;

        // 2. Query para buscar dados de RX e TX
        const trafficQuery = `
            from(bucket: "${influxBucket}")
              |> range(start: -${range})
              |> filter(fn: (r) => r._measurement == "interface_stats")
              |> filter(fn: (r) => r.router_host == "${routerIp}")
              |> filter(fn: (r) => r.interface_name == "${decodeURIComponent(interfaceName)}")
              |> filter(fn: (r) => r._field == "rx_bits_per_second" or r._field == "tx_bits_per_second")
              |> toFloat() // [CORREÇÃO ROBUSTA] Garante que bits sejam float
              |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
              |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        `;

        const data = [];
        await new Promise((resolve, reject) => {
            queryApi.queryRows(trafficQuery, {
                next(row, tableMeta) {
                    const o = tableMeta.toObject(row);
                    data.push({ time: o._time, rx: o['rx_bits_per_second'], tx: o['tx_bits_per_second'] });
                },
                error: reject,
                complete: resolve,
            });
        });

        // console.log(`[MONITORING-DEBUG] /interface-traffic: Dados brutos do InfluxDB para ${interfaceName}:`, JSON.stringify(data, null, 2));

        res.json({ success: true, data });
    } catch (error) {
        console.error(`Erro na rota /api/monitoring/router/${req.params.id}/interface-traffic:`, error);
        res.status(500).json({ success: false, message: 'Erro ao buscar dados de tráfego da interface.' });
    }
});

/**
 * @route   GET /api/monitoring/router/:id/live-summary
 * @desc    [NOVO] Busca um resumo de métricas em tempo real para um roteador (CPU, Memória, Clientes). Otimizado para chamadas frequentes.
 * @access  Private
 */
router.get('/router/:id/live-summary', [verifyToken, checkPermission('routers.dashboard.read')], async (req, res) => {
    try {
        const reqId = Math.random().toString(36).substring(7);
        // console.time(`[REQ-${reqId}] GET /live-summary/${req.params.id}`);
        // console.log(`[${new Date().toISOString()}] [REQ-${reqId}] Iniciando live summary...`);
        const { id } = req.params;

        // 1. Buscar o IP do roteador no PostgreSQL
        const routerQuery = await pool.query("SELECT ip_address FROM routers WHERE id = $1", [id]);
        if (routerQuery.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Roteador não encontrado.' });
        }
        const routerIp = routerQuery.rows[0].ip_address;

        // 2. Buscar as métricas mais recentes de CPU e Memória
        const systemQuery = `
            from(bucket: "${influxBucket}")
              |> range(start: -5m)
              |> filter(fn: (r) => r._measurement == "system_resource" and r.router_host == "${routerIp}")
              |> filter(fn: (r) => r._field == "cpu_load" or r._field == "free_memory" or r._field == "total_memory")
              |> toFloat() // [CORREÇÃO ROBUSTA] Converte _value para float, descartando linhas que falham.
              |> last()
              |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        `;
        const systemResult = await queryApi.collectRows(systemQuery);
        const systemData = systemResult[0] || {};

        const cpuLoad = systemData.cpu_load || 0;
        const memoryUsage = (systemData.total_memory && systemData.free_memory) 
            ? ((systemData.total_memory - systemData.free_memory) / systemData.total_memory) * 100 
            : 0;

        // 3. Lógica unificada de contagem de clientes (Hotspot > Wi-Fi > DHCP)
        let connected_clients = 0;
        
        // [REFEITO] A lógica de contagem foi refeita para ser mais robusta,
        // buscando todos os valores e fazendo a contagem de itens únicos no lado do servidor (JS)
        // para evitar inconsistências e diagnosticar problemas de ingestão de dados.

        // Tenta contar clientes Hotspot
        const hotspotQuery = `from(bucket: "${influxBucket}") |> range(start: -10m) |> filter(fn: (r) => r._measurement == "hotspot_active" and r.router_host == "${routerIp}" and r._field == "mac_address") |> keep(columns: ["_value"])`;
        const hotspotRows = await queryApi.collectRows(hotspotQuery);
        const hotspotCount = new Set(hotspotRows.map(r => r._value)).size;

        if (hotspotCount > 0) {
            connected_clients = hotspotCount;
        } else {
            // Se não houver hotspot, tenta contar clientes Wi-Fi
            const wifiQuery = `from(bucket: "${influxBucket}") |> range(start: -10m) |> filter(fn: (r) => r._measurement == "interface_wireless_registration_table" and r.router_host == "${routerIp}" and r._field == "mac_address") |> keep(columns: ["_value"])`;
            const wifiRows = await queryApi.collectRows(wifiQuery);
            const wifiCount = new Set(wifiRows.map(r => r._value)).size;

            if (wifiCount > 0) {
                connected_clients = wifiCount;
            } else {
                // Se não houver Wi-Fi, tenta contar clientes DHCP
                const dhcpQuery = `
                    from(bucket: "${influxBucket}")
                      |> range(start: -10m)
                      |> filter(fn: (r) => r._measurement == "ip_dhcp_server_lease" and r.router_host == "${routerIp}")
                      |> filter(fn: (r) => r._field == "mac_address" or r._field == "status")
                      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
                      |> filter(fn: (r) => r.status == "bound")
                      |> keep(columns: ["mac_address"])
                `;
                const dhcpRows = await queryApi.collectRows(dhcpQuery);
                const dhcpCount = new Set(dhcpRows.map(r => r.mac_address)).size;
                connected_clients = dhcpCount;
            }
        }

        // console.log(`[${new Date().toISOString()}] [REQ-${reqId}] Live Summary para ${routerIp}:`, {
        //     cpu: cpuLoad,
        //     memory: memoryUsage,
        //     clients: connected_clients
        // });

        res.json({
            success: true,
            data: {
                cpu: cpuLoad,
                memory: memoryUsage,
                clients: connected_clients
            }
        });
        // console.timeEnd(`[REQ-${reqId}] GET /live-summary/${req.params.id}`);

    } catch (error) {
        console.error(`Erro na rota /live-summary para o roteador ${req.params.id}:`, error);
        res.status(500).json({ success: false, message: 'Erro ao buscar dados em tempo real.' });
    }
});

module.exports = router;
