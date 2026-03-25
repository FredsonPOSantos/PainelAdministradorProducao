// Ficheiro: backend/controllers/raffleController.js
// Descrição: Lógica de negócio para sorteios, refatorada para ser mais robusta e assíncrona.

const { pool } = require('../connection');
const { logAction } = require('../services/auditLogService');

// Função auxiliar para emitir progresso via Socket.io
const emitProgress = (req, socketId, data) => {
    const io = req.app.get('io');
    if (io && socketId) {
        // Garante que o cliente está numa sala única para não receber progresso de outros
        io.to(socketId).emit('raffle_progress', data);
    } else {
        console.warn(`[RAFFLE] Tentativa de emitir progresso sem IO ou Socket ID. Socket ID: ${socketId}`);
    }
};

// [NOVO] Função auxiliar para gerar número do sorteio
const generateRaffleNumber = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000);
    return `${day}${month}${year}-${hours}${minutes}.${random}`;
};

/**
 * @description Cria um novo sorteio de forma assíncrona com feedback de progresso.
 */
const createRaffleAsync = async (req, res) => {
    const { title, observation, filters, socketId } = req.body;
    const userId = req.user ? req.user.userId : null; // Obtém o ID do utilizador logado

    if (!title || !filters || !socketId) {
        return res.status(400).json({ success: false, message: 'Título, filtros e ID de socket são obrigatórios.' });
    }

    // Responde imediatamente para o frontend não ficar pendurado
    res.status(202).json({ success: true, message: 'Processo de criação de sorteio iniciado.' });

    // --- Inicia o processo em background ---
    try {
        emitProgress(req, socketId, { status: 'Iniciando criação do sorteio...', progress: 10 });

        // 1. Construir a query para buscar participantes
        // [MODIFICADO] Usa DISTINCT ON para evitar e-mails duplicados, selecionando o ID mais recente
        let userQuery = `
            SELECT DISTINCT ON (u.username) u.id
            FROM userdetails u
            LEFT JOIN routers r ON u.router_name = r.name
            WHERE 1=1
        `;
        const queryParams = [];
        let paramIndex = 1;

        // [CORREÇÃO] Filtro de campanha removido da query direta pois não há coluna campaign_id em userdetails.
        // A filtragem por campanha deve ser feita indiretamente (por data/roteador) ou implementada futuramente.
        
        if (filters.router_id) {
            userQuery += ` AND r.id = $${paramIndex++}`;
            queryParams.push(filters.router_id);
        }
        if (filters.start_date) {
            userQuery += ` AND u.created_at >= $${paramIndex++}`;
            queryParams.push(filters.start_date);
        }
        if (filters.end_date) {
            // [CORREÇÃO] Usa casting para DATE para incluir todo o dia final (até 23:59:59)
            userQuery += ` AND u.created_at::date <= $${paramIndex++}`;
            queryParams.push(filters.end_date);
        }
        if (filters.consent_only) {
            userQuery += ` AND u.accepts_marketing = true`; // [CORREÇÃO] Nome da coluna corrigido
        }

        // [NOVO] Filtro para excluir vencedores anteriores
        if (filters.exclude_winners) {
            userQuery += ` AND u.id NOT IN (SELECT winner_id FROM raffles WHERE winner_id IS NOT NULL)`;
        }

        // [NOVO] Ordenação necessária para o DISTINCT ON funcionar e pegar o registo mais recente
        userQuery += ` ORDER BY u.username, u.id DESC`;

        emitProgress(req, socketId, { status: 'Coletando participantes elegíveis...', progress: 30 });
        
        const { rows: participants } = await pool.query(userQuery, queryParams);

        if (participants.length === 0) {
            throw new Error('Nenhum participante encontrado com os filtros aplicados.');
        }

        emitProgress(req, socketId, { status: `${participants.length} participantes encontrados. Salvando dados...`, progress: 60 });

        // 2. Inserir o sorteio e os participantes no banco de dados
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const raffleNumber = generateRaffleNumber();
            const raffleResult = await client.query(
                'INSERT INTO raffles (title, observation, filters, created_by_user_id, raffle_number) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [title, observation, JSON.stringify(filters), userId, raffleNumber]
            );
            const raffleId = raffleResult.rows[0].id;

            // Insere todos os participantes em lote
            const participantValues = participants.map(p => `(${raffleId}, ${p.id})`).join(',');
            if (participantValues) {
                await client.query(`INSERT INTO raffle_participants (raffle_id, user_id) VALUES ${participantValues}`);
            }

            await client.query('COMMIT');
            
            emitProgress(req, socketId, { status: 'Sorteio criado com sucesso!', progress: 100 });

            await logAction({
                req,
                action: 'RAFFLE_CREATE',
                status: 'SUCCESS',
                description: `Utilizador "${req.user.email}" criou o sorteio "${title}" com ${participants.length} participantes.`,
                target_id: raffleId
            });

        } catch (dbError) {
            await client.query('ROLLBACK');
            throw dbError; // Lança o erro para o catch principal
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Erro no processo assíncrono de criação de sorteio:', error);
        emitProgress(req, socketId, { status: 'Erro!', progress: 100, error: error.message });
        await logAction({
            req,
            action: 'RAFFLE_CREATE_FAILURE',
            status: 'FAILURE',
            description: `Falha ao criar sorteio "${title}". Erro: ${error.message}`
        });
    }
};

