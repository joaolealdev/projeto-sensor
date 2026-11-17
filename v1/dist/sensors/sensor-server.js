"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_net_1 = __importDefault(require("node:net"));
const config_1 = require("../config/config");
const sensor_generator_1 = require("./sensor-generator");
const tcp_utils_1 = require("../shared/tcp-utils");
const protocol_1 = require("../shared/protocol");
const sensorId = process.argv[2] || process.env.SENSOR_ID || "S1";
const nodeConfig = config_1.SENSOR_NODES[sensorId];
if (!nodeConfig) {
    console.error(`[SensorServer] Configuracao nao encontrada para o sensor "${sensorId}". ` +
        `Opcoes disponiveis: ${Object.keys(config_1.SENSOR_NODES).join(", ")}`);
    process.exit(1);
}
const server = node_net_1.default.createServer((socket) => {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    (0, tcp_utils_1.createLineReader)(socket, (line) => {
        let message;
        try {
            message = (0, protocol_1.parseJsonLine)(line);
        }
        catch {
            (0, tcp_utils_1.log)(sensorId, `Mensagem JSON invalida recebida de ${remote}: ${line}`);
            const errorResponse = {
                type: "ERROR",
                message: "JSON invalido",
            };
            (0, tcp_utils_1.sendMessage)(socket, errorResponse);
            return;
        }
        if (!(0, protocol_1.isReadSensorsRequest)(message)) {
            (0, tcp_utils_1.log)(sensorId, `Tipo de requisicao desconhecido recebido de ${remote}`);
            const errorResponse = {
                type: "ERROR",
                message: "Tipo de requisicao desconhecido",
            };
            (0, tcp_utils_1.sendMessage)(socket, errorResponse);
            return;
        }
        const requester = message.gateway ?? remote;
        (0, tcp_utils_1.log)(sensorId, `Solicitacao recebida de ${requester}`);
        const sample = (0, sensor_generator_1.generateSensorSample)();
        const response = {
            type: "SENSOR_READING",
            sensorNode: sensorId,
            timestamp: (0, tcp_utils_1.timestamp)(),
            ...sample,
        };
        (0, tcp_utils_1.log)(sensorId, `T=${sample.temperature}°C U=${sample.humidity}% Solar=${sample.solarRadiation} W/m²`);
        (0, tcp_utils_1.sendMessage)(socket, response);
    });
    socket.on("error", (err) => {
        (0, tcp_utils_1.log)(sensorId, `Conexao com ${remote} encerrada com erro: ${err.message}`);
    });
});
server.on("error", (err) => {
    console.error(`[${sensorId}] Erro no servidor TCP: ${err.message}`);
});
server.listen(nodeConfig.port, nodeConfig.host, () => {
    (0, tcp_utils_1.log)(sensorId, `Servidor iniciado na porta ${nodeConfig.port}`);
});
