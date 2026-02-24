// Ficheiro: controllers/routerController.js
const { pool } = require('../connection'); // [MODIFICADO] Importa apenas a pool
const ping = require('ping');
const { logAction } = require('../services/auditLogService');
// [NOVO] Importa o serviço centralizado do InfluxDB
const { queryApi, influxBucket } = require('../services/influxService');

// [REVERTIDO] Volta a usar node-routeros para melhor compatibilidade de autenticação
let RouterOSClient;
try {
    const routeros = require('node-routeros');
    RouterOSClient = routeros.RouterOSClient || routeros.RouterOSAPI || routeros.default || routeros;
} catch (e) {
    console.error("FATAL: A biblioteca 'node-routeros' não foi encontrada. Execute 'npm install node-routeros' e reinicie o servidor.");
    RouterOSClient = null; 
}
// [REMOVIDO] A responsabilidade de carregar o .env foi movida para o ponto de entrada da aplicação (server.js).

// --- Funções de Roteadores Individuais ---

const getAllRouters = async (req, res) => {
  // [MODIFICADO] Esta rota agora é usada apenas para a lista simples na gestão.
  // A nova rota /status é usada para a página de monitoramento.
  try {
    // [MODIFICADO] Inclui os novos campos de monitoramento e inatividade
    const allRouters = await pool.query('SELECT id, name, status, observacao, group_id, ip_address, is_maintenance, monitoring_interface, status_changed_at FROM routers ORDER BY name ASC');
    res.json(allRouters.rows);
  } catch (error) {
    console.error('Erro ao listar roteadores:', error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

/**
 * [NOVO] Gera um relatório detalhado dos roteadores com disponibilidade e data de ativação.
 */
const getRouterReport = async (req, res) => {
    try {
        // 1. Buscar dados básicos e a data do primeiro registo de utilizador (proxy para data de ativação)
        const query = `
            SELECT
                r.id,
                r.name,
                r.ip_address,
                r.status,
                r.observacao,
                r.is_maintenance, -- [NOVO] Inclui status de manutenção no relatório
                TO_CHAR(MIN(u.data_cadastro), 'DD/MM/YYYY HH24:MI') as first_activity
            FROM routers r
            LEFT JOIN userdetails u ON r.name = u.router_name
            GROUP BY r.id
            ORDER BY r.name ASC
        `;
        const { rows: routers } = await pool.query(query);

        // 2. Calcular disponibilidade dos últimos 30 dias via InfluxDB
        if (queryApi && influxBucket) {
            const availabilityPromises = routers.map(async (router) => {
                if (!router.ip_address) return { id: router.id, availability: 'N/A' };

                try {
                    // Conta quantas janelas de 5 minutos tiveram uptime > 0 nos últimos 30 dias
                    const fluxQuery = `
                        from(bucket: "${influxBucket}")
                          |> range(start: -30d)
                          |> filter(fn: (r) => r._measurement == "system_resource")
                          |> filter(fn: (r) => r.router_host == "${router.ip_address}")
                          |> filter(fn: (r) => r._field == "uptime_seconds")
                          |> aggregateWindow(every: 5m, fn: count)
                          |> filter(fn: (r) => r._value > 0)
                          |> count()
                    `;
                    const result = await queryApi.collectRows(fluxQuery);
                    const onlineWindows = result.length > 0 ? result[0]._value : 0;
                    
                    // Total de janelas em 30 dias (30 dias * 24 horas * 12 janelas/hora = 8640)
                    const totalWindows = 8640;
                    const percentage = ((onlineWindows / totalWindows) * 100).toFixed(2);
                    
                    return { id: router.id, availability: `${percentage}%` };
                } catch (e) {
                    console.error(`Erro ao calcular disponibilidade para ${router.name}:`, e.message);
                    return { id: router.id, availability: 'Erro' };
                }
            });

            const availabilityResults = await Promise.all(availabilityPromises);
            const availabilityMap = new Map(availabilityResults.map(i => [i.id, i.availability]));

            routers.forEach(r => {
                r.availability_30d = availabilityMap.get(r.id) || 'N/A';
            });
        } else {
            routers.forEach(r => r.availability_30d = 'N/A (Sem Influx)');
        }

        res.json(routers);
    } catch (error) {
        console.error('Erro ao gerar relatório de roteadores:', error);
        res.status(500).json({ message: 'Erro interno ao gerar relatório.' });
    }
};

/**
 * [MODIFICADO] Obtém o status detalhado de todos os roteadores, buscando métricas em tempo real do InfluxDB.
 */
const getRoutersStatus = async (req, res) => {
    try {
        // 1. Obter dados base dos roteadores do PostgreSQL
        const pgQuery = `
            SELECT 
                r.id,
                r.name,
                r.ip_address AS ip,
                r.status,
                -- r.latency, -- [REMOVIDO] Ignora banco, vamos calcular em tempo real
                r.is_maintenance, -- [NOVO]
                rg.name AS group_name
            FROM routers r
            LEFT JOIN router_groups rg ON r.group_id = rg.id
            ORDER BY r.name ASC
        `;
        const { rows: routers } = await pool.query(pgQuery);

        // [DEBUG] Log temporário para verificar latência vinda do banco
        // console.log('[DEBUG-ROUTER-STATUS] Latências do DB:', routers.map(r => `${r.name}: ${r.latency}`));

        // 2. Enriquecer cada roteador com dados de ping e InfluxDB em paralelo
        const enrichedRouters = await Promise.all(routers.map(async (router) => {
            let latency = null; // Inicializa como null
            let connected_clients = 0;
            let interface_traffic = {};
            let interfaces = [];
            let default_interface = null;
            let routerVersion = null; // [NOVO] Variável para armazenar a versão

            // Ping para obter latência real
            // [MODIFICADO] Adicionado .trim() para remover espaços em branco do IP vindo do banco de dados.
            const cleanIp = router.ip ? router.ip.trim() : null;

            // [NOVO] Cálculo de Latência em Tempo Real (Média de 3 pings)
            if (cleanIp) {
                let totalLatency = 0;
                let successCount = 0;
                
                // Executa 3 pings sequenciais para este roteador
                for (let i = 0; i < 3; i++) {
                    try {
                        // Timeout curto (1s) para não travar muito se estiver offline
                        const res = await ping.promise.probe(cleanIp, { timeout: 1, min_reply: 1 });
                        if (res.alive) {
                            const val = typeof res.time === 'number' ? res.time : parseFloat(res.avg);
                            if (!isNaN(val)) {
                                totalLatency += val;
                                successCount++;
                            }
                        }
                    } catch (e) {}
                }

                if (successCount > 0) {
                    latency = Math.round(totalLatency / successCount);
                }
            }

            // Se o InfluxDB estiver configurado, buscar métricas
            if (queryApi && cleanIp) { // [MODIFICADO] Apenas executa se houver um IP limpo.
                try {
                    // [NOVO] Query para buscar a versão do roteador a partir do system_resource
                    const versionQuery = `
                        from(bucket: "${influxBucket}")
                          |> range(start: -30d) // Um range amplo para garantir que encontramos o último valor
                          |> filter(fn: (r) => r._measurement == "system_resource" and r.router_host == "${cleanIp}")
                          |> filter(fn: (r) => r._field == "version")
                          |> last()
                    `;
                    const versionResult = await queryApi.collectRows(versionQuery);
                    if (versionResult.length > 0 && versionResult[0]._value) {
                        routerVersion = versionResult[0]._value;
                    }

                    // [MODIFICADO] Adiciona queries para múltiplas fontes de contagem de clientes
                    let hotspot_clients = 0;
                    let dhcp_clients = 0;
                    let wifi_clients = 0;

                    // Query para clientes do Hotspot
                    const hotspotQuery = `
                        from(bucket: "${influxBucket}")
                          |> range(start: -10m)
                          |> filter(fn: (r) => r._measurement == "hotspot_active" and r.router_host == "${cleanIp}")
                          |> group(columns: ["mac_address"])
                          |> last(column: "_time") // Pega o registo mais recente para cada MAC
                          |> group() // Desagrupa para contar
                          |> count() // [CORRIGIDO] A função count() não aceita parâmetros de coluna.
                    `;
                    const hotspotResult = await queryApi.collectRows(hotspotQuery);
                    if (hotspotResult.length > 0) {
                        hotspot_clients = hotspotResult[0]._value || 0;
                    }

                    // Query para clientes DHCP
                    const dhcpQuery = `
                        from(bucket: "${influxBucket}")
                          |> range(start: -24h)
                          |> filter(fn: (r) => r._measurement == "ip_dhcp_server_lease" and r.router_host == "${cleanIp}")
                          |> filter(fn: (r) => r._field == "status")
                          |> group(columns: ["mac_address"])
                          |> last()
                          |> filter(fn: (r) => r._value == "bound")
                          |> group()
                          |> count()
                    `;
                    const dhcpResult = await queryApi.collectRows(dhcpQuery);
                    if (dhcpResult.length > 0) {
                        dhcp_clients = dhcpResult[0]._value || 0;
                    }

                    // Query para clientes Wi-Fi
                    const wifiQuery = `
                        from(bucket: "${influxBucket}")
                          |> range(start: -10m)
                          |> filter(fn: (r) => r._measurement == "interface_wireless_registration_table" and r.router_host == "${cleanIp}")
                          |> group(columns: ["mac_address"])
                          |> last(column: "_time") // Pega o registo mais recente para cada MAC
                          |> group() // Desagrupa para contar
                          |> count() // [CORRIGIDO] A função count() não aceita parâmetros de coluna.
                    `;
                    const wifiResult = await queryApi.collectRows(wifiQuery);
                    if (wifiResult.length > 0) {
                        wifi_clients = wifiResult[0]._value || 0;
                    }

                    // [NOVO] Log de depuração para contagem de clientes
                    // console.log(`[CLIENT-COUNT-DEBUG] Roteador: ${router.name}, Hotspot: ${hotspot_clients}, DHCP: ${dhcp_clients}, Wi-Fi: ${wifi_clients}`);

                    // [MODIFICADO] A contagem de clientes agora prioriza os usuários ativos do hotspot, com fallback para Wi-Fi e DHCP.
                    connected_clients = hotspot_clients > 0 ? hotspot_clients : (wifi_clients > 0 ? wifi_clients : dhcp_clients);

                    // Query para tráfego de todas as interfaces
                    const trafficQuery = `
                        from(bucket: "${influxBucket}")
                          |> range(start: -1m)
                          |> filter(fn: (r) => r._measurement == "interface_stats" and r.router_host == "${cleanIp}")
                          |> filter(fn: (r) => r._field == "rx_bits_per_second" or r._field == "tx_bits_per_second")
                          |> group(columns: ["interface_name"]) |> last() |> group()`;
                    const trafficResult = await queryApi.collectRows(trafficQuery);
                    
                    const trafficData = {};
                    trafficResult.forEach(row => {
                        const ifaceName = row.interface_name;
                        if (!trafficData[ifaceName]) trafficData[ifaceName] = 0;
                        trafficData[ifaceName] += row._value;
                    });
                    interface_traffic = trafficData;

                    // [NOVO] Lógica para determinar uma interface padrão para exibir no gráfico.
                    if (Object.keys(interface_traffic).length > 0) {
                        // 1. Prioriza interfaces com nomes comuns de WAN/Gateway.
                        const wanInterface = Object.keys(interface_traffic).find(iface => /wan|gateway/i.test(iface));
                        if (wanInterface) {
                            default_interface = wanInterface;
                        } else {
                            // 2. Se não encontrar, escolhe a interface com o maior tráfego.
                            default_interface = Object.entries(interface_traffic).reduce((a, b) => a[1] > b[1] ? a : b)[0];
                        }
                    }
                    // [NOVO] Log para depuração da interface padrão
                    // console.log(`[ROUTER-STATUS-DEBUG] Roteador: ${router.name}, IP: ${cleanIp}, Interface Padrão Escolhida: ${default_interface}`);

                    // Query para obter a lista de interfaces existentes
                    // [CORRIGIDO] Usando `schema.tagValues` e o predicado correto, exatamente como funciona em `monitoring.js`.
                    const interfaceListQuery = `
                        import "influxdata/influxdb/schema"
                        schema.tagValues(
                            bucket: "${influxBucket}",
                            tag: "interface_name",
                            start: -24h,
                            predicate: (r) => r._measurement == "interface_stats" and r.router_host == "${cleanIp}"
                        )`;
                    const interfaceResult = await queryApi.collectRows(interfaceListQuery);
                    interfaces = interfaceResult.map(row => ({ name: row._value }));

                } catch (influxError) {
                    console.error(`Erro ao consultar InfluxDB para o roteador ${router.name} (IP: ${cleanIp}):`, influxError);
                }
            }

            return {
                ...router,
                latency: latency !== undefined ? latency : null, // Garante que latency seja enviado
                connected_clients,
                interface_traffic, // Objeto com tráfego por interface
                interfaces: interfaces.length > 0 ? interfaces : [], // Lista real de interfaces
                default_interface: default_interface, // [NOVO] Sugestão de interface padrão
                bandwidth_limit: 10000000, // Limite simulado (10 Mbps)
                routerVersion: routerVersion // [NOVO] Adiciona a versão ao objeto de resposta
            };
        }));

        // [NOVO] 3. Ordena os resultados antes de enviar para o frontend.
        // Ordem: 1. Online, 2. Warning (Latência Alta), 3. Offline.
        // Desempate por nome.
        enrichedRouters.sort((a, b) => {
            const getSortOrder = (r) => {
                if (r.status === 'online') {
                    // Ordem: Crítico (3) > Aviso (2) > Online (1)
                    if (r.latency !== null && r.latency > 200) return 3;
                    if (r.latency !== null && r.latency >= 125) return 2;
                    return 1;
                }
                return 4; // 'offline' (no fim ou no início dependendo da preferência, aqui deixo no fim dos onlines)
            };

            const orderA = getSortOrder(a);
            const orderB = getSortOrder(b);

            if (orderA !== orderB) {
                return orderA - orderB;
            }
            return a.name.localeCompare(b.name);
        });

        res.json(enrichedRouters);
    } catch (error) {
        console.error('Erro ao obter status dos roteadores:', error);
        res.status(500).json({ message: "Erro interno do servidor ao obter status dos roteadores." });
    }
};

const updateRouter = async (req, res) => {
    const { id } = req.params;
    const { observacao, ip_address, is_maintenance, monitoring_interface, username, password, api_port } = req.body; 

    const fields = [];
    const values = [];
    let queryIndex = 1;

    if (observacao !== undefined) {
        fields.push(`observacao = $${queryIndex++}`);
        values.push(observacao);
    }
    
    // --- CORREÇÃO: Trata o campo de IP corretamente ---
    // Permite que o IP seja definido como nulo se o campo estiver vazio.
    if (ip_address !== undefined) {
        fields.push(`ip_address = $${queryIndex++}`);
        values.push(ip_address === '' ? null : ip_address);
    }

    if (is_maintenance !== undefined) {
        fields.push(`is_maintenance = $${queryIndex++}`);
        values.push(is_maintenance);
    }

    if (monitoring_interface !== undefined) {
        fields.push(`monitoring_interface = $${queryIndex++}`);
        values.push(monitoring_interface === '' ? null : monitoring_interface);
    }

    // [NOVO] Adiciona campos de credenciais da API para o monitoramento de interface
    if (username !== undefined) {
        fields.push(`username = $${queryIndex++}`);
        values.push(username === '' ? null : username);
    }
    // A senha só é atualizada se um novo valor for fornecido
    if (password) {
        fields.push(`password = $${queryIndex++}`);
        values.push(password);
    }
    if (api_port !== undefined) {
        // Garante que o valor é um número ou nulo
        const portValue = api_port ? parseInt(api_port, 10) : null;
        fields.push(`api_port = $${queryIndex++}`);
        values.push(isNaN(portValue) ? null : portValue);
    }

    if (fields.length === 0) {
        return res.status(400).json({ message: "Nenhum campo para atualizar foi fornecido." });
    }

    values.push(id);

    try {
        const updateQuery = `UPDATE routers SET ${fields.join(', ')} WHERE id = $${queryIndex} RETURNING *`;
        const updatedRouter = await pool.query(updateQuery, values);

        if (updatedRouter.rowCount === 0) {
            return res.status(404).json({ message: 'Roteador não encontrado.' });
        }

        // [MODIFICADO] Lógica para logs específicos de manutenção
        let action = 'ROUTER_UPDATE';
        let description = `Utilizador "${req.user.email}" atualizou o roteador "${updatedRouter.rows[0].name}".`;

        if (is_maintenance !== undefined) {
            const isMaint = is_maintenance === true || is_maintenance === 'true';
            action = isMaint ? 'ROUTER_MAINTENANCE_ON' : 'ROUTER_MAINTENANCE_OFF';
            description = `Utilizador "${req.user.email}" ${isMaint ? 'ativou' : 'desativou'} o modo de manutenção para o roteador "${updatedRouter.rows[0].name}".`;
        }

        // [SEGURANÇA] Remove a senha dos detalhes antes de salvar no log de auditoria
        const safeDetails = { ...req.body };
        if (safeDetails.password) delete safeDetails.password;
        if (safeDetails.username) delete safeDetails.username; // Opcional, mas boa prática

        await logAction({
            req,
            action: action,
            status: 'SUCCESS',
            description: description,
            target_type: 'router',
            target_id: id,
            details: safeDetails
        });

        res.json({ message: 'Roteador atualizado com sucesso!', router: updatedRouter.rows[0] });
    } catch (error) {
        await logAction({
            req,
            action: 'ROUTER_UPDATE_FAILURE',
            status: 'FAILURE',
            description: `Falha ao atualizar roteador com ID "${id}". Erro: ${error.message}`,
            target_type: 'router',
            target_id: id,
            details: { error: error.message }
        });

        console.error('Erro ao atualizar roteador:', error.message);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
};

const deleteRouter = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE routers SET group_id = NULL WHERE id = $1', [id]);
        const result = await pool.query('DELETE FROM routers WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Roteador não encontrado.' });
        }

        await logAction({
            req,
            action: 'ROUTER_DELETE',
            status: 'SUCCESS',
            description: `Utilizador "${req.user.email}" eliminou o roteador com ID ${id}.`,
            target_type: 'router',
            target_id: id
        });

        res.json({ message: 'Roteador eliminado com sucesso.' });
    } catch (error) {
        await logAction({
            req,
            action: 'ROUTER_DELETE_FAILURE',
            status: 'FAILURE',
            description: `Falha ao eliminar roteador com ID "${id}". Erro: ${error.message}`,
            target_type: 'router',
            target_id: id,
            details: { error: error.message }
        });

        console.error('Erro ao eliminar roteador:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
};

/**
 * [NOVO] Exclui um roteador permanentemente, limpando seu nome da tabela `userdetails`.
 * Requer a permissão 'routers.individual.delete_permanent'.
 */
const deleteRouterPermanently = async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Obter o nome do roteador antes de o excluir
        const routerQuery = await client.query('SELECT name FROM routers WHERE id = $1', [id]);
        if (routerQuery.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Roteador não encontrado.' });
        }
        const routerName = routerQuery.rows[0].name;

        // 2. Atualizar a tabela 'userdetails' para remover a referência ao nome do roteador
        await client.query('UPDATE userdetails SET router_name = NULL WHERE router_name = $1', [routerName]);

        // 3. Excluir o roteador da tabela 'routers'
        await client.query('DELETE FROM routers WHERE id = $1', [id]);

        await client.query('COMMIT');

        await logAction({
            req,
            action: 'ROUTER_PERMANENT_DELETE',
            status: 'SUCCESS',
            description: `Utilizador "${req.user.email}" excluiu permanentemente o roteador "${routerName}" (ID: ${id}).`,
            target_type: 'router',
            target_id: id
        });

        res.json({ message: `Roteador "${routerName}" excluído permanentemente com sucesso.` });
    } catch (error) {
        await client.query('ROLLBACK');
        await logAction({
            req,
            action: 'ROUTER_PERMANENT_DELETE_FAILURE',
            status: 'FAILURE',
            description: `Falha ao excluir permanentemente o roteador com ID "${id}". Erro: ${error.message}`,
            target_type: 'router',
            target_id: id,
            details: { error: error.message }
        });
        console.error('Erro ao excluir roteador permanentemente:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    } finally {
        client.release();
    }
};

const checkRouterStatus = async (req, res) => {
    const { id } = req.params;
    const { period } = req.body; // ex: '24h', '7d', '30d'
    try {
        const routerResult = await pool.query('SELECT ip_address, status, is_maintenance FROM routers WHERE id = $1', [id]);
        if (routerResult.rowCount === 0) {
            return res.status(404).json({ message: 'Roteador não encontrado.' });
        }
        const router = routerResult.rows[0];
        const ip = router.ip_address ? router.ip_address.trim() : null; // Garante que não há espaços
        if (!ip) {
            // Se não tem IP, o status já deve ser offline, mas confirmamos.
            await pool.query("UPDATE routers SET status = 'offline' WHERE id = $1 AND status != 'offline'", [id]);
            const finalState = { status: 'offline', latency: null, status_changed_at: router.status_changed_at, availability: null };
            return res.json(finalState);
        }
        const pingResult = await ping.promise.probe(ip, { timeout: 2 });
        const newStatus = pingResult.alive ? 'online' : 'offline';
        // [NOVO] Captura a latência se estiver vivo
        const latency = pingResult.alive && typeof pingResult.time === 'number' ? Math.round(pingResult.time) : null;

        let updateQuery;
        const queryParams = [newStatus, latency, id];
        
        // [CORREÇÃO] Se estiver em manutenção, NÃO atualiza o status no banco de dados.
        // O estado de manutenção é crítico e manual, não deve ser sobrescrito por automação.
        if (!router.is_maintenance) {
            if (newStatus === 'online') {
                if (router.status !== 'online') {
                    updateQuery = 'UPDATE routers SET status = $1, latency = $2, last_seen = NOW(), status_changed_at = NOW() WHERE id = $3';
                } else {
                    updateQuery = 'UPDATE routers SET status = $1, latency = $2, last_seen = NOW() WHERE id = $3';
                }
            } else {
                if (router.status !== 'offline') {
                    updateQuery = 'UPDATE routers SET status = $1, latency = $2, status_changed_at = NOW() WHERE id = $3';
                } else {
                    // Se já estava offline, não atualiza o banco para preservar o 'status_changed_at' original.
                    updateQuery = null;
                }
            }
            if (updateQuery) {
                await pool.query(updateQuery, queryParams);
            }
        }

        // Re-fetch para obter o estado mais recente, incluindo o status_changed_at
        const finalStateResult = await pool.query('SELECT status, latency, status_changed_at, is_maintenance FROM routers WHERE id = $1', [id]);
        const finalState = { ...finalStateResult.rows[0] };

        // Se estiver online, busca o uptime e a disponibilidade
        if (finalState.status === 'online' && queryApi && influxBucket) {
            // Busca Uptime
            try {
                const uptimeQuery = `
                    from(bucket: "${influxBucket}")
                      |> range(start: -15m) // Busca na última hora para garantir que pega o último dado
                      |> filter(fn: (r) => r._measurement == "system_resource" and r._field == "uptime_seconds")
                      |> filter(fn: (r) => r.router_host == "${ip}")
                      |> last()
                `;
                const uptimeRows = await queryApi.collectRows(uptimeQuery);
                if (uptimeRows.length > 0) {
                    finalState.uptime_seconds = uptimeRows[0]._value;
                }
            } catch (influxError) {
                console.error(`Erro ao buscar uptime para ${ip}: ${influxError.message}`);
                finalState.uptime_seconds = null;
            }

            // [NOVO] Busca Disponibilidade
            // Calcula a disponibilidade com base nos logs de coleta do PostgreSQL
            try {
                const range = period || '24h';
                const availabilityQuery = `
                    SELECT COUNT(*) 
                    FROM router_uptime_log 
                    WHERE router_host = $1 AND collected_at >= NOW() - $2::interval
                `;
                const result = await pool.query(availabilityQuery, [ip, range]);
                const successfulCollections = parseInt(result.rows[0].count, 10);
                
                // Assumindo que o agente coleta a cada 30 segundos
                const collectionIntervalSeconds = 30;
                let totalExpectedCollections;
                if (range === '7d') totalExpectedCollections = 7 * 24 * 60 * (60 / collectionIntervalSeconds);
                else if (range === '30d') totalExpectedCollections = 30 * 24 * 60 * (60 / collectionIntervalSeconds);
                else totalExpectedCollections = 24 * 60 * (60 / collectionIntervalSeconds); // 24h

                finalState.availability = totalExpectedCollections > 0 ? ((successfulCollections / totalExpectedCollections) * 100).toFixed(2) : '0.00';
            } catch (pgError) {
                console.error(`Erro ao buscar disponibilidade no PostgreSQL para ${ip}: ${pgError.message}`);
                finalState.availability = null;
            }
        }

        res.json(finalState);
    } catch (error) {
        console.error(`Erro ao verificar status do roteador ${id}:`, error);
        res.status(500).json({ message: 'Erro interno ao verificar o status.' });
    }
};

/**
 * [NOVO] Reinicia o roteador.
 * Requer permissão 'routers.update'.
 */
const rebootRouter = async (req, res) => {
    const { id } = req.params;
    const { username, password } = req.body;

    // [SEGURANÇA] REMOVIDO log que expunha a senha no console
    // console.log('[DEBUG] Corpo da requisição de reinício recebido:', req.body);

    // Valida se as credenciais foram enviadas
    if (!username || !password) {
        return res.status(400).json({ message: 'Credenciais de API (usuário e senha) são obrigatórias para esta operação.' });
    }
    
    try {
        const routerResult = await pool.query('SELECT name, ip_address, api_port FROM routers WHERE id = $1', [id]);
        if (routerResult.rowCount === 0) {
            return res.status(404).json({ message: 'Roteador não encontrado.' });
        }
        const { name, ip_address, api_port } = routerResult.rows[0];

        if (!ip_address) return res.status(400).json({ message: 'IP não configurado para este roteador.' });

        const user = username;
        const pass = password;
        const port = api_port || 8797; // Usa a porta guardada ou o fallback 8797

        console.log(`[ROUTER-CMD] A conectar a ${name} (${ip_address}:${port})...`);

        if (!RouterOSClient) {
            throw new Error("A biblioteca de conexão com o MikroTik (node-routeros) não pôde ser carregada.");
        }

        // [REVERTIDO] Implementação com node-routeros
        const client = new RouterOSClient({
            host: ip_address,
            user: user,
            password: pass,
            port: port,
            keepalive: false,
            timeout: 60 // Timeout em segundos
        });

        client.on('error', (err) => console.error(`[ROUTER-CMD] Erro no cliente (Reboot): ${err.message}`));

        try {
            await client.connect();
            console.log(`[ROUTER-CMD] Conectado. A enviar comando /system/reboot...`);
            await client.write('/system/reboot');
        } catch (cmdError) {
            // Ignora erros de conexão fechada que são esperados no reboot
            if (cmdError.message && (cmdError.message.includes('closed') || cmdError.message.includes('ended') || cmdError.message.includes('ECONNRESET'))) {
                 console.log(`[ROUTER-CMD] Comando enviado (conexão fechada pelo roteador).`);
            } else {
                 throw cmdError;
            }
        } finally {
            client.close();
        }

        await logAction({
            req,
            action: 'ROUTER_REBOOT',
            status: 'SUCCESS',
            description: `Utilizador "${req.user.email}" enviou comando de reinício para o roteador "${name}" (${ip_address}).`,
            target_type: 'router',
            target_id: id
        });

        res.json({ success: true, message: `Comando de reinício enviado para o roteador ${name}.` });

    } catch (error) {
        console.error(`Erro ao reiniciar roteador ${id}:`, error.message);
        
        // [CORRIGIDO] Fallback mais robusto para a mensagem de erro
        let userMessage = `Erro ao tentar reiniciar: ${error.message || JSON.stringify(error)}`;

        // Tratamento de erros comuns de rede e autenticação
        // [MODIFICADO] Adaptação para mensagens de erro do node-routeros
        if (error.message && (error.message.includes('login failure') || error.message.includes('cannot log in'))) {
            userMessage = `Falha de autenticação. Verifique se o usuário e senha da API do roteador estão corretos no painel.`;
        } else if (error.code === 'ECONNREFUSED') {
            userMessage = `Conexão recusada pelo roteador (${error.address || 'IP'}:${error.port || 8728}). Verifique se o serviço API está ativado no MikroTik (/ip service enable api) e se a porta está correta.`;
        } else if (error.code === 'ETIMEDOUT' || (error.message && error.message.includes('Timeout'))) {
            userMessage = `Tempo limite esgotado. O servidor não conseguiu alcançar o roteador. Verifique o IP e a conectividade.`;
        }

        await logAction({
            req,
            action: 'ROUTER_REBOOT_FAILURE',
            status: 'FAILURE',
            description: `Falha ao reiniciar roteador ${id}: ${error.message}`,
            target_type: 'router',
            target_id: id,
            details: { error: error.message, code: error.code }
        });

        res.status(500).json({ message: userMessage });
    }
};


// --- Funções de Deteção e Grupos ---
const discoverNewRouters = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const detectedResult = await client.query('SELECT DISTINCT router_name FROM userdetails WHERE router_name IS NOT NULL');
        const detectedNames = detectedResult.rows.map(r => r.router_name);
        
        const registeredResult = await client.query('SELECT name FROM routers');
        const registeredNames = new Set(registeredResult.rows.map(r => r.name));
        
        const newRouters = detectedNames.filter(name => !registeredNames.has(name));

        // [NOVO] Se encontrar novos roteadores, cria notificações para admins
        if (newRouters.length > 0) {
            const adminUsers = await client.query("SELECT id FROM admin_users WHERE role IN ('master', 'gestao')");
            
            for (const routerName of newRouters) {
                const notificationMessage = `Novo roteador detetado: "${routerName}". Adicione-o na página de Roteadores.`;
                
                for (const admin of adminUsers.rows) {
                    // Evita notificações duplicadas para o mesmo roteador/usuário
                    await client.query(`
                        INSERT INTO notifications (user_id, type, message, is_read)
                        SELECT $1, 'new_router', $2, false
                        WHERE NOT EXISTS (
                            SELECT 1 FROM notifications 
                            WHERE user_id = $1 AND message = $2 AND is_read = false
                        );
                    `, [admin.id, notificationMessage]);
                }
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, data: newRouters });
    } catch (error) {
        console.error('Erro ao detetar novos roteadores:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    } finally {
        // [CORRIGIDO] Garante que a conexão com o banco de dados seja sempre liberada
        if (client) client.release();
    }
};

