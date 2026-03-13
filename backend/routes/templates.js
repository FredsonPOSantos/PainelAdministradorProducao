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

// [CORREÇÃO] Alterado para PUT para corresponder à requisição do frontend.
// O middleware de upload (multer) funciona corretamente com PUT.
router.put(
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
