// Ficheiro: backend/routes/roleRoutes.js
const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const verifyToken = require('../middlewares/authMiddleware');
const { checkPermission } = require('../middlewares/permissionMiddleware');

// Rotas protegidas
router.get('/', verifyToken, checkPermission('permissions.read'), roleController.getRoles);
router.post('/', verifyToken, checkPermission('permissions.update'), roleController.createRole);
router.put('/:slug', verifyToken, checkPermission('permissions.update'), roleController.updateRole);
router.delete('/:slug', verifyToken, checkPermission('permissions.update'), roleController.deleteRole);

module.exports = router;