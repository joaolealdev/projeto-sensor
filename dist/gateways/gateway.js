"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("../config/config");
const sensor_client_1 = require("./sensor-client");
const average_client_1 = require("./average-client");
const tcp_utils_1 = require("../shared/tcp-utils");
const gatewayId = process.argv[2] || process.env.GATEWAY_ID || "G1";
const gatewayConfig = config_1.GATEWAYS[gatewayId];
if (!gatewayConfig) {
    console.error(`[Gateway] Configuracao nao encontrada para o gateway "${gatewayId}". ` +
        `Opcoes disponiveis: ${Object.keys(config_1.GATEWAYS).join(", ")}`);
    process.exit(1);
}
/**
 * Consulta um sensor com algumas tentativas de reconexao antes de
 * desistir. Uma falha aqui nunca derruba o processo do Gateway: o
 * proximo ciclo de polling tenta novamente.
 */
async function readWithRetry(node) {
    for (let attempt = 1; attempt <= config_1.MAX_READ_ATTEMPTS; attempt++) {
        if (attempt === 1) {
            (0, tcp_utils_1.log)(gatewayId, `Consultando Sensor ${node.id}...`);
        }
        else {
            (0, tcp_utils_1.log)(gatewayId, `Tentativa ${attempt}/${config_1.MAX_READ_ATTEMPTS} de reconexao com ${node.id}...`);
        }
        try {
            const reading = await (0, sensor_client_1.readSensor)(gatewayId, node);
            (0, tcp_utils_1.log)(gatewayId, "Leitura recebida");
            return reading;
        }
        catch (err) {
            (0, tcp_utils_1.log)(gatewayId, `Erro ao consultar ${node.id}: ${err.message}`);
            if (attempt < config_1.MAX_READ_ATTEMPTS) {
                await (0, tcp_utils_1.delay)(config_1.RETRY_DELAY_MS);
            }
        }
    }
    (0, tcp_utils_1.log)(gatewayId, `Sensor ${node.id} indisponivel apos ${config_1.MAX_READ_ATTEMPTS} tentativas`);
    return null;
}
async function pollSensor(node) {
    const reading = await readWithRetry(node);
    if (!reading) {
        return;
    }
    const gatewayReading = {
        type: "GATEWAY_READING",
        gateway: gatewayId,
        sensorNode: reading.sensorNode,
        timestamp: reading.timestamp,
        temperature: reading.temperature,
        humidity: reading.humidity,
        solarRadiation: reading.solarRadiation,
    };
    (0, tcp_utils_1.log)(gatewayId, "Encaminhando leitura para Average Service");
    try {
        await (0, average_client_1.sendReadingToAverageService)(gatewayReading);
    }
    catch (err) {
        (0, tcp_utils_1.log)(gatewayId, `Average Service indisponivel: ${err.message}`);
    }
}
function startPolling() {
    for (const node of gatewayConfig.sensorNodes) {
        setInterval(() => {
            pollSensor(node).catch((err) => {
                (0, tcp_utils_1.log)(gatewayId, `Erro inesperado no ciclo de polling de ${node.id}: ${err.message}`);
            });
        }, gatewayConfig.pollIntervalMs);
    }
}
(0, tcp_utils_1.log)(gatewayId, `Gateway iniciado. Sensores monitorados: ${gatewayConfig.sensorNodes
    .map((n) => n.id)
    .join(", ")} (intervalo de ${gatewayConfig.pollIntervalMs}ms)`);
startPolling();
