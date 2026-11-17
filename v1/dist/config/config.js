"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGGREGATION_WINDOW_MS = exports.RETRY_DELAY_MS = exports.MAX_READ_ATTEMPTS = exports.RESPONSE_TIMEOUT_MS = exports.CONNECT_TIMEOUT_MS = exports.GATEWAYS = exports.AVERAGE_SERVICE_CONFIG = exports.SENSOR_NODES = void 0;
// --- Servidores de sensores (IoT simulados) ---
exports.SENSOR_NODES = {
    S1: { id: "S1", host: "127.0.0.1", port: 5001 },
    S2: { id: "S2", host: "127.0.0.1", port: 5002 },
};
// --- Microsservico de processamento/agregacao ---
exports.AVERAGE_SERVICE_CONFIG = {
    host: "127.0.0.1",
    port: 6000,
};
// --- Gateways Edge ---
// Cada gateway pode ser associado a um ou mais servidores de sensores,
// permitindo escalar a arquitetura no futuro sem mudar o codigo dos
// componentes, apenas esta configuracao.
exports.GATEWAYS = {
    G1: { id: "G1", sensorNodes: [exports.SENSOR_NODES.S1], pollIntervalMs: 2000 },
    G2: { id: "G2", sensorNodes: [exports.SENSOR_NODES.S2], pollIntervalMs: 2000 },
};
// --- Parametros de rede e resiliencia ---
exports.CONNECT_TIMEOUT_MS = 3000;
exports.RESPONSE_TIMEOUT_MS = 3000;
exports.MAX_READ_ATTEMPTS = 3;
exports.RETRY_DELAY_MS = 1000;
// --- Janela de agregacao do Average Service ---
exports.AGGREGATION_WINDOW_MS = 10000;
