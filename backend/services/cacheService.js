// Ficheiro: backend/services/cacheService.js
const redis = require('redis');

let client;
let isRedisAvailable = false;
const memoryCache = new Map(); // Fallback em memória

// [CORRIGIDO] Apenas tenta conectar ao Redis se a variável REDIS_URL estiver definida no ficheiro .env.
// Se não estiver, usa diretamente o cache em memória sem gerar avisos de falha de conexão.
if (process.env.REDIS_URL) {
    (async () => {
        try {
            client = redis.createClient({
                url: process.env.REDIS_URL,
                socket: {
                    reconnectStrategy: (retries) => {
                        if (retries > 3) {
                            console.warn('⚠️ [REDIS] Desistindo de reconectar após 3 tentativas. Usando cache em memória.');
                            return new Error('Redis connection failed');
                        }
                        return Math.min(retries * 100, 3000);
                    }
                }
            });
    
            client.on('error', (err) => {
                // Suprime logs excessivos de conexão recusada se já sabemos que falhou
                if (!isRedisAvailable && (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET')) return;
                console.error('❌ [REDIS] Erro no cliente Redis:', err.message);
                isRedisAvailable = false;
            });
    
            client.on('connect', () => {
                console.log('✅ [REDIS] Conectado ao Redis');
                isRedisAvailable = true;
            });
    
            // [DIAGNÓSTICO] Mostra onde está a tentar conectar (mascara a senha por segurança)
            const maskedUrl = process.env.REDIS_URL.replace(/:\/\/(.*)@/, '://****@');
            console.log(`ℹ️ [REDIS] Iniciando conexão com: ${maskedUrl}`);

            await client.connect();
        } catch (e) {
            console.warn('⚠️ [REDIS] Não foi possível conectar. Usando cache em memória (fallback).');
            isRedisAvailable = false;
        }
    })();
} else {
    // Informa que o cache em memória está sendo usado por padrão.
    console.log('ℹ️ [CACHE] REDIS_URL não definida no .env. O sistema usará o cache em memória.');
}

const get = async (key) => {
    if (isRedisAvailable && client) {
        try {
            const data = await client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error(`[REDIS] Erro ao obter chave ${key}:`, e);
            // [MELHORIA] Log explícito de fallback em caso de erro na operação
            console.warn(`[CACHE] Fallback para cache em memória ao obter a chave: ${key}`);
        }
    }
    // Fallback: Memória
    const cached = memoryCache.get(key);
    return (cached && cached.expiry > Date.now()) ? cached.value : null;
};

const set = async (key, value, durationSeconds = 300) => {
    if (isRedisAvailable && client) {
        try {
            await client.set(key, JSON.stringify(value), { EX: durationSeconds });
            return; // Sai após sucesso no Redis
        } catch (e) {
            console.error(`[REDIS] Erro ao definir chave ${key}:`, e);
            // [MELHORIA] Log explícito de fallback em caso de erro na operação
            console.warn(`[CACHE] Fallback para cache em memória ao definir a chave: ${key}`);
        }
    } else {
        // Fallback: Memória
        memoryCache.set(key, { value, expiry: Date.now() + (durationSeconds * 1000) });
    }
};

/**
 * [NOVO] Remove uma chave específica do cache.
 * @param {string} key - A chave a ser removida.
 */
const del = async (key) => {
    if (isRedisAvailable && client) {
        try {
            await client.del(key);
        } catch (e) {
            console.error(`[REDIS] Erro ao remover chave ${key}:`, e);
        }
    }
    // Remove também do cache em memória
    memoryCache.delete(key);
};

module.exports = { get, set, del };