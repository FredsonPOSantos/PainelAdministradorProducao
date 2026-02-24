// Ficheiro: backend/middlewares/permissionMiddleware.js
// Descrição: Middleware para verificar permissões granulares do utilizador.

/**
 * Middleware factory para verificar se o utilizador tem uma permissão específica.
 * @param {string} requiredPermission - A chave da permissão necessária (ex: 'users.create').
 */
const checkPermission = (requiredPermission) => {
    return (req, res, next) => {
        // O middleware de autenticação (verifyToken) já deve ter populado req.user
        if (!req.user || !req.user.permissions) {
            return res.status(403).json({ message: 'Acesso negado. Permissões não encontradas.' });
        }

        if (req.user.permissions[requiredPermission]) {
            return next(); // O utilizador tem a permissão, continua
        } else {
            return res.status(403).json({ message: `Acesso negado. Requer permissão: '${requiredPermission}'.` });
        }
    };
};

module.exports = { checkPermission };