/**
 * @description Realiza o sorteio de um vencedor de forma assíncrona.
 */
const drawWinnerAsync = async (req, res) => {
    const { id } = req.params;
    const { socketId } = req.body;

    if (!socketId) {
        return res.status(400).json({ success: false, message: 'ID de socket é obrigatório.' });
    }

    res.status(202).json({ success: true, message: 'Processo de sorteio iniciado.' });

    try {
        emitProgress(req, socketId, { status: 'Carregando participantes...', progress: 20 });

        const { rows: participants } = await pool.query(
            'SELECT user_id FROM raffle_participants WHERE raffle_id = $1',
            [id]
        );

        if (participants.length === 0) {
            throw new Error('Este sorteio não tem participantes.');
        }

        emitProgress(req, socketId, { status: `Sorteando um vencedor entre ${participants.length} participantes...`, progress: 60 });

        // Simula um pequeno delay para dar a sensação de "sorteio"
        await new Promise(resolve => setTimeout(resolve, 1500));

        const winnerIndex = Math.floor(Math.random() * participants.length);
        const winnerId = participants[winnerIndex].user_id;

        emitProgress(req, socketId, { status: 'Vencedor selecionado! Atualizando registro...', progress: 90 });

        const winnerDetails = await pool.query('SELECT nome_completo, username as email FROM userdetails WHERE id = $1', [winnerId]);
        const winnerName = winnerDetails.rows[0]?.nome_completo || 'Desconhecido';

        await pool.query(
            'UPDATE raffles SET winner_id = $1, draw_date = NOW() WHERE id = $2',
            [winnerId, id]
        );

        emitProgress(req, socketId, { status: `Parabéns, ${winnerName}!`, progress: 100, winner: winnerName });

        await logAction({
            req,
            action: 'RAFFLE_DRAW',
            status: 'SUCCESS',
            description: `Utilizador "${req.user.email}" sorteou o vencedor para o sorteio ID ${id}. Vencedor: ${winnerName} (ID: ${winnerId})`,
            target_id: id
        });

    } catch (error) {
        console.error(`Erro no processo de sorteio para o ID ${id}:`, error);
        emitProgress(req, socketId, { status: 'Erro!', progress: 100, error: error.message });
        await logAction({
            req,
            action: 'RAFFLE_DRAW_FAILURE',
            status: 'FAILURE',
            description: `Falha ao sortear vencedor para o sorteio ID ${id}. Erro: ${error.message}`,
            target_id: id
        });
    }
};

const getAllRaffles = async (req, res) => {
    try {
        const query = `
            SELECT r.id, r.raffle_number, r.title, r.created_at, r.draw_date, u.nome_completo as winner_name
            FROM raffles r
            LEFT JOIN userdetails u ON r.winner_id = u.id
            ORDER BY r.id DESC
        `;
        const { rows } = await pool.query(query);
        res.json({ success: true, data: rows });
    } catch (error) {
        // [NOVO] Adiciona log detalhado do erro no backend para facilitar a depuração
        console.error("Erro ao buscar a lista de sorteios:", error); // Mantém o log no servidor
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar sorteios.'
        });
    }
};

const getRaffleDetails = async (req, res) => {
    const { id } = req.params;
    try {
        const raffleQuery = 'SELECT * FROM raffles WHERE id = $1';
        // [MODIFICADO] Inclui o campo accepts_marketing na consulta
        const participantsQuery = 'SELECT u.id, u.nome_completo, u.username as email, u.accepts_marketing FROM raffle_participants rp JOIN userdetails u ON rp.user_id = u.id WHERE rp.raffle_id = $1';
        
        const raffleRes = await pool.query(raffleQuery, [id]);
        if (raffleRes.rowCount === 0) return res.status(404).json({ message: 'Sorteio não encontrado.' });

        const participantsRes = await pool.query(participantsQuery, [id]);

        res.json({ success: true, data: { ...raffleRes.rows[0], participants: participantsRes.rows } });
    } catch (error) {
        // [MODIFICADO] Adiciona log detalhado do erro no backend e na resposta da API
        console.error(`Erro ao buscar detalhes do sorteio ID ${id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar detalhes do sorteio.'
        });
    }
};

const deleteRaffle = async (req, res) => {
    const { id } = req.params;
    // A verificação de permissão ('raffles.delete') agora é feita pelo middleware na rota.
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Apaga primeiro os participantes (chave estrangeira)
        await client.query('DELETE FROM raffle_participants WHERE raffle_id = $1', [id]);
        
        // Apaga o sorteio principal
        const result = await client.query('DELETE FROM raffles WHERE id = $1 RETURNING title', [id]);

        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Sorteio não encontrado.' });
        }

        await client.query('COMMIT');

        await logAction({
            req,
            action: 'RAFFLE_DELETE',
            status: 'SUCCESS',
            description: `Utilizador "${req.user.email}" eliminou o sorteio "${result.rows[0].title}" (ID: ${id}).`,
            target_id: id,
            target_type: 'raffle'
        });

        res.json({ success: true, message: 'Sorteio e participantes associados foram removidos com sucesso.' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Erro ao eliminar sorteio ID ${id}:`, error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor ao eliminar o sorteio.' });
    } finally {
        client.release();
    }
};

module.exports = {
    createRaffleAsync,
    drawWinnerAsync,
    getAllRaffles,
    getRaffleDetails,
    deleteRaffle
};