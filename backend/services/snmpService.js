// Ficheiro: backend/services/snmpService.js
let snmp;
try {
    snmp = require('net-snmp');
} catch (e) {
    console.warn('[SNMP] Biblioteca "net-snmp" não encontrada. Instale com "npm install net-snmp".');
}

/**
 * Verifica se um host está online via SNMP solicitando o sysUpTime.
 * @param {string} host - IP do roteador.
 * @param {string} community - Comunidade SNMP (padrão: public).
 * @returns {Promise<boolean>} - True se responder, False caso contrário.
 */
const checkSnmpStatus = (host, community = 'public') => {
    if (!snmp) return Promise.resolve(false);

    return new Promise((resolve) => {
        // Cria sessão com timeout curto (2s) e 1 retentativa
        // [ATUALIZADO] Força SNMPv1 conforme especificação ("trap 1")
        const session = snmp.createSession(host, community, {
            timeout: 2000,
            retries: 1,
            transport: 'udp4',
            version: snmp.Version1
        });

        const oids = ['1.3.6.1.2.1.1.3.0']; // OID padrão para sysUpTime

        session.get(oids, (error, varbinds) => {
            session.close();
            if (error) {
                // console.log(`[SNMP] Falha em ${host}: ${error.message}`);
                resolve(false);
            } else {
                if (snmp.isVarbindError(varbinds[0])) {
                    resolve(false);
                } else {
                    // Se recebeu um valor válido, o roteador está vivo
                    resolve(true);
                }
            }
        });

        // Tratamento de erros de socket
        session.on('error', () => {
            resolve(false);
        });
    });
};

/**
 * [NOVO] Obtém o nome do sistema (sysName) via SNMP.
 * Útil para validar a identidade do roteador (ex: "CARRO RTURB...").
 */
const getSnmpName = (host, community = 'public') => {
    if (!snmp) return Promise.resolve(null);

    return new Promise((resolve) => {
        const session = snmp.createSession(host, community, {
            timeout: 2000,
            retries: 1,
            transport: 'udp4',
            version: snmp.Version1
        });

        const oids = ['1.3.6.1.2.1.1.5.0']; // OID para sysName

        session.get(oids, (error, varbinds) => {
            session.close();
            if (error || snmp.isVarbindError(varbinds[0])) {
                resolve(null);
            } else {
                // Retorna o valor do nome como string
                resolve(varbinds[0].value.toString());
            }
        });

        session.on('error', () => resolve(null));
    });
};

module.exports = { checkSnmpStatus, getSnmpName };
