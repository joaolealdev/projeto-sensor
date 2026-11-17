"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReadingToAverageService = sendReadingToAverageService;
const node_net_1 = __importDefault(require("node:net"));
const config_1 = require("../config/config");
const tcp_utils_1 = require("../shared/tcp-utils");
const protocol_1 = require("../shared/protocol");
/**
 * Envia uma leitura ja validada para o microsservico de processamento
 * (Average Service) e aguarda a confirmacao (ACK). Assim como no
 * cliente de sensores, a conexao e efemera: abre, envia, aguarda
 * resposta e fecha.
 */
function sendReadingToAverageService(reading) {
    return new Promise((resolve, reject) => {
        const socket = new node_net_1.default.Socket();
        let settled = false;
        const timeoutTimer = setTimeout(() => {
            finish(new Error("Timeout aguardando confirmacao do Average Service"));
        }, config_1.RESPONSE_TIMEOUT_MS);
        function finish(err) {
            if (settled)
                return;
            settled = true;
            clearTimeout(timeoutTimer);
            socket.destroy();
            if (err)
                reject(err);
            else
                resolve();
        }
        socket.setTimeout(config_1.CONNECT_TIMEOUT_MS);
        socket.connect(config_1.AVERAGE_SERVICE_CONFIG.port, config_1.AVERAGE_SERVICE_CONFIG.host, () => {
            (0, tcp_utils_1.sendMessage)(socket, reading);
        });
        (0, tcp_utils_1.createLineReader)(socket, (line) => {
            let message;
            try {
                message = (0, protocol_1.parseJsonLine)(line);
            }
            catch {
                finish(new Error("Resposta JSON invalida do Average Service"));
                return;
            }
            const parsed = message;
            if (parsed.type === "ERROR") {
                finish(new Error(`Average Service retornou erro: ${parsed.message}`));
                return;
            }
            finish(null);
        });
        socket.on("timeout", () => {
            finish(new Error("Timeout de conexao com o Average Service"));
        });
        socket.on("error", (err) => {
            finish(new Error(`Falha de conexao com o Average Service: ${err.message}`));
        });
        socket.on("close", () => {
            if (!settled) {
                finish(new Error("Conexao com o Average Service encerrada inesperadamente"));
            }
        });
    });
}
