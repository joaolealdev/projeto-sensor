"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_net_1 = __importDefault(require("node:net"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("../config/config");
const tcp_utils_1 = require("../shared/tcp-utils");
const protocol_1 = require("../shared/protocol");
const storage_1 = require("../dashboard/storage");
const server_1 = require("../dashboard/server");
const DATA_DIR = node_path_1.default.resolve(__dirname, "../../data");
const AVERAGES_FILE = node_path_1.default.join(DATA_DIR, "averages.json");
// A janela de agregacao fica em memoria; o historico de leituras e gravado
// separadamente para consulta pelo painel.
const buffers = new Map();
let periodStart = (0, tcp_utils_1.timestamp)();
function ensureDataFile() {
    if (!node_fs_1.default.existsSync(DATA_DIR)) {
        node_fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!node_fs_1.default.existsSync(AVERAGES_FILE)) {
        node_fs_1.default.writeFileSync(AVERAGES_FILE, "[]", "utf8");
    }
}
function appendAverageRecord(record) {
    ensureDataFile();
    let records = [];
    try {
        const raw = node_fs_1.default.readFileSync(AVERAGES_FILE, "utf8");
        records = JSON.parse(raw);
    }
    catch {
        records = [];
    }
    records.push(record);
    const temporaryFile = `${AVERAGES_FILE}.tmp`;
    node_fs_1.default.writeFileSync(temporaryFile, JSON.stringify(records, null, 2), "utf8");
    node_fs_1.default.renameSync(temporaryFile, AVERAGES_FILE);
}
function average(values) {
    const sum = values.reduce((acc, v) => acc + v, 0);
    return +(sum / values.length).toFixed(2);
}
function flush() {
    const periodEnd = (0, tcp_utils_1.timestamp)();
    for (const [gatewayId, buffer] of buffers.entries()) {
        if (buffer.readings.length === 0) {
            continue;
        }
        const record = {
            gateway: gatewayId,
            periodStart,
            periodEnd,
            samples: buffer.readings.length,
            averages: {
                temperature: average(buffer.readings.map((r) => r.temperature)),
                humidity: average(buffer.readings.map((r) => r.humidity)),
                solarRadiation: average(buffer.readings.map((r) => r.solarRadiation)),
            },
        };
        (0, tcp_utils_1.log)("Average Service", `${buffer.readings.length} amostras acumuladas (gateway ${gatewayId})`);
        (0, tcp_utils_1.log)("Average Service", `Media calculada (gateway ${gatewayId})`);
        try {
            appendAverageRecord(record);
            buffer.readings = [];
            (0, tcp_utils_1.log)("Average Service", `Media persistida (gateway ${gatewayId})`);
        }
        catch (err) {
            (0, tcp_utils_1.log)("Average Service", `Falha ao persistir media: ${err.message}`);
        }
    }
    periodStart = periodEnd;
}
setInterval(flush, config_1.AGGREGATION_WINDOW_MS);
const server = node_net_1.default.createServer((socket) => {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    (0, tcp_utils_1.createLineReader)(socket, (line) => {
        let message;
        try {
            message = (0, protocol_1.parseJsonLine)(line);
        }
        catch {
            (0, tcp_utils_1.log)("Average Service", `Mensagem JSON invalida recebida de ${remote}: ${line}`);
            const errorResponse = { type: "ERROR", message: "JSON invalido" };
            (0, tcp_utils_1.sendMessage)(socket, errorResponse);
            return;
        }
        if (!(0, protocol_1.isGatewayReading)(message)) {
            (0, tcp_utils_1.log)("Average Service", `Mensagem com formato invalido recebida de ${remote}`);
            const errorResponse = {
                type: "ERROR",
                message: "Formato de leitura invalido",
            };
            (0, tcp_utils_1.sendMessage)(socket, errorResponse);
            return;
        }
        const reading = message;
        (0, tcp_utils_1.log)("Average Service", `Leitura recebida de ${reading.gateway}/${reading.sensorNode}`);
        try {
            (0, storage_1.appendReading)(reading);
        }
        catch (err) {
            (0, tcp_utils_1.log)("Average Service", `Falha ao persistir leitura: ${err.message}`);
            (0, tcp_utils_1.sendMessage)(socket, { type: "ERROR", message: "Falha ao salvar leitura" });
            return;
        }
        if (!buffers.has(reading.gateway)) {
            buffers.set(reading.gateway, { readings: [] });
        }
        buffers.get(reading.gateway).readings.push(reading);
        const ack = { type: "ACK" };
        (0, tcp_utils_1.sendMessage)(socket, ack);
    });
    socket.on("error", (err) => {
        (0, tcp_utils_1.log)("Average Service", `Conexao com ${remote} encerrada com erro: ${err.message}`);
    });
});
server.on("error", (err) => {
    console.error(`[Average Service] Erro no servidor TCP: ${err.message}`);
});
server.listen(config_1.AVERAGE_SERVICE_CONFIG.port, config_1.AVERAGE_SERVICE_CONFIG.host, () => {
    (0, tcp_utils_1.log)("Average Service", `Servico iniciado na porta ${config_1.AVERAGE_SERVICE_CONFIG.port} ` +
        `(janela de agregacao: ${config_1.AGGREGATION_WINDOW_MS}ms)`);
});
(0, server_1.startDashboardServer)();
