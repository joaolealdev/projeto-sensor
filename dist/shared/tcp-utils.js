"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLineReader = createLineReader;
exports.sendMessage = sendMessage;
exports.timestamp = timestamp;
exports.log = log;
exports.delay = delay;
/**
 * TCP e um fluxo continuo de bytes: um unico evento "data" pode conter
 * menos de uma mensagem, exatamente uma, ou varias mensagens coladas.
 * Por isso o protocolo da aplicacao delimita cada mensagem JSON com "\n"
 * e o leitor abaixo acumula os bytes recebidos em um buffer, so
 * considerando uma mensagem completa quando encontra a quebra de linha.
 */
function createLineReader(socket, onLine) {
    let buffer = "";
    socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (line.length > 0) {
                onLine(line);
            }
            newlineIndex = buffer.indexOf("\n");
        }
    });
}
function sendMessage(socket, message) {
    socket.write(JSON.stringify(message) + "\n");
}
function timestamp() {
    return new Date().toISOString();
}
function log(prefix, message) {
    console.log(`[${prefix}] ${message}`);
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
