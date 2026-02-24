// Ficheiro: routes/campaigns.js
// [VERSÃO 13.6.1 - PERMISSÕES GRANULARES]

const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaignController');
const verifyToken = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');

// --- Rotas para Campanhas ---

// Criar uma nova campanha
router.post(
  '/',
  [verifyToken, checkPermission('campaigns.create')],
  campaignController.createCampaign
);

// Listar todas as campanhas
router.get(
  '/',
  [verifyToken, checkPermission('campaigns.read')],
  campaignController.getAllCampaigns
);

// Atualizar uma campanha
router.put(
  '/:id',
  [verifyToken, checkPermission('campaigns.update')],
  campaignController.updateCampaign
);

// Eliminar uma campanha
router.delete(
  '/:id',
  [verifyToken, checkPermission('campaigns.delete')],
  campaignController.deleteCampaign
);

// Rota para obter alvos (roteadores e grupos) disponíveis para campanhas
router.get(
  '/available-targets',
  [verifyToken, checkPermission('campaigns.read')],
  campaignController.getAvailableTargets
);

module.exports = router;
