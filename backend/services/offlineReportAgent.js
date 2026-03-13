// Ficheiro: backend/services/offlineReportAgent.js
const { pool } = require('../connection');
const { sendEmail } = require('../emailService');
const { sendTelegramMessage } = require('./telegramService');

let reportInterval = null;

const checkAndSendReport = async () => {
    try {
        // 1. Obter configurações
        const settingsRes = await pool.query('SELECT offline_report_emails, offline_report_schedule, telegram_bot_token, telegram_chat_id FROM system_settings WHERE id = 1');
        if (settingsRes.rows.length === 0) return;
        
        const { offline_report_emails, telegram_bot_token, telegram_chat_id, offline_report_schedule } = settingsRes.rows[0];
        
        // Se não houver destinatários configurados, aborta
        if ((!offline_report_emails && !telegram_chat_id) || !offline_report_schedule) {
            // console.log('[OFFLINE-REPORT] Nenhum destinatário configurado. Pulando.');
            return;
        }

        // 2. Buscar roteadores offline há mais de 24 horas
        // Consideramos offline se status='offline' e last_seen for anterior a 24h atrás (ou nulo se nunca visto, opcional)
        const offlineRoutersRes = await pool.query(`
            SELECT name, ip_address, last_seen, observacao 
            FROM routers 
            WHERE status = 'offline' 
            AND (last_seen < NOW() - INTERVAL '24 hours' OR last_seen IS NULL)
            ORDER BY name ASC
        `);

        const routers = offlineRoutersRes.rows;

        if (routers.length === 0) {
            console.log('[OFFLINE-REPORT] Nenhum roteador offline há mais de 24h.');
            return;
        }

        console.log(`[OFFLINE-REPORT] Encontrados ${routers.length} roteadores críticos.`);

        // 3. Formatar Mensagem (Texto simples para Telegram, HTML para Email)
        const now = new Date().toLocaleString('pt-BR');
        
        // Telegram Message
        let telegramMsg = `🚨 <b>Relatório de Roteadores Críticos</b> 🚨\n\n`;
        telegramMsg += `📅 ${now}\n`;
        telegramMsg += `Os seguintes roteadores estão offline há mais de 24h:\n\n`;
        
        routers.forEach(r => {
            const lastSeen = r.last_seen ? new Date(r.last_seen).toLocaleString('pt-BR') : 'Nunca';
            telegramMsg += `🔴 <b>${r.name}</b> (${r.ip_address || 'Sem IP'})\n`;
            telegramMsg += `   Visto em: ${lastSeen}\n`;
            if (r.observacao) telegramMsg += `   Obs: ${r.observacao}\n`;
            telegramMsg += `\n`;
        });

        // Email HTML
        let emailHtml = `<h2>Relatório de Roteadores Offline (>24h)</h2>`;
        emailHtml += `<p>Gerado em: ${now}</p>`;
        emailHtml += `<table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%;">`;
        emailHtml += `<tr style="background-color: #f2f2f2;"><th>Nome</th><th>IP</th><th>Visto por Último</th><th>Observação</th></tr>`;
        
        routers.forEach(r => {
            const lastSeen = r.last_seen ? new Date(r.last_seen).toLocaleString('pt-BR') : 'Nunca';
            emailHtml += `<tr><td>${r.name}</td><td>${r.ip_address || '-'}</td><td>${lastSeen}</td><td>${r.observacao || '-'}</td></tr>`;
        });
        emailHtml += `</table>`;

        // 4. Enviar
        // Telegram
        if (telegram_bot_token && telegram_chat_id) {
            await sendTelegramMessage(telegram_bot_token, telegram_chat_id, telegramMsg);
        }

        // Email
        if (offline_report_emails) {
            // [CORREÇÃO] Envia para todos os destinatários de uma só vez (separados por vírgula)
            // Isso evita que o servidor SMTP bloqueie envios sequenciais rápidos ou que o loop falhe.
            const recipients = offline_report_emails.split(',').map(e => e.trim()).filter(e => e).join(', ');
            if (recipients) {
                await sendEmail(recipients, `[ALERTA] Roteadores Offline - ${now}`, emailHtml);
            }
        }

    } catch (error) {
        console.error('[OFFLINE-REPORT] Erro ao gerar relatório:', error);
    }
};

const startReportScheduler = async () => {
    // [MODIFICADO] Busca o agendamento do DB ao iniciar
    let scheduleHours = [8, 14]; // Padrão
    try {
        const settingsRes = await pool.query('SELECT offline_report_schedule FROM system_settings WHERE id = 1');
        if (settingsRes.rows.length > 0 && settingsRes.rows[0].offline_report_schedule) {
            scheduleHours = settingsRes.rows[0].offline_report_schedule.split(',').map(h => parseInt(h.trim(), 10)).filter(h => !isNaN(h));
        }
    } catch (e) {
        console.error('[SCHEDULER] Erro ao buscar agendamento inicial:', e.message);
    }

    // Verifica a cada minuto
    reportInterval = setInterval(() => {
        const now = new Date();
        // [MODIFICADO] Executa nas horas definidas no banco de dados
        if (scheduleHours.includes(now.getHours()) && now.getMinutes() === 0) {
            console.log('[SCHEDULER] Iniciando geração de relatório offline agendado...');
            checkAndSendReport();
        }
    }, 60000); // 60 segundos
    console.log(`✅ [SCHEDULER] Agente de relatórios offline iniciado. Horários: [${scheduleHours.join(', ')}]:00.`);
};

module.exports = { startReportScheduler };