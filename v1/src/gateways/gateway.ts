import { GATEWAYS, SensorNodeConfig, MAX_READ_ATTEMPTS, RETRY_DELAY_MS } from "../config/config";
import { readSensor } from "./sensor-client";
import { sendReadingToAverageService } from "./average-client";
import { log, delay } from "../shared/tcp-utils";
import { GatewayReading, SensorReadingResponse } from "../shared/types";

const gatewayId = process.argv[2] || process.env.GATEWAY_ID || "G1";
const gatewayConfig = GATEWAYS[gatewayId];

if (!gatewayConfig) {
  console.error(
    `[Gateway] Configuracao nao encontrada para o gateway "${gatewayId}". ` +
      `Opcoes disponiveis: ${Object.keys(GATEWAYS).join(", ")}`
  );
  process.exit(1);
}

/**
 * Consulta um sensor com algumas tentativas de reconexao antes de
 * desistir. Uma falha aqui nunca derruba o processo do Gateway: o
 * proximo ciclo de polling tenta novamente.
 */
async function readWithRetry(node: SensorNodeConfig): Promise<SensorReadingResponse | null> {
  for (let attempt = 1; attempt <= MAX_READ_ATTEMPTS; attempt++) {
    if (attempt === 1) {
      log(gatewayId, `Consultando Sensor ${node.id}...`);
    } else {
      log(gatewayId, `Tentativa ${attempt}/${MAX_READ_ATTEMPTS} de reconexao com ${node.id}...`);
    }

    try {
      const reading = await readSensor(gatewayId, node);
      log(gatewayId, "Leitura recebida");
      return reading;
    } catch (err) {
      log(gatewayId, `Erro ao consultar ${node.id}: ${(err as Error).message}`);
      if (attempt < MAX_READ_ATTEMPTS) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  log(gatewayId, `Sensor ${node.id} indisponivel apos ${MAX_READ_ATTEMPTS} tentativas`);
  return null;
}

async function pollSensor(node: SensorNodeConfig): Promise<void> {
  const reading = await readWithRetry(node);
  if (!reading) {
    return;
  }

  const gatewayReading: GatewayReading = {
    type: "GATEWAY_READING",
    gateway: gatewayId,
    sensorNode: reading.sensorNode,
    timestamp: reading.timestamp,
    temperature: reading.temperature,
    humidity: reading.humidity,
    solarRadiation: reading.solarRadiation,
  };

  log(gatewayId, "Encaminhando leitura para Average Service");

  try {
    await sendReadingToAverageService(gatewayReading);
  } catch (err) {
    log(gatewayId, `Average Service indisponivel: ${(err as Error).message}`);
  }
}

function startPolling(): void {
  for (const node of gatewayConfig.sensorNodes) {
    setInterval(() => {
      pollSensor(node).catch((err) => {
        log(gatewayId, `Erro inesperado no ciclo de polling de ${node.id}: ${err.message}`);
      });
    }, gatewayConfig.pollIntervalMs);
  }
}

log(
  gatewayId,
  `Gateway iniciado. Sensores monitorados: ${gatewayConfig.sensorNodes
    .map((n) => n.id)
    .join(", ")} (intervalo de ${gatewayConfig.pollIntervalMs}ms)`
);

startPolling();
