"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSensorSample = generateSensorSample;
function randomInRange(min, max) {
    return +(Math.random() * (max - min) + min).toFixed(1);
}
/**
 * Simula uma leitura de hardware dentro de faixas realistas para um
 * ambiente agricola. Nao ha nenhum estado entre chamadas — o servidor
 * de sensores nao guarda historico, apenas gera a leitura no momento
 * em que e consultado.
 */
function generateSensorSample() {
    return {
        temperature: randomInRange(15, 38), // graus Celsius
        humidity: randomInRange(30, 90), // % de umidade relativa
        solarRadiation: randomInRange(0, 1000), // W/m^2
    };
}
