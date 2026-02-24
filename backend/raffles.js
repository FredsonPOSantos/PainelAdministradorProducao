// Ficheiro: backend/routes/raffles.js
// Descrição: Define as rotas para a API de Sorteios, protegidas por permissões.

const express = require('express');
const router = express.Router();
const raffleController = require('../controllers/raffleController');
const verifyToken = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');

// Rota para buscar todos os sorteios
router.get('/', verifyToken, checkPermission('raffles.read'), raffleController.getAllRaffles);

// Rota para buscar detalhes de um sorteio
router.get('/:id', verifyToken, checkPermission('raffles.read'), raffleController.getRaffleDetails);

// Rota para criar um novo sorteio (processo assíncrono)
router.post('/create-async', verifyToken, checkPermission('raffles.create'), raffleController.createRaffleAsync);

// Rota para realizar o sorteio de um vencedor (processo assíncrono)
router.post('/:id/draw-async', verifyToken, checkPermission('raffles.draw'), raffleController.drawWinnerAsync);

// Rota para deletar um sorteio
router.delete('/:id', verifyToken, checkPermission('raffles.delete'), raffleController.deleteRaffle);

module.exports = router;