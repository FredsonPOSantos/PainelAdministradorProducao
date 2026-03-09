// Ficheiro: controllers/adminController.js
// [VERSÃO 4 - ESTÁVEL]
// Esta é a versão original do seu controller, ANTES da implementação do menu inteligente.
// Ela NÃO envia 'profile.permissions' para o frontend.
const { pool } = require('../connection');
const bcrypt = require('bcrypt');
const { getPermissionsForRole } = require('./permissionsController');
const { logAction } = require('../services/auditLogService');
const { validateEmail } = require('../services/emailValidatorService'); // [NOVO]

// Função para obter o perfil do utilizador logado
const getUserProfile = async (req, res) => {
  // O req.user vem do authMiddleware (verifyToken)
  try {
    const profileQuery = await pool.query(
      'SELECT id, email, role, is_active, setor, matricula, cpf, must_change_password, nome_completo, nome_completo as name, avatar_url, theme_preference, phone FROM admin_users WHERE id = $1',
      [req.user.userId]
    );

    if (profileQuery.rows.length === 0) {
      return res.status(404).json({ message: "Perfil do utilizador não encontrado." });
    }

    const userProfile = profileQuery.rows[0];
    // [CORREÇÃO] Em vez de recalcular as permissões com uma função incompleta,
    // usamos o objeto de permissões completo que já foi calculado pelo middleware de autenticação (req.user).
    userProfile.permissions = req.user.permissions;

    res.json({
      success: true,
      data: userProfile
    });

  } catch (error) {
    console.error('Erro ao buscar perfil completo:', error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// Função para aceder ao dashboard de master
const getMasterDashboard = (req, res) => {
  res.json({ message: `Bem-vindo ao Dashboard, Mestre ${req.user.email}!` });
};

// Função para listar todos os utilizadores do painel de administração
const getAllAdminUsers = async (req, res) => {
  const requestingUserRole = req.user.role; // 'master', 'gestao', ou 'DPO'

  try {
    let query;
    if (requestingUserRole === 'master' || requestingUserRole === 'DPO') {
      query = 'SELECT id, email, role, is_active, setor, matricula, cpf, must_change_password, nome_completo FROM admin_users ORDER BY id ASC';
    } 
    else if (requestingUserRole === 'gestao') {
      query = 'SELECT id, email, role, is_active, must_change_password, nome_completo FROM admin_users ORDER BY id ASC';
    } 
    else {
      return res.json([]);
    }

    const allUsers = await pool.query(query);
    res.json(allUsers.rows);

  } catch (error) {
    console.error('Erro ao listar utilizadores:', error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// Função para criar um novo utilizador do painel de administração
const createAdminUser = async (req, res) => {
  const { email, password, role, setor, matricula, cpf, nome_completo } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ message: "Campos (email, password, role) são obrigatórios." });
  }

  // [CORRIGIDO] Validação dinâmica de roles consultando a base de dados
  const roleCheck = await pool.query('SELECT 1 FROM roles WHERE slug = $1', [role]);
  if (roleCheck.rowCount === 0) {
      return res.status(400).json({ message: "A função (role) fornecida é inválida." });
  }

  // [NOVO] Validação de e-mail (Regex + MX)
  const emailValidation = await validateEmail(email);
  if (!emailValidation.isValid) {
      return res.status(400).json({ message: emailValidation.reason });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await pool.query(
      'INSERT INTO admin_users (email, password_hash, role, setor, matricula, cpf, nome_completo) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, email, role, nome_completo',
      [email, passwordHash, role, setor || null, matricula || null, cpf || null, nome_completo || null]
    );

    // Log de auditoria
    await logAction({
      req,
      action: 'USER_CREATE',
      status: 'SUCCESS',
      description: `Utilizador "${req.user.email}" criou o novo utilizador "${newUser.rows[0].email}" (ID: ${newUser.rows[0].id}).`,
      target_type: 'user',
      target_id: newUser.rows[0].id
    });

    res.status(201).json({
      message: "Utilizador criado com sucesso!",
      user: newUser.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: "O e-mail fornecido já está em uso." });
    }
    // Log de falha
    await logAction({
      req,
      action: 'USER_CREATE_FAILURE',
      status: 'FAILURE',
      description: `Falha ao criar utilizador com email "${email}". Erro: ${error.message}`,
      target_type: 'user',
      details: { error: error.message }
    });
    console.error('Erro ao criar utilizador:', error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// Função para atualizar um utilizador
const updateUser = async (req, res) => {
  const { id } = req.params; 
  const requestingUserRole = req.user.role;
  const { email, role, is_active, setor, matricula, cpf, nome_completo } = req.body;

  if (id === '1' && (is_active === false || (role && role !== 'master'))) {
    return res.status(403).json({ message: "O utilizador master principal não pode ser desativado ou ter sua função alterada." });
  }
  // [NOVO] Adiciona proteção para não alterar o e-mail do utilizador master
  if (id === '1' && email) {
    return res.status(403).json({ message: "O e-mail do utilizador master principal não pode ser alterado." });
  }

  if (id === '1' && requestingUserRole === 'gestao') {
     return res.status(403).json({ message: "Acesso negado. Apenas o 'master' pode editar o 'master'."});
  }

  const fields = [];
  const values = [];
  let queryIndex = 1;

  // [NOVO] Adiciona o campo de e-mail à lógica de atualização
  if (email !== undefined) {
      // [NOVO] Validação de e-mail se for alterado
      const emailValidation = await validateEmail(email);
      if (!emailValidation.isValid) {
          return res.status(400).json({ message: emailValidation.reason });
      }
      fields.push(`email = $${queryIndex++}`);
      values.push(email);
  }

  if (nome_completo !== undefined) {
      fields.push(`nome_completo = $${queryIndex++}`);
      values.push(nome_completo);
  }

  if (requestingUserRole === 'master') {
    if (role !== undefined) {
      const roleCheck = await pool.query('SELECT 1 FROM roles WHERE slug = $1', [role]);
      if (roleCheck.rowCount === 0) return res.status(400).json({ message: "Função inválida." });
      fields.push(`role = $${queryIndex++}`);
      values.push(role);
    }
    if (setor !== undefined) {
      fields.push(`setor = $${queryIndex++}`);
      values.push(setor);
    }
    if (matricula !== undefined) {
      fields.push(`matricula = $${queryIndex++}`);
      values.push(matricula);
    }
    if (cpf !== undefined) {
      fields.push(`cpf = $${queryIndex++}`);
      values.push(cpf);
    }
  } 
  else if (requestingUserRole === 'gestao') {
    if (role !== undefined) {
      if (role === 'master') {
         return res.status(403).json({ message: "Apenas 'master' pode promover outros a 'master'."});
      }
      const roleCheck = await pool.query('SELECT 1 FROM roles WHERE slug = $1', [role]);
      if (roleCheck.rowCount === 0) return res.status(400).json({ message: "Função inválida." });
      fields.push(`role = $${queryIndex++}`);
      values.push(role);
    }
  }
  
  if (is_active !== undefined) {
    fields.push(`is_active = $${queryIndex++}`);
    values.push(is_active);
  }

  if (fields.length === 0) {
    return res.status(400).json({ message: "Nenhum campo para atualizar foi fornecido ou permitido." });
  }

  values.push(id); 

  try {
    const updateQuery = `UPDATE admin_users SET ${fields.join(', ')} WHERE id = $${queryIndex} RETURNING id, email, role, is_active, setor, matricula, cpf, must_change_password, nome_completo`;
    const updatedUser = await pool.query(updateQuery, values);

    if (updatedUser.rows.length === 0) {
      return res.status(404).json({ message: "Utilizador não encontrado." });
    }

    if (requestingUserRole === 'gestao') {
      delete updatedUser.rows[0].setor;
      delete updatedUser.rows[0].matricula;
      delete updatedUser.rows[0].cpf;
    }

    // Log de auditoria
    await logAction({
      req,
      action: 'USER_UPDATE',
      status: 'SUCCESS',
      description: `Utilizador "${req.user.email}" atualizou o utilizador "${updatedUser.rows[0].email}" (ID: ${id}).`,
      target_type: 'user',
      target_id: id
    });

    res.status(200).json({
      message: "Utilizador atualizado com sucesso!",
      user: updatedUser.rows[0],
    });
  } catch (error) {
    // Log de falha
    await logAction({
      req,
      action: 'USER_UPDATE_FAILURE',
      status: 'FAILURE',
      description: `Falha ao atualizar utilizador com ID ${id}. Erro: ${error.message}`,
      target_type: 'user',
      target_id: id,
      details: { error: error.message }
    });

    // [NOVO] Tratamento de erro para e-mail duplicado
    if (error.code === '23505' && error.constraint === 'admin_users_email_key') {
        return res.status(409).json({ message: "O e-mail fornecido já está em uso por outro utilizador." });
    }

    console.error('Erro ao atualizar utilizador:', error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// Função para 'master' e 'gestao' resetarem senhas
const resetUserPassword = async (req, res) => {
  const { id } = req.params; 
  const { newPassword } = req.body;
  const requestingUserId = req.user.userId;

  if (!newPassword || newPassword.length < 6) {
     return res.status(400).json({ message: "A nova senha é obrigatória e deve ter pelo menos 6 caracteres." });
  }

  if (id === '1') {
     return res.status(403).json({ message: "Não é permitido resetar a senha do utilizador master por esta rota." });
  }
  
  if (id === requestingUserId.toString()) {
     return res.status(403).json({ message: "Utilize a página 'Meu Perfil' para alterar a sua própria senha." });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    const result = await pool.query(
      'UPDATE admin_users SET password_hash = $1, must_change_password = true WHERE id = $2',
      [passwordHash, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Utilizador não encontrado." });
    }
    
    // Log de auditoria
    await logAction({
      req,
      action: 'USER_PASSWORD_RESET',
      status: 'SUCCESS',
      description: `Utilizador "${req.user.email}" resetou a senha do utilizador com ID ${id}.`,
      target_type: 'user',
      target_id: id
    });

    res.status(200).json({ message: "Senha do utilizador resetada com sucesso." });
    
  } catch (error) {
    console.error('Erro ao resetar senha:', error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};


// Função para o *próprio* utilizador alterar a senha
const changeOwnPassword = async (req, res) => {
  const userId = req.user.userId;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Senha atual e nova senha são obrigatórias." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: "A nova senha deve ter pelo menos 6 caracteres." });
  }

  try {
    const userQuery = await pool.query('SELECT password_hash FROM admin_users WHERE id = $1', [userId]);
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ message: "Utilizador não encontrado." });
    }
    const user = userQuery.rows[0];

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "A 'Senha Temporária' está incorreta." });
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    await pool.query(
      'UPDATE admin_users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [newPasswordHash, userId]
    );

    // Log de auditoria
    await logAction({
      req,
      action: 'USER_PASSWORD_CHANGE',
      status: 'SUCCESS',
      description: `Utilizador "${req.user.email}" alterou a sua própria senha com sucesso.`,
      target_type: 'user',
      target_id: userId
    });

    res.status(200).json({ message: "Senha alterada com sucesso." });

  } catch (error) {
    console.error('Erro ao alterar a própria senha:', error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// [NOVO] Obter permissões individuais de um utilizador
const getUserPermissions = async (req, res) => {
    const { id } = req.params;
    try {
        // Busca permissões individuais
        const userPerms = await pool.query('SELECT permission_key, is_granted FROM user_permissions WHERE user_id = $1', [id]);
        
        // Busca a role do utilizador para referência no frontend
        const userRole = await pool.query('SELECT role FROM admin_users WHERE id = $1', [id]);
        
        if (userRole.rows.length === 0) return res.status(404).json({ message: "Utilizador não encontrado." });

        res.json({
            success: true,
            role: userRole.rows[0].role,
            individual_permissions: userPerms.rows
        });
    } catch (error) {
        console.error('Erro ao buscar permissões do utilizador:', error);
        res.status(500).json({ message: "Erro interno." });
    }
};

// [NOVO] Atualizar permissões individuais de um utilizador
const updateUserPermissions = async (req, res) => {
    const { id } = req.params;
    const { permissions } = req.body; // Array de { key: '...', value: true/false/null }
    // null significa remover a entrada (voltar ao padrão da role)

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (const perm of permissions) {
            if (perm.value === null) {
                // Remove override (volta ao padrão da role)
                await client.query('DELETE FROM user_permissions WHERE user_id = $1 AND permission_key = $2', [id, perm.key]);
            } else {
                // Adiciona ou atualiza override
                await client.query(`
                    INSERT INTO user_permissions (user_id, permission_key, is_granted)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (user_id, permission_key) 
                    DO UPDATE SET is_granted = $3
                `, [id, perm.key, perm.value]);
            }
        }

        await client.query('COMMIT');
        
        await logAction({ req, action: 'USER_PERMISSIONS_UPDATE', status: 'SUCCESS', target_type: 'user', target_id: id, description: `Permissões individuais atualizadas para o utilizador ID ${id}.` });
        
        res.json({ success: true, message: "Permissões atualizadas com sucesso." });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao atualizar permissões do utilizador:', error);
        res.status(500).json({ message: "Erro interno." });
    } finally {
        client.release();
    }
};

// Função para eliminar um utilizador (Apenas 'master')
const deleteUser = async (req, res) => {
    const { id } = req.params;

    if (id === '1') {
        return res.status(403).json({ message: "O utilizador master principal não pode ser eliminado." });
    }

    const client = await pool.connect(); // Get a client for the transaction

    try {
        await client.query('BEGIN');

        // 1. Get user email for logging before deletion
        const userToDeleteQuery = await client.query('SELECT email FROM admin_users WHERE id = $1', [id]);
        if (userToDeleteQuery.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Utilizador não encontrado." });
        }
        const userEmailToDelete = userToDeleteQuery.rows[0].email;

        // 2. Nullify references in other tables
        await client.query('UPDATE tickets SET created_by_user_id = NULL WHERE created_by_user_id = $1', [id]);
        await client.query('UPDATE tickets SET assigned_to_user_id = NULL WHERE assigned_to_user_id = $1', [id]);
        await client.query('UPDATE ticket_messages SET user_id = NULL WHERE user_id = $1', [id]);
        // [CORRIGIDO] Em vez de tentar anular, apaga as notificações do utilizador, pois a coluna user_id não permite nulos.
        await client.query('DELETE FROM notifications WHERE user_id = $1', [id]);
        await client.query('UPDATE raffles SET created_by_user_id = NULL WHERE created_by_user_id = $1', [id]);
        await client.query('UPDATE data_exclusion_requests SET completed_by_user_id = NULL WHERE completed_by_user_id = $1', [id]);
        await client.query('UPDATE audit_logs SET user_id = NULL WHERE user_id = $1', [id]);

        // 3. Now, delete the user
        const result = await client.query('DELETE FROM admin_users WHERE id = $1', [id]);

        // 4. Commit the transaction
        await client.query('COMMIT');

        // 5. Log the action
        await logAction({
            req,
            action: 'USER_DELETE',
            status: 'SUCCESS',
            description: `Utilizador "${req.user.email}" eliminou o utilizador "${userEmailToDelete}" (ID: ${id}).`,
            target_type: 'user',
            target_id: id,
            details: { deleted_user_email: userEmailToDelete }
        });

        res.status(200).json({ message: "Utilizador eliminado com sucesso. As suas referências foram anonimizadas." });

    } catch (error) {
        await client.query('ROLLBACK'); // Rollback on any error
        await logAction({
            req,
            action: 'USER_DELETE_FAILURE',
            status: 'FAILURE',
            description: `Falha ao eliminar utilizador com ID ${id}. Erro: ${error.message}`,
            target_type: 'user',
            target_id: id,
            details: { error: error.message }
        });
        console.error('Erro ao eliminar utilizador:', error);
        res.status(500).json({ message: "Erro interno do servidor." });
    } finally {
        client.release(); // Release the client back to the pool
    }
};


module.exports = {
  getUserProfile,
  getMasterDashboard,
  getAllAdminUsers,
  createAdminUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  changeOwnPassword,
  getUserPermissions,   // [NOVO]
  updateUserPermissions // [NOVO]
};
