"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJsonLine = parseJsonLine;
exports.isReadSensorsRequest = isReadSensorsRequest;
exports.isValidSensorReading = isValidSensorReading;
exports.isGatewayReading = isGatewayReading;
/**
 * Faz o parse de uma linha (ja sem o "\n" delimitador) como JSON.
 * Lanca excecao se a linha nao for um JSON valido — quem chama deve
 * tratar esse erro e responder com uma mensagem de protocolo ERROR.
 */
function parseJsonLine(line) {
    return JSON.parse(line);
}
function isReadSensorsRequest(msg) {
    return !!msg && typeof msg === "object" && msg.type === "READ_SENSORS";
}
function isValidSensorReading(msg) {
    return (!!msg &&
        typeof msg === "object" &&
        msg.type === "SENSOR_READING" &&
        typeof msg.sensorNode === "string" &&
        typeof msg.timestamp === "string" &&
        typeof msg.temperature === "number" &&
        Number.isFinite(msg.temperature) &&
        typeof msg.humidity === "number" &&
        Number.isFinite(msg.humidity) &&
        typeof msg.solarRadiation === "number" &&
        Number.isFinite(msg.solarRadiation));
}
function isGatewayReading(msg) {
    return (!!msg &&
        typeof msg === "object" &&
        msg.type === "GATEWAY_READING" &&
        typeof msg.gateway === "string" &&
        typeof msg.sensorNode === "string" &&
        typeof msg.timestamp === "string" &&
        typeof msg.temperature === "number" &&
        Number.isFinite(msg.temperature) &&
        typeof msg.humidity === "number" &&
        Number.isFinite(msg.humidity) &&
        typeof msg.solarRadiation === "number" &&
        Number.isFinite(msg.solarRadiation));
}
