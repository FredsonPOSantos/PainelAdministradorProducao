// Ficheiro: backend/controllers/profileController.js
const { pool } = require('../connection');
const bcrypt = require('bcrypt');
const { logAction } = require('../services/auditLogService');
const fs = require('fs');
const path = require('path');

// Obter dados do perfil do utilizador logado
const getProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        // [CORRIGIDO] A query foi expandida para incluir todos os campos necessários pelo frontend,
        // como 'must_change_password', para lidar com o fluxo de troca de senha obrigatória.
        const query = `
            SELECT 
                id, email, role, nome_completo as name, phone, sector, avatar_url, theme_preference,
                is_active, matricula, cpf, must_change_password, nome_completo
            FROM admin_users 
            WHERE id = $1
        `;
        const result = await pool.query(query, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Utilizador não encontrado.' });
        }

        const userProfile = result.rows[0];

        // [CRÍTICO] Anexa o objeto de permissões completo, que é essencial para o frontend renderizar a UI.
        userProfile.permissions = req.user.permissions;

        res.json({ success: true, data: userProfile });
    } catch (error) {
        console.error('Erro ao buscar perfil:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
};

// Atualizar dados básicos (Nome, Telefone, Setor)
const updateProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { name, phone, sector } = req.body;

        const query = `
            UPDATE admin_users 
            SET nome_completo = $1, phone = $2, sector = $3 
            WHERE id = $4 
            RETURNING nome_completo, phone, sector
        `;
        const result = await pool.query(query, [name, phone, sector, userId]);

        await logAction({
            req,
            action: 'PROFILE_UPDATE',
            status: 'SUCCESS',
            description: `Utilizador atualizou o seu próprio perfil.`,
            target_type: 'user',
            target_id: userId
        });

        res.json({ success: true, message: 'Perfil atualizado com sucesso.', data: result.rows[0] });
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        res.status(500).json({ success: false, message: 'Erro ao atualizar perfil.' });
    }
};

// Atualizar preferência de tema
const updateTheme = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { theme } = req.body;

        if (!theme) return res.status(400).json({ success: false, message: 'Tema não fornecido.' });

        await pool.query('UPDATE admin_users SET theme_preference = $1 WHERE id = $2', [theme, userId]);

        res.json({ success: true, message: 'Tema atualizado.' });
    } catch (error) {
        console.error('Erro ao atualizar tema:', error);
        res.status(500).json({ success: false, message: 'Erro ao salvar tema.' });
    }
};

// Alterar a própria senha
const changePassword = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { currentPassword, newPassword } = req.body;

        // 1. Buscar senha atual (hash)
        const userResult = await pool.query('SELECT password FROM admin_users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Utilizador não encontrado.' });

        const currentHash = userResult.rows[0].password;

        // 2. Verificar se a senha atual está correta
        const match = await bcrypt.compare(currentPassword, currentHash);
        if (!match) {
            return res.status(401).json({ success: false, message: 'A senha atual está incorreta.' });
        }

        // 3. Validar nova senha
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'A nova senha deve ter pelo menos 6 caracteres.' });
        }

        // 4. Hash e salvar nova senha
        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(newPassword, salt);

        await pool.query('UPDATE admin_users SET password = $1, must_change_password = false WHERE id = $2', [newHash, userId]);

        await logAction({
            req,
            action: 'PASSWORD_CHANGE_SELF',
            status: 'SUCCESS',
            description: `Utilizador alterou a sua própria senha.`,
            target_type: 'user',
            target_id: userId
        });

        res.json({ success: true, message: 'Senha alterada com sucesso.' });
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao alterar senha.' });
    }
};

// Upload de Avatar
const uploadAvatar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Nenhum ficheiro enviado.' });
        }

        const userId = req.user.userId;
        // Caminho relativo para salvar no banco (acessível via express.static)
        const avatarUrl = `/uploads/avatars/${req.file.filename}`;

        // Buscar avatar antigo para apagar (opcional, para limpeza)
        const oldAvatarResult = await pool.query('SELECT avatar_url FROM admin_users WHERE id = $1', [userId]);
        const oldAvatarUrl = oldAvatarResult.rows[0]?.avatar_url;

        // Atualizar banco
        await pool.query('UPDATE admin_users SET avatar_url = $1 WHERE id = $2', [avatarUrl, userId]);

        // Tenta apagar o ficheiro antigo se existir e não for o padrão
        if (oldAvatarUrl && oldAvatarUrl.startsWith('/uploads/avatars/')) {
            const oldPath = path.join(__dirname, '..', oldAvatarUrl);
            if (fs.existsSync(oldPath) && oldAvatarUrl !== avatarUrl) {
                try { fs.unlinkSync(oldPath); } catch (e) { console.warn('Falha ao apagar avatar antigo:', e.message); }
            }
        }

        res.json({ success: true, message: 'Avatar atualizado.', data: { avatar_url: avatarUrl } });
    } catch (error) {
        console.error('Erro no upload de avatar:', error);
        res.status(500).json({ success: false, message: 'Erro ao processar upload.' });
    }
};

// [NOVO] Salvar Expo Push Token do dispositivo móvel
const savePushToken = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { token } = req.body;
        
        await pool.query('UPDATE admin_users SET expo_push_token = $1 WHERE id = $2', [token, userId]);
        res.json({ success: true, message: 'Push token salvo com sucesso.' });
    } catch (error) {
        console.error('Erro ao salvar push token:', error);
        res.status(500).json({ success: false, message: 'Erro ao salvar token.' });
    }
};

module.exports = { getProfile, updateProfile, updateTheme, changePassword, uploadAvatar, savePushToken };
