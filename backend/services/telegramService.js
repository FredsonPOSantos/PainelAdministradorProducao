// Ficheiro: backend/services/telegramService.js
const https = require('https');

/**
 * Envia uma mensagem para o Telegram.
 * @param {string} token - O Token do Bot.
 * @param {string} chatId - O ID do chat de destino.
 * @param {string} message - A mensagem a ser enviada.
 */
const sendTelegramMessage = (token, chatId, message) => {
    return new Promise((resolve, reject) => {
        if (!token || !chatId) {
            console.warn('[TELEGRAM] Token ou Chat ID não configurados.');
            return resolve(false);
        }

        const data = JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML' // Permite formatação básica
        });

        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        }, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(true);
            } else {
                console.error(`[TELEGRAM] Erro ao enviar mensagem. Status: ${res.statusCode}`);
                resolve(false);
            }
        });

        req.on('error', (error) => {
            console.error('[TELEGRAM] Erro de rede:', error);
            resolve(false); // Resolve como false para não quebrar o fluxo
        });

        req.write(data);
        req.end();
    });
};

module.exports = { sendTelegramMessage };