const batchAddRouters = async (req, res) => {
    const { routerNames } = req.body;
    if (!routerNames || !Array.isArray(routerNames) || routerNames.length === 0) {
        return res.status(400).json({ message: 'Nenhum nome de roteador foi fornecido.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const query = `
            INSERT INTO routers (name, status) 
            SELECT name, 'offline' 
            FROM unnest($1::text[]) AS name
            ON CONFLICT (name) DO NOTHING;
        `;
        await client.query(query, [routerNames]);
        await client.query('COMMIT');

        await logAction({
            req,
            action: 'ROUTER_BATCH_ADD',
            status: 'SUCCESS',
            description: `Utilizador "${req.user.email}" adicionou ${routerNames.length} roteador(es) em massa.`,
            target_type: 'router',
            details: { routerNames: routerNames }
        });

        res.status(201).json({ message: `${routerNames.length} roteador(es) adicionado(s) com sucesso!` });
    } catch (error) {
        await client.query('ROLLBACK');

        await logAction({
            req,
            action: 'ROUTER_BATCH_ADD_FAILURE',
            status: 'FAILURE',
            description: `Falha ao adicionar roteadores em massa. Erro: ${error.message}`,
            target_type: 'router',
            details: { error: error.message }
        });

        console.error('Erro ao adicionar roteadores em massa:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    } finally {
        client.release();
    }
};

const getAllRouterGroups = async (req, res) => {
  try {
    const query = `
      SELECT rg.id, rg.name, rg.observacao, COUNT(r.id) as router_count
      FROM router_groups rg
      LEFT JOIN routers r ON rg.id = r.group_id
      GROUP BY rg.id
      ORDER BY rg.name ASC;
    `;
    const allGroups = await pool.query(query);
    res.json(allGroups.rows);
  } catch (error) {
    console.error('Erro ao listar grupos:', error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

const createRouterGroup = async (req, res) => {
  const { name, observacao, routerIds } = req.body;
  if (!name || !routerIds || !Array.isArray(routerIds)) {
    return res.status(400).json({ message: "Nome do grupo e pelo menos 2 IDs de roteadores são obrigatórios." });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const checkQuery = 'SELECT id, name FROM routers WHERE id = ANY($1::int[]) AND group_id IS NOT NULL';
    const checkResult = await client.query(checkQuery, [routerIds]);
    if (checkResult.rows.length > 0) {
      const routerNames = checkResult.rows.map(r => r.name).join(', ');
      await client.query('ROLLBACK');
      return res.status(409).json({ message: `Os roteadores ${routerNames} já pertencem a um grupo.` });
    }
    const insertGroupQuery = 'INSERT INTO router_groups (name, observacao) VALUES ($1, $2) RETURNING id';
    const newGroup = await client.query(insertGroupQuery, [name, observacao]);
    const newGroupId = newGroup.rows[0].id;
    const updateRoutersQuery = 'UPDATE routers SET group_id = $1 WHERE id = ANY($2::int[])';
    await client.query(updateRoutersQuery, [newGroupId, routerIds]);
    await client.query('COMMIT');

    await logAction({
        req,
        action: 'ROUTER_GROUP_CREATE',
        status: 'SUCCESS',
        description: `Utilizador "${req.user.email}" criou o grupo de roteadores "${name}".`,
        target_type: 'router_group',
        target_id: newGroupId
    });

    res.status(201).json({ message: `Grupo '${name}' criado com sucesso.` });
  } catch (error) {
    await client.query('ROLLBACK');

    await logAction({
        req,
        action: 'ROUTER_GROUP_CREATE_FAILURE',
        status: 'FAILURE',
        description: `Falha ao criar grupo de roteadores com nome "${name}". Erro: ${error.message}`,
        target_type: 'router_group',
        details: { error: error.message }
    });

    console.error('Erro ao criar grupo:', error);
    res.status(500).json({ message: "Erro interno do servidor." });
  } finally {
    client.release();
  }
};

const updateRouterGroup = async (req, res) => {
    const { id } = req.params;
    const { name, observacao, routerIds } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const updateGroupQuery = 'UPDATE router_groups SET name = $1, observacao = $2 WHERE id = $3';
        await client.query(updateGroupQuery, [name, observacao, id]);
        await client.query('UPDATE routers SET group_id = NULL WHERE group_id = $1', [id]);
        if (routerIds && routerIds.length > 0) {
            const updateRoutersQuery = 'UPDATE routers SET group_id = $1 WHERE id = ANY($2::int[])';
            await client.query(updateRoutersQuery, [id, routerIds]);
        }
        await client.query('COMMIT');

        await logAction({
            req,
            action: 'ROUTER_GROUP_UPDATE',
            status: 'SUCCESS',
            description: `Utilizador "${req.user.email}" atualizou o grupo de roteadores "${name}".`,
            target_type: 'router_group',
            target_id: id
        });

        res.json({ message: 'Grupo atualizado com sucesso!' });
    } catch (error) {
        await client.query('ROLLBACK');

        await logAction({
            req,
            action: 'ROUTER_GROUP_UPDATE_FAILURE',
            status: 'FAILURE',
            description: `Falha ao atualizar grupo de roteadores com ID "${id}". Erro: ${error.message}`,
            target_type: 'router_group',
            target_id: id,
            details: { error: error.message }
        });

        console.error('Erro ao atualizar grupo:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    } finally {
        client.release();
    }
};

const deleteRouterGroup = async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE routers SET group_id = NULL WHERE group_id = $1', [id]);
        await client.query('DELETE FROM router_groups WHERE id = $1', [id]);
        await client.query('COMMIT');

        await logAction({
            req,
            action: 'ROUTER_GROUP_DELETE',
            status: 'SUCCESS',
            description: `Utilizador "${req.user.email}" eliminou o grupo de roteadores com ID ${id}.`,
            target_type: 'router_group',
            target_id: id
        });

        res.json({ message: 'Grupo eliminado com sucesso.' });
    } catch (error) {
        await client.query('ROLLBACK');

        await logAction({
            req,
            action: 'ROUTER_GROUP_DELETE_FAILURE',
            status: 'FAILURE',
            description: `Falha ao eliminar grupo de roteadores com ID "${id}". Erro: ${error.message}`,
            target_type: 'router_group',
            target_id: id,
            details: { error: error.message }
        });

        console.error('Erro ao eliminar grupo:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    } finally {
        client.release();
    }
};

// [NOVO] Obtém a distribuição de utilizadores por roteador dentro de um grupo
const getRouterGroupUserDistribution = async (req, res) => {
    const { id } = req.params; // ID do Grupo
    const { period } = req.query; // '24h', '7d', '30d', 'all'

    try {
        let dateFilter = "";
        // Filtra por data de criação do utilizador (novos registos)
        if (period && period !== 'all') {
            if (period === '24h') dateFilter = "AND u.created_at >= NOW() - INTERVAL '24 hours'";
            else if (period === '7d') dateFilter = "AND u.created_at >= NOW() - INTERVAL '7 days'";
            else if (period === '30d') dateFilter = "AND u.created_at >= NOW() - INTERVAL '30 days'";
        }

        const query = `
            SELECT r.name as router_name, COUNT(u.id)::int as user_count
            FROM routers r
            LEFT JOIN userdetails u ON r.name = u.router_name ${dateFilter}
            WHERE r.group_id = $1
            GROUP BY r.name
            ORDER BY user_count DESC
        `;
        
        const result = await pool.query(query, [id]);
        
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Erro ao buscar distribuição de usuários do grupo:', error);
        res.status(500).json({ success: false, message: "Erro interno do servidor." });
    }
};

/**
 * [NOVO] Busca a lista de leases DHCP ativos diretamente do roteador.
 */
const getDhcpLeases = async (req, res) => {
    const { id } = req.params;
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Credenciais de API são obrigatórias.' });
    }

    try {
        const routerResult = await pool.query('SELECT name, ip_address, api_port FROM routers WHERE id = $1', [id]);
        if (routerResult.rowCount === 0) {
            return res.status(404).json({ message: 'Roteador não encontrado.' });
        }
        const { name, ip_address, api_port } = routerResult.rows[0];

        if (!ip_address) return res.status(400).json({ message: 'IP não configurado para este roteador.' });

        if (!RouterOSClient) {
            throw new Error("A biblioteca de conexão com o MikroTik (node-routeros) não pôde ser carregada.");
        }

        const client = new RouterOSClient({ host: ip_address, user: username, password: password, port: api_port || 8797, keepalive: false, timeout: 60 });

        // [CORRIGIDO] Adiciona tratamento de erro e limpeza de listener para evitar memory leak
        const leases = await new Promise(async (resolve, reject) => {
            const errorHandler = (err) => reject(err);
            client.on('error', errorHandler);

            try {
                await client.connect();
                const result = await client.write('/ip/dhcp-server/lease/print');
                resolve(result);
            } catch (err) {
                reject(err);
            } finally {
                // Garante que o listener seja removido e a conexão fechada
                client.removeListener('error', errorHandler);
                client.close();
            }
        });

        // Filtra apenas os leases ativos ('bound')
        // [CORREÇÃO] Garante que leases é um array antes de filtrar e trata erros de string
        const leasesList = Array.isArray(leases) ? leases : [];
        const activeLeases = leasesList.filter(lease => lease.status === 'bound');

        res.json({ success: true, data: activeLeases });

    } catch (error) {
        console.error(`Erro ao buscar leases DHCP do roteador ${id}:`, error.message);
        // [CORREÇÃO] Retorna um status HTTP mais apropriado para timeouts
        if (error.message && error.message.toLowerCase().includes('timeout')) {
            return res.status(504).json({ message: `Gateway Timeout: O roteador não respondeu a tempo ao buscar leases DHCP.` });
        }
        const errorMessage = error.message || (typeof error === 'string' ? error : 'Erro desconhecido');
        res.status(500).json({ message: `Erro ao buscar leases DHCP: ${errorMessage}` });
    }
};

/**
 * [NOVO] Busca a lista de clientes Wi-Fi conectados diretamente do roteador.
 */
const getWifiClients = async (req, res) => {
    const { id } = req.params;
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Credenciais de API são obrigatórias.' });
    }

    try {
        const routerResult = await pool.query('SELECT name, ip_address, api_port FROM routers WHERE id = $1', [id]);
        if (routerResult.rowCount === 0) {
            return res.status(404).json({ message: 'Roteador não encontrado.' });
        }
        const { name, ip_address, api_port } = routerResult.rows[0];

        if (!ip_address) return res.status(400).json({ message: 'IP não configurado para este roteador.' });

        if (!RouterOSClient) throw new Error("A biblioteca de conexão com o MikroTik (node-routeros) não pôde ser carregada.");

        const client = new RouterOSClient({ host: ip_address, user: username, password: password, port: api_port || 8797, keepalive: false, timeout: 20 });

        // [CORREÇÃO] Adiciona tratamento de erro para evitar crash do servidor
        const clients = await new Promise(async (resolve, reject) => {
            // [CORRIGIDO] Define o handler de erro fora para poder removê-lo depois
            const errorHandler = (err) => reject(err);
            client.on('error', errorHandler);

            try {
                await client.connect();
                let result = [];
                // [NOVO] Define a lista de propriedades desejadas para otimizar a query,
                // evitando timeouts em roteadores com muitos dados.
                const proplist = [
                    '?.proplist=.id,mac-address,interface,uptime,last-ip,signal-strength,tx-rate,rx-rate,p-throughput,tx-ccq,signal-to-noise'
                ];
                // Lógica de deteção automática para diferentes drivers Wi-Fi (Legacy vs WifiWave2/Wifi)
                try {
                    // 1. Tenta o comando legado (Wireless) - Padrão antigo
                    result = await client.write('/interface/wireless/registration-table/print', proplist);
                } catch (legacyError) {
                    // Se falhar com erro de comando inexistente, tenta os novos padrões
                    const msg = legacyError.message || '';
                    if (msg.includes('no such command') || msg.includes('directory')) {
                        // [CORREÇÃO] Adiciona try/catch aninhado para tratar falhas nos comandos alternativos
                        try {
                            // 2. Tenta o novo pacote 'wifi' (RouterOS 7.13+)
                            result = await client.write('/interface/wifi/registration-table/print', proplist);
                        } catch (wifiError) {
                            try {
                                // 3. Tenta o pacote 'wifiwave2' (RouterOS 7.x versões anteriores)
                                result = await client.write('/interface/wifiwave2/registration-table/print', proplist);
                            } catch (wave2Error) {
                                throw wave2Error; // Se todos falharem, relança o último erro
                            }
                        }
                    } else {
                        throw legacyError; // Se for outro erro (ex: timeout), relança
                    }
                }
                resolve(result);
            } catch (err) {
                reject(err);
            } finally {
                // [CRÍTICO] Garante que o ouvinte de erro seja sempre removido para evitar memory leaks.
                client.removeListener('error', errorHandler);
                client.close();
            }
        });

        // [CORREÇÃO] Garante que clients é um array
        const clientsList = Array.isArray(clients) ? clients : [];
        res.json({ success: true, data: clientsList });

    } catch (error) {
        console.error(`Erro ao buscar clientes Wi-Fi do roteador ${id}:`, error.message);
        if (error.message && error.message.toLowerCase().includes('timeout')) {
            return res.status(504).json({ message: `Gateway Timeout: O roteador não respondeu a tempo ao buscar clientes Wi-Fi.` });
        }
        const errorMessage = error.message || (typeof error === 'string' ? error : 'Erro desconhecido');
        res.status(500).json({ message: `Erro ao buscar clientes Wi-Fi: ${errorMessage}` });
    }
};

/**
 * [NOVO] Busca a lista de utilizadores Hotspot ativos diretamente do roteador.
 */
const getHotspotActive = async (req, res) => {
    const { id } = req.params;
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Credenciais de API são obrigatórias.' });
    }

    try {
        const routerResult = await pool.query('SELECT name, ip_address, api_port FROM routers WHERE id = $1', [id]);
        if (routerResult.rowCount === 0) {
            return res.status(404).json({ message: 'Roteador não encontrado.' });
        }
        const { name, ip_address, api_port } = routerResult.rows[0];

        if (!ip_address) return res.status(400).json({ message: 'IP não configurado para este roteador.' });

        if (!RouterOSClient) throw new Error("A biblioteca de conexão com o MikroTik (node-routeros) não pôde ser carregada.");

        const client = new RouterOSClient({ host: ip_address, user: username, password: password, port: api_port || 8797, keepalive: false, timeout: 60 });

        // [CORREÇÃO] Adiciona tratamento de erro para evitar crash do servidor
        const activeUsers = await new Promise(async (resolve, reject) => {
            client.on('error', reject);
            try {
                await client.connect();
                const result = await client.write('/ip/hotspot/active/print');
                resolve(result);
            } catch (err) {
                reject(err);
            } finally {
                client.close();
            }
        });

        // [CORREÇÃO] Garante que activeUsers é um array
        const activeUsersList = Array.isArray(activeUsers) ? activeUsers : [];
        res.json({ success: true, data: activeUsersList });

    } catch (error) {
        console.error(`Erro ao buscar utilizadores Hotspot do roteador ${id}:`, error.message);
        if (error.message && error.message.toLowerCase().includes('timeout')) {
            return res.status(504).json({ message: `Gateway Timeout: O roteador não respondeu a tempo ao buscar utilizadores Hotspot.` });
        }
        const errorMessage = error.message || (typeof error === 'string' ? error : 'Erro desconhecido');
        res.status(500).json({ message: `Erro ao buscar utilizadores Hotspot: ${errorMessage}` });
    }
};

/**
 * [NOVO] Desconecta (Kick) um cliente.
 */
const kickClient = async (req, res) => {
    const { id } = req.params;
    const { username, password, type, clientId } = req.body; // clientId pode ser o ID interno (.id) ou MAC

    if (!username || !password || !type || !clientId) {
        return res.status(400).json({ message: 'Dados insuficientes para realizar a ação.' });
    }

    try {
        const routerResult = await pool.query('SELECT ip_address, api_port FROM routers WHERE id = $1', [id]);
        if (routerResult.rowCount === 0) return res.status(404).json({ message: 'Roteador não encontrado.' });
        const { ip_address, api_port } = routerResult.rows[0];

        const client = new RouterOSClient({ host: ip_address, user: username, password: password, port: api_port || 8797, keepalive: false, timeout: 45 });
        
        // [CORREÇÃO] Adiciona tratamento de erro para evitar crash do servidor
        await new Promise(async (resolve, reject) => {
            client.on('error', reject);
            try {
                await client.connect();
                if (type === 'hotspot') {
                    await client.write('/ip/hotspot/active/remove', { '.id': clientId });
                } else if (type === 'wifi') {
                    try {
                        await client.write('/interface/wireless/registration-table/remove', { '.id': clientId });
                    } catch (e) {
                        try {
                            await client.write('/interface/wifi/registration-table/remove', { '.id': clientId });
                        } catch (e2) {
                            await client.write('/interface/wifiwave2/registration-table/remove', { '.id': clientId });
                        }
                    }
                } else if (type === 'dhcp') {
                    await client.write('/ip/dhcp-server/lease/remove', { '.id': clientId });
                }
                resolve();
            } catch (err) {
                reject(err);
            } finally {
                client.close();
            }
        });

        res.json({ success: true, message: 'Cliente desconectado com sucesso.' });
    } catch (error) {
        console.error(`Erro ao desconectar cliente no roteador ${id}:`, error.message);
        if (error.message && error.message.toLowerCase().includes('timeout')) {
            return res.status(504).json({ message: `Gateway Timeout: O roteador não respondeu a tempo.` });
        }
        const errorMessage = error.message || (typeof error === 'string' ? error : 'Erro desconhecido');
        res.status(500).json({ message: errorMessage });
    }
};

/**
 * [NOVO] Executa ferramentas de diagnóstico (Ping).
 */
const runDiagnostics = async (req, res) => {
    const { id } = req.params;
    const { username, password, tool, target } = req.body;

    // [NOVO] Validação no backend para garantir que o alvo não está vazio
    if (tool === 'ping' && (!target || target.trim() === '')) {
        return res.status(400).json({ message: 'O alvo (target) do ping é obrigatório.' });
    }

    try {
        const routerResult = await pool.query('SELECT ip_address, api_port FROM routers WHERE id = $1', [id]);
        if (routerResult.rowCount === 0) return res.status(404).json({ message: 'Roteador não encontrado.' });
        const { ip_address, api_port } = routerResult.rows[0];

        const client = new RouterOSClient({ host: ip_address, user: username, password: password, port: api_port || 8797, keepalive: false, timeout: 90 });
        
        // [CORREÇÃO] Adiciona tratamento de erro para evitar crash do servidor
        const result = await new Promise(async (resolve, reject) => {
            client.on('error', reject);
            try {
                await client.connect();
                if (tool === 'ping') {
                    // [REVERTIDO] Passagem de parâmetros como array de strings com prefixo '='
                    const pingResult = await client.write('/ping', [
                        `=address=${target}`,
                        '=count=4',
                        '=interval=1'
                    ]);
                    resolve(pingResult);
                } else {
                    resolve([]);
                }
            } catch (err) {
                reject(err);
            } finally {
                client.close();
            }
        });

        res.json({ success: true, data: result });
    } catch (error) {
        // [CORREÇÃO] Retorna um status HTTP mais apropriado para timeouts
        if (error.message && error.message.toLowerCase().includes('timeout')) {
            return res.status(504).json({ message: `Gateway Timeout: O roteador não respondeu a tempo. (${error.message})` });
        }
        const errorMessage = error.message || (typeof error === 'string' ? error : 'Erro desconhecido');
        res.status(500).json({ message: errorMessage });
    }
};

/**
 * [NOVO] Obtém dados de saúde do hardware (Temperatura, Voltagem).
 */
const getHardwareHealth = async (req, res) => {
    const { id } = req.params;
    const { username, password } = req.body;

    try {
        const routerResult = await pool.query('SELECT ip_address, api_port FROM routers WHERE id = $1', [id]);
        if (routerResult.rowCount === 0) return res.status(404).json({ message: 'Roteador não encontrado.' });
        const { ip_address, api_port } = routerResult.rows[0];

        const client = new RouterOSClient({ host: ip_address, user: username, password: password, port: api_port || 8797, keepalive: false, timeout: 45 });
        
        // [CORREÇÃO] Adiciona tratamento de erro para evitar crash do servidor
        const health = await new Promise(async (resolve, reject) => {
            client.on('error', reject);
            try {
                await client.connect();
                const result = await client.write('/system/health/print');
                resolve(result);
            } catch (err) {
                reject(err);
            } finally {
                client.close();
            }
        });
        
        res.json({ success: true, data: health });
    } catch (error) {
        if (error.message && error.message.toLowerCase().includes('timeout')) {
            return res.status(504).json({ message: `Gateway Timeout: O roteador não respondeu a tempo.` });
        }
        const errorMessage = error.message || (typeof error === 'string' ? error : 'Erro desconhecido');
        res.status(500).json({ message: errorMessage });
    }
};

/**
 * [NOVO] Gestão de Backups (Listar, Criar, Restaurar).
 */
const manageBackups = async (req, res) => {
    const { id } = req.params;
    const { username, password, action, fileName } = req.body;

    if ((action === 'delete' || action === 'restore') && (!fileName || fileName === 'undefined')) {
        return res.status(400).json({ message: 'ID ou nome do arquivo inválido para esta ação.' });
    }

    let client = null;

    try {
        const routerResult = await pool.query('SELECT ip_address, api_port FROM routers WHERE id = $1', [id]);
        if (routerResult.rowCount === 0) return res.status(404).json({ message: 'Roteador não encontrado.' });
        const { ip_address, api_port } = routerResult.rows[0];

        // [MODIFICADO] Remove o wrapper 'new Promise' para simplificar e evitar erros de gestão de estado
        client = new RouterOSClient({ 
            host: ip_address, 
            user: username, 
            password: password, 
            port: api_port || 8797, 
            keepalive: false, 
            timeout: 120 
        });
        
        // [NOVO] Adiciona um handler de erro para o cliente.
        // Isso é crucial para capturar erros de protocolo ou conexão que não são
        // capturados pelo try/catch em torno de `await` e evitar um crash de "unhandled error event".
        client.on('error', (err) => {
            // Apenas loga o erro. O try/catch principal ou o guardião global irão lidar com a resposta ao utilizador.
            console.error(`[ROUTER-CMD] Erro no cliente (Backup): ${err.message}`);
        });

        await client.connect();

        let responseData = null;
        let responseMessage = '';

        if (action === 'list') {
            const files = await client.write('/file/print');
            // [CORREÇÃO] Filtra e mapeia 'last-modified' para 'creation-time' se necessário
            responseData = files
                .filter(f => f.type === 'backup' || (f.name && f.name.endsWith('.backup')))
                .map(f => ({ ...f, 'creation-time': f['creation-time'] || f['last-modified'] }));

        } else if (action === 'create') {
            const name = fileName || `backup_painel_${new Date().toISOString().slice(0,10).replace(/-/g,'')}`;
            await client.write('/system/backup/save', { 'name': name });
            responseMessage = 'Backup criado com sucesso.';
        } else if (action === 'restore') {
            try {
                await client.write('/system/backup/load', { 'name': fileName, 'password': '' });
            } catch (e) {
                if (!e.message.includes('closed') && !e.message.includes('ended') && !e.message.includes('ECONNRESET')) throw e;
            }
            responseMessage = 'Comando de restauração enviado. O roteador irá reiniciar.';
        } else if (action === 'delete') {
            // [CORREÇÃO] Verifica se é um ID interno (*...) ou nome de arquivo
            let idToDelete = fileName;
            if (!fileName.startsWith('*')) {
                // Se não for ID, tenta encontrar o arquivo pelo nome para obter o ID real
                        // [CORREÇÃO] Busca todos os arquivos e filtra no código para evitar erros de sintaxe de query da API
                        const files = await client.write('/file/print');
                        // Garante que files é um array antes de usar .find
                        const filesList = Array.isArray(files) ? files : (files ? [files] : []);
                        const targetFile = filesList.find(f => f.name === fileName);
                        
                        // [DEBUG] Log para ajudar a identificar o problema
                        // console.log(`[BACKUP] Excluindo '${fileName}'. Encontrado:`, targetFile ? targetFile['.id'] : 'Não');

                        if (targetFile && targetFile['.id']) {
                            idToDelete = targetFile['.id'];
                } else {
                    throw new Error("no such item (file not found)");
                }
            }
            await client.write('/file/remove', { '.id': idToDelete });
            // [CORRIGIDO] A biblioteca 'node-routeros' espera um formato de array de strings para este comando,
            // similar a outras funções como 'ping'. O erro "missing =.id=" indica que o formato de objeto não é reconhecido.
            await client.write('/file/remove', [`=.id=${idToDelete}`]);
            responseMessage = 'Backup excluído.';
        }

        client.close();
        res.json({ success: true, message: responseMessage, data: responseData });

    } catch (error) {
        if (client) {
            try { client.close(); } catch (e) { /* Ignora erro ao fechar */ }
        }

        // [DEBUG] Log completo do erro para ver detalhes do 500
        console.error(`Erro em manageBackups (Router ${id}, Action ${action}):`, error.message);

        if (error.message && error.message.toLowerCase().includes('timeout')) {
            return res.status(504).json({ message: `Gateway Timeout: O roteador não respondeu a tempo.` });
        }
        // [NOVO] Tratamento específico para arquivo não encontrado (evita erro 500)
        if (error.message && (error.message.includes('no such item') || error.message.includes('file not found') || error.message.includes('input does not match any value'))) {
             return res.status(404).json({ message: 'Arquivo de backup não encontrado no roteador.' });
        }
        const errorMessage = error.message || (typeof error === 'string' ? error : 'Erro desconhecido');
        res.status(500).json({ message: errorMessage });
    }
};

/**
 * [NOVO] Gera um relatório de uptime/disponibilidade para o período selecionado.
 * Baseado na tabela 'router_uptime_log'.
 */
const getRouterUptimeReport = async (req, res) => {
    const { startDate, endDate, routerId } = req.query;

    try {
        // Define datas padrão se não fornecidas (últimos 30 dias)
        const end = endDate ? new Date(endDate) : new Date();
        const start = startDate ? new Date(startDate) : new Date(new Date().setDate(end.getDate() - 30));
        
        // Ajusta para cobrir o dia inteiro
        const queryEnd = new Date(end);
        queryEnd.setHours(23, 59, 59, 999);
        
        const queryStart = new Date(start);
        queryStart.setHours(0, 0, 0, 0);

        let query = `
            SELECT
                r.name,
                r.ip_address,
                COUNT(rul.id) as uptime_count
            FROM routers r
            LEFT JOIN router_uptime_log rul ON r.ip_address = rul.router_host 
                AND rul.collected_at >= $1 
                AND rul.collected_at <= $2
            WHERE 1=1
        `;
        
        const params = [queryStart, queryEnd];
        let paramIndex = 3;

        if (routerId) {
            query += ` AND r.id = $${paramIndex++}`;
            params.push(routerId);
        }

        query += ` GROUP BY r.id, r.name, r.ip_address ORDER BY r.name`;

        const result = await pool.query(query, params);

        const reportData = result.rows.map(row => {
            const count = parseInt(row.uptime_count, 10);
            // O agente coleta a cada 30 segundos.
            const uptimeSeconds = count * 30; 
            
            const totalPeriodSeconds = (queryEnd - queryStart) / 1000;
            // Calcula percentagem, limitando a 100%
            const availability = totalPeriodSeconds > 0 ? ((uptimeSeconds / totalPeriodSeconds) * 100) : 0;
            const finalAvailability = Math.min(availability, 100).toFixed(2);

            // Formata o tempo online
            const days = Math.floor(uptimeSeconds / 86400);
            const hours = Math.floor((uptimeSeconds % 86400) / 3600);
            const minutes = Math.floor((uptimeSeconds % 3600) / 60);
            const uptimeFormatted = `${days}d ${hours}h ${minutes}m`;

            return {
                name: row.name,
                ip: row.ip_address,
                uptime_formatted: uptimeFormatted,
                availability: `${finalAvailability}%`,
                period: `${queryStart.toLocaleDateString('pt-BR')} a ${queryEnd.toLocaleDateString('pt-BR')}`
            };
        });

        res.json({ success: true, data: reportData });

    } catch (error) {
        console.error('Erro ao gerar relatório de uptime:', error);
        res.status(500).json({ message: 'Erro interno ao gerar relatório.' });
    }
};

module.exports = {
  getRoutersStatus, // Exporta a nova função
  getAllRouters,
  getRouterReport, // [NOVO] Exporta a função de relatório
  getRouterUptimeReport, // [NOVO] Exporta a nova função
  updateRouter,
  deleteRouter,
  deleteRouterPermanently, // Exporta a nova função
  checkRouterStatus,
  rebootRouter, // [NOVO] Exporta a função de reinício
  discoverNewRouters,
  batchAddRouters,
  getAllRouterGroups,
  createRouterGroup,
  updateRouterGroup,
  deleteRouterGroup,
  getRouterGroupUserDistribution, // [NOVO]
  getDhcpLeases, // [NOVO]
  getWifiClients, // [NOVO]
  getHotspotActive, // [NOVO]
  kickClient, // [NOVO]
  runDiagnostics, // [NOVO]
  getHardwareHealth, // [NOVO]
  manageBackups // [NOVO]
};
