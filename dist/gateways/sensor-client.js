"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readSensor = readSensor;
const node_net_1 = __importDefault(require("node:net"));
const config_1 = require("../config/config");
const tcp_utils_1 = require("../shared/tcp-utils");
const protocol_1 = require("../shared/protocol");
/**
 * Abre uma conexao TCP curta com um servidor de sensor, envia uma
 * requisicao READ_SENSORS e resolve com a leitura recebida. A conexao
 * e fechada assim que a resposta chega (ou em caso de erro/timeout).
 */
function readSensor(gatewayId, node) {
    return new Promise((resolve, reject) => {
        const socket = new node_net_1.default.Socket();
        let settled = false;
        const timeoutTimer = setTimeout(() => {
            finish(new Error(`Timeout aguardando resposta de ${node.id}`));
        }, config_1.RESPONSE_TIMEOUT_MS);
        function finish(err, data) {
            if (settled)
                return;
            settled = true;
            clearTimeout(timeoutTimer);
            socket.destroy();
            if (err)
                reject(err);
            else
                resolve(data);
        }
        socket.setTimeout(config_1.CONNECT_TIMEOUT_MS);
        socket.connect(node.port, node.host, () => {
            (0, tcp_utils_1.sendMessage)(socket, { type: "READ_SENSORS", gateway: gatewayId });
        });
        (0, tcp_utils_1.createLineReader)(socket, (line) => {
            let message;
            try {
                message = (0, protocol_1.parseJsonLine)(line);
            }
            catch {
                finish(new Error(`Resposta JSON invalida do sensor ${node.id}`));
                return;
            }
            const parsed = message;
            if (parsed.type === "ERROR") {
                finish(new Error(`Sensor ${node.id} retornou erro: ${parsed.message}`));
                return;
            }
            if (!(0, protocol_1.isValidSensorReading)(message)) {
                finish(new Error(`Leitura invalida recebida do sensor ${node.id}`));
                return;
            }
            finish(null, message);
        });
        socket.on("timeout", () => {
            finish(new Error(`Timeout de conexao com ${node.id} (${node.host}:${node.port})`));
        });
        socket.on("error", (err) => {
            finish(new Error(`Falha de conexao com ${node.id}: ${err.message}`));
        });
        socket.on("close", () => {
            if (!settled) {
                finish(new Error(`Conexao com ${node.id} encerrada inesperadamente`));
            }
        });
    });
}
