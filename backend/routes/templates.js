// Ficheiro: routes/templates.js
// [VERSÃO 13.6.1 - PERMISSÕES GRANULARES]

const express = require('express');
const router = express.Router();
const templateController = require('../controllers/templateController');
const verifyToken = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');
const uploadMiddlewareHotspot = require('../middlewares/uploadMiddlewareHotspot'); // 1. Importar o novo middleware

// --- Rotas para Templates ---

// Criar um novo template
router.post(
  '/',
  [verifyToken, checkPermission('templates.create'), uploadMiddlewareHotspot], // 2. Aplicar o middleware
  templateController.createTemplate
);

// Listar todos os templates
router.get(
  '/',
  [verifyToken, checkPermission('templates.read')],
  templateController.getAllTemplates
);

// [CORRIGIDO] Atualizar um template
// A rota agora é um POST para que o multer processe o FormData primeiro.
// O method-override (configurado no server.js) irá converter este POST para um PUT
// antes de chegar ao controller, pois o frontend envia o campo _method='PUT'.
router.post(
  '/:id',
  [verifyToken, checkPermission('templates.update'), uploadMiddlewareHotspot],
  templateController.updateTemplate
);

// Eliminar um template
router.delete(
  '/:id',
  [verifyToken, checkPermission('templates.delete')],
  templateController.deleteTemplate
);

module.exports = router;
