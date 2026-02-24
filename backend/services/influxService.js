// Ficheiro: backend/services/influxService.js
// Descrição: Centraliza a conexão e o status do InfluxDB.

const { InfluxDB } = require('@influxdata/influxdb-client');
require('dotenv').config();

const influxUrl = process.env.INFLUXDB_URL;
const influxToken = process.env.INFLUXDB_TOKEN;
const influxOrg = process.env.INFLUXDB_ORG;
const influxBucket = process.env.INFLUXDB_BUCKET;

let queryApi = null;
let influxConnectionStatus = { connected: false, error: null };
let reconnectInterval = null;

const checkInfluxConnection = async () => {
    if (!queryApi) {
        influxConnectionStatus = { connected: false, error: 'Not configured' };
        return;
    }
    console.log('🔄 [INFLUX-SERVICE] A testar conexão com InfluxDB...');
    try {
        // Uma query simples para testar a conexão, buscando os buckets disponíveis.
        await queryApi.collectRows(`buckets() |> limit(n:1)`);
        
        if (!influxConnectionStatus.connected) {
            console.log('✅ [INFLUX-SERVICE] Conexão com InfluxDB restabelecida!');
        }
        influxConnectionStatus.connected = true;
        influxConnectionStatus.error = null;
        
        // Se a reconexão foi bem-sucedida, para o intervalo
        if (reconnectInterval) {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
            console.log('🔄 [INFLUX-SERVICE] Tentativas de reconexão automáticas paradas.');
        }
    } catch (error) {
        const errorMessage = error.message || 'Erro desconhecido';
        console.error('❌ [INFLUX-SERVICE] Falha na conexão com InfluxDB:', errorMessage);
        influxConnectionStatus.connected = false;
        influxConnectionStatus.error = errorMessage;
        
        // Se a conexão falhou e não há um intervalo de reconexão, inicia um
        if (!reconnectInterval) {
            console.log('🔄 [INFLUX-SERVICE] A agendar tentativas de reconexão a cada 60 segundos...');
            reconnectInterval = setInterval(checkInfluxConnection, 60000); // Tenta a cada 60 segundos
        }
    }
};

if (influxUrl && influxToken && influxOrg && influxBucket) {
    // [NOVO] Aumenta o timeout padrão de 10s para 30s para dar mais tempo ao InfluxDB responder sob carga.
    const influxDB = new InfluxDB({
        url: influxUrl,
        token: influxToken,
        transportOptions: { timeout: 30000 }
    });
    queryApi = influxDB.getQueryApi(influxOrg);
    checkInfluxConnection(); // Faz a primeira verificação na inicialização
} else {
    console.warn('[INFLUX-SERVICE] Variáveis de ambiente da InfluxDB não configuradas. As métricas não estarão disponíveis.');
    influxConnectionStatus = { connected: false, error: 'Not configured' };
}

module.exports = {
    queryApi,
    influxBucket,
    getInfluxConnectionStatus: () => influxConnectionStatus,
};