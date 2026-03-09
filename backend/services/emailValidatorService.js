// Ficheiro: backend/services/emailValidatorService.js
// Descrição: Serviço leve para validação de e-mail (Regex + MX Records).
// Substitui bibliotecas pesadas como deep-email-validator.

const validator = require('validator');
const dns = require('dns');
const util = require('util');

// Promisify para usar async/await com DNS
const resolveMx = util.promisify(dns.resolveMx);

/**
 * Valida um e-mail verificando formato e existência do domínio (MX).
 * @param {string} email - O e-mail a validar.
 * @returns {Promise<{isValid: boolean, reason?: string}>}
 */
const validateEmail = async (email) => {
    if (!email) return { isValid: false, reason: 'E-mail é obrigatório.' };

    // 1. Validação de Formato (Regex via validator.js)
    if (!validator.isEmail(email)) {
        return { isValid: false, reason: 'Formato de e-mail inválido.' };
    }

    // 2. Validação de Domínio (MX Records via DNS nativo)
    const domain = email.split('@')[1];
    try {
        const addresses = await resolveMx(domain);
        if (!addresses || addresses.length === 0) {
            return { isValid: false, reason: 'Domínio do e-mail não possui servidores de correio (MX) válidos.' };
        }
    } catch (error) {
        // Ignora erros de DNS temporários, mas falha se o domínio não existir
        if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
            return { isValid: false, reason: 'Domínio do e-mail não encontrado ou inválido.' };
        }
        console.warn(`[EmailValidator] Erro DNS ao verificar ${domain}: ${error.message}`);
    }

    return { isValid: true };
};

module.exports = { validateEmail };