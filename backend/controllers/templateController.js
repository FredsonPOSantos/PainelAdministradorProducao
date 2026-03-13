// Ficheiro: controllers/templateController.js
// Descrição: Contém a lógica de negócio para a gestão de templates.

const { pool } = require('../connection'); // Caminho atualizado
const { logAction } = require('../services/auditLogService');

/**
 * @description Cria um novo template.
 */
const createTemplate = async (req, res) => {
  // Adicionado 'prelogin_banner_id' aos campos
  let {
    name,
    base_model,
    login_background_url,
    logo_url,
    status_logo_url, // [NOVO]
    primary_color,
    font_size,
    font_color,
    promo_video_url,
    login_type,
    prelogin_banner_id,
    postlogin_banner_id,
    form_background_color, // [NOVO]
    font_family,           // [NOVO]
    status_title,          // [NOVO]
    status_message,        // [NOVO]
    // [NOVO] Campos de personalização da tela de status
    status_bg_color,
    status_bg_image_url,
    status_h1_font_size,
    status_p_font_size,
    is_system // [NOVO] Campo para definir se é padrão do sistema
  } = req.body;

  if (!name || !base_model || !login_type) {
    return res.status(400).json({ message: 'Nome, modelo base (V1/V2) e tipo de login são obrigatórios.' });
  }
  if (base_model === 'V2' && !promo_video_url) {
    return res.status(400).json({ message: 'URL do vídeo promocional é obrigatória para templates V2.' });
  }

  // Os arquivos enviados vêm de 'req.files' graças ao middleware
  const files = req.files || {};

  // Lógica para decidir qual URL usar:
  // Se um novo arquivo de background foi enviado, use o caminho dele.
  // Senão, use o valor do campo de texto 'login_background_url'.
  if (files.backgroundFile?.[0]) {
    login_background_url = `/uploads/Background_hotspot/${files.backgroundFile[0].filename}`;
  }

  // Mesma lógica para o logo
  if (files.logoFile?.[0]) {
    logo_url = `/uploads/logo_hotspot/${files.logoFile[0].filename}`;
  }

  // [NOVO] Mesma lógica para o logo de status
  if (files.statusLogoFile?.[0]) {
    status_logo_url = `/uploads/logo_hotspot/${files.statusLogoFile[0].filename}`;
  }

  // [NOVO] Mesma lógica para a imagem de fundo de status
  if (files.statusBgFile?.[0]) {
    status_bg_image_url = `/uploads/Background_hotspot/${files.statusBgFile[0].filename}`;
  }

  // [NOVO] Lógica de permissão para is_system (apenas master pode definir)
  let isSystemValue = false;
  if (req.user.role === 'master' && (is_system === 'true' || is_system === true)) {
      isSystemValue = true;
  }

  try {
    const query = `
      INSERT INTO templates (name, base_model, login_background_url, logo_url, primary_color, font_size, font_color, promo_video_url, login_type, prelogin_banner_id, postlogin_banner_id, form_background_color, font_family, status_title, status_message, status_logo_url, status_bg_color, status_bg_image_url, status_h1_font_size, status_p_font_size, is_system)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *;
    `;
    // Usa as variáveis atualizadas que podem conter os caminhos dos novos arquivos
    const values = [name, base_model, login_background_url, logo_url, primary_color, font_size, font_color, promo_video_url, login_type, prelogin_banner_id || null, postlogin_banner_id || null, form_background_color, font_family, status_title, status_message, status_logo_url, status_bg_color, status_bg_image_url, status_h1_font_size, status_p_font_size, isSystemValue];
    const result = await pool.query(query, values);

    await logAction({
      req,
      action: 'TEMPLATE_CREATE',
      status: 'SUCCESS',
      description: `Utilizador "${req.user.email}" criou o template "${result.rows[0].name}".`,
      target_type: 'template',
      target_id: result.rows[0].id
    });

    res.status(201).json({ message: 'Template criado com sucesso!', template: result.rows[0] });
  } catch (error) {
    await logAction({
      req,
      action: 'TEMPLATE_CREATE_FAILURE',
      status: 'FAILURE',
      description: `Falha ao criar template com nome "${name}". Erro: ${error.message}`,
      target_type: 'template',
      details: { error: error.message }
    });

    console.error('Erro ao criar template:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};

/**
 * @description Obtém a lista de todos os templates.
 */
const getAllTemplates = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM templates ORDER BY name ASC');
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar templates:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};

/**
 * @description Atualiza um template existente.
 */
const updateTemplate = async (req, res) => {
  console.log(`[TEMPLATE-UPDATE] 🚀 Recebida requisição PUT para ID: ${req.params.id}`); // [LOG DE DIAGNÓSTICO]

  const id = parseInt(req.params.id, 10); // [CORREÇÃO] Garante que o ID seja um número inteiro
  if (isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido.' });
  }

  // [NOVO] Verificação prévia de existência e permissão de sistema
  const checkResult = await pool.query('SELECT id, is_system FROM templates WHERE id = $1', [id]);
  if (checkResult.rowCount === 0) {
      console.warn(`[TEMPLATE-UPDATE] ❌ Erro 404: O template ID ${id} não foi encontrado na tabela 'templates' (SELECT inicial).`); 
      return res.status(404).json({ message: 'Template não encontrado.' });
  }
  const currentIsSystem = checkResult.rows[0].is_system;

  if (currentIsSystem && req.user.role !== 'master') {
      return res.status(403).json({ message: 'Este é um template padrão do sistema e não pode ser editado por este utilizador.' });
  }

  // [DIAGNÓSTICO] Ver o corpo da requisição para debugar campos ausentes
  // console.log('[TEMPLATE-UPDATE] Body recebido:', req.body);
  
  let {
    name,
    base_model,
    login_background_url,
    logo_url,
    logoUrl, // [CORREÇÃO] Captura o campo camelCase enviado pelo frontend
    status_logo_url, // [NOVO]
    primary_color,
    font_size,
    font_color,
    promo_video_url,
    login_type,
    prelogin_banner_id,
    postlogin_banner_id,
    form_background_color, // [NOVO]
    font_family,           // [NOVO]
    status_title,          // [NOVO]
    status_message,        // [NOVO]
    // [NOVO] Campos de personalização da tela de status
    status_bg_color,
    status_bg_image_url,
    status_h1_font_size,
    status_p_font_size,
    is_system // [NOVO]
  } = req.body;

  // [NOVO] Lógica para atualização de is_system (mantém o atual se não enviado)
  let newIsSystem = currentIsSystem;
  if (req.user.role === 'master' && is_system !== undefined) {
      newIsSystem = (is_system === 'true' || is_system === true);
  }

  // [CORREÇÃO] Fallback para logo_url se vier como logoUrl
  if (!logo_url && logoUrl) {
      logo_url = logoUrl;
  }

  // Os arquivos enviados vêm de 'req.files'
  const files = req.files || {};

  // Lógica para decidir qual URL usar:
  // Se um novo arquivo de background foi enviado, use o caminho dele.
  // Senão, use o valor do campo de texto 'login_background_url' (para manter a URL externa ou a antiga).
  if (files.backgroundFile?.[0]) {
    login_background_url = `/uploads/Background_hotspot/${files.backgroundFile[0].filename}`;
  }

  // Mesma lógica para o logo
  if (files.logoFile?.[0]) {
    logo_url = `/uploads/logo_hotspot/${files.logoFile[0].filename}`;
  }

  // [NOVO] Mesma lógica para o logo de status
  if (files.statusLogoFile?.[0]) {
    status_logo_url = `/uploads/logo_hotspot/${files.statusLogoFile[0].filename}`;
  }

  // [NOVO] Mesma lógica para a imagem de fundo de status
  if (files.statusBgFile?.[0]) {
    status_bg_image_url = `/uploads/Background_hotspot/${files.statusBgFile[0].filename}`;
  }

  try {
    // [CORREÇÃO] Construção dinâmica da query para evitar erros de índice ($1, $2...)
    const fields = [];
    const values = [];
    let idx = 1;

    const addField = (col, val) => {
        fields.push(`${col} = $${idx++}`);
        values.push(val);
    };

    addField('name', name);
    addField('base_model', base_model);
    addField('login_background_url', login_background_url);
    addField('logo_url', logo_url);
    addField('primary_color', primary_color);
    addField('font_size', font_size);
    addField('font_color', font_color);
    addField('promo_video_url', promo_video_url);
    addField('login_type', login_type);
    addField('prelogin_banner_id', prelogin_banner_id || null);
    addField('postlogin_banner_id', postlogin_banner_id || null);
    addField('form_background_color', form_background_color || null);
    addField('font_family', font_family || null);
    addField('status_title', status_title || null);
    addField('status_message', status_message || null);
    addField('status_logo_url', status_logo_url || null);
    addField('status_bg_color', status_bg_color || null);
    addField('status_bg_image_url', status_bg_image_url || null);
    addField('status_h1_font_size', status_h1_font_size || null);
    addField('status_p_font_size', status_p_font_size || null);
    addField('is_system', newIsSystem);

    // Adiciona o ID para o WHERE
    values.push(id);
    const query = `UPDATE templates SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;

    console.log(`[TEMPLATE-UPDATE] Executando Query: UPDATE templates SET ... WHERE id = ${id}`); // [LOG]

    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      console.warn(`[TEMPLATE-UPDATE] ❌ Erro 404: O comando UPDATE rodou mas retornou 0 linhas para o ID ${id}.`);
      return res.status(404).json({ message: 'Template não encontrado.' });
    }

    await logAction({
      req,
      action: 'TEMPLATE_UPDATE',
      status: 'SUCCESS',
      description: `Utilizador "${req.user.email}" atualizou o template "${result.rows[0].name}".`,
      target_type: 'template',
      target_id: id
    });

    res.json({ message: 'Template atualizado com sucesso!', template: result.rows[0] });
  } catch (error) {
    await logAction({
      req,
      action: 'TEMPLATE_UPDATE_FAILURE',
      status: 'FAILURE',
      description: `Falha ao atualizar template com ID "${id}". Erro: ${error.message}`,
      target_type: 'template',
      target_id: id,
      details: { error: error.message }
    });

    console.error('Erro ao atualizar template:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};

/**
 * @description Elimina um template.
 */
const deleteTemplate = async (req, res) => {
  const { id } = req.params;
  try {
    // [NOVO] Verifica se é um template de sistema
    const checkSystem = await pool.query('SELECT is_system FROM templates WHERE id = $1', [id]);
    if (checkSystem.rows.length > 0 && checkSystem.rows[0].is_system) {
        // Apenas master pode excluir templates de sistema
        if (req.user.role !== 'master') {
            return res.status(403).json({ message: 'Este é um template padrão do sistema e não pode ser excluído.' });
        }
    }

    const checkUsageQuery = 'SELECT id FROM campaigns WHERE template_id = $1';
    const usageResult = await pool.query(checkUsageQuery, [id]);
    if (usageResult.rowCount > 0) {
      return res.status(409).json({ message: 'Não é possível eliminar este template, pois está a ser utilizado por uma ou mais campanhas.' });
    }
    const result = await pool.query('DELETE FROM templates WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Template não encontrado.' });
    }

    await logAction({
      req,
      action: 'TEMPLATE_DELETE',
      status: 'SUCCESS',
      description: `Utilizador "${req.user.email}" eliminou o template com ID ${id}.`,
      target_type: 'template',
      target_id: id
    });

    res.json({ message: 'Template eliminado com sucesso.' });
  } catch (error) {
    await logAction({
      req,
      action: 'TEMPLATE_DELETE_FAILURE',
      status: 'FAILURE',
      description: `Falha ao eliminar template com ID "${id}". Erro: ${error.message}`,
      target_type: 'template',
      target_id: id,
      details: { error: error.message }
    });

    console.error('Erro ao eliminar template:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};

module.exports = {
  createTemplate,
  getAllTemplates,
  updateTemplate,
  deleteTemplate,
};
