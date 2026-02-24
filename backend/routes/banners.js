// Ficheiro: routes/banners.js
// [VERSÃO 13.6.1 - PERMISSÕES GRANULARES]

const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');
const verifyToken = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');
const uploadMiddleware = require('../middlewares/uploadMiddleware');

// --- Rotas para Banners ---

// Upload de imagem de banner (Criação)
router.post(
  '/upload',
  [verifyToken, checkPermission('banners.create'), uploadMiddleware.single('bannerImage')],
  bannerController.uploadBannerImage
);

// Criar um novo banner (Criação)
router.post(
  '/',
  [verifyToken, checkPermission('banners.create'), uploadMiddleware.single('bannerImage')],
  bannerController.createBanner
);

// Listar todos os banners (Leitura)
router.get(
  '/',
  [verifyToken, checkPermission('banners.read')],
  bannerController.getAllBanners
);

// Atualizar um banner (Atualização)
router.put(
  '/:id',
  [verifyToken, checkPermission('banners.update'), uploadMiddleware.single('bannerImage')],
  bannerController.updateBanner
);

// Eliminar um banner (Deleção)
router.delete(
  '/:id',
  [verifyToken, checkPermission('banners.delete')],
  bannerController.deleteBanner
);

module.exports = router;
