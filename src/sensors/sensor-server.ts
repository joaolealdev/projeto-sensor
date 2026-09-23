import net from "node:net";
import { SENSOR_NODES } from "../config/config";
import { generateSensorSample } from "./sensor-generator";
import { sendMessage, createLineReader, log, timestamp } from "../shared/tcp-utils";
import { parseJsonLine, isReadSensorsRequest } from "../shared/protocol";
import { SensorReadingResponse, ErrorResponse } from "../shared/types";

const sensorId = process.argv[2] || process.env.SENSOR_ID || "S1";
const nodeConfig = SENSOR_NODES[sensorId];

if (!nodeConfig) {
  console.error(
    `[SensorServer] Configuracao nao encontrada para o sensor "${sensorId}". ` +
      `Opcoes disponiveis: ${Object.keys(SENSOR_NODES).join(", ")}`
  );
  process.exit(1);
}

const server = net.createServer((socket) => {
  const remote = `${socket.remoteAddress}:${socket.remotePort}`;

  createLineReader(socket, (line) => {
    let message: unknown;

    try {
      message = parseJsonLine(line);
    } catch {
      log(sensorId, `Mensagem JSON invalida recebida de ${remote}: ${line}`);
      const errorResponse: ErrorResponse = {
        type: "ERROR",
        message: "JSON invalido",
      };
      sendMessage(socket, errorResponse);
      return;
    }

    if (!isReadSensorsRequest(message)) {
      log(sensorId, `Tipo de requisicao desconhecido recebido de ${remote}`);
      const errorResponse: ErrorResponse = {
        type: "ERROR",
        message: "Tipo de requisicao desconhecido",
      };
      sendMessage(socket, errorResponse);
      return;
    }

    const requester = message.gateway ?? remote;
    log(sensorId, `Solicitacao recebida de ${requester}`);

    const sample = generateSensorSample();
    const response: SensorReadingResponse = {
      type: "SENSOR_READING",
      sensorNode: sensorId,
      timestamp: timestamp(),
      ...sample,
    };

    log(
      sensorId,
      `T=${sample.temperature}°C U=${sample.humidity}% Solar=${sample.solarRadiation} W/m²`
    );

    sendMessage(socket, response);
  });

  socket.on("error", (err) => {
    log(sensorId, `Conexao com ${remote} encerrada com erro: ${err.message}`);
  });
});

server.on("error", (err) => {
  console.error(`[${sensorId}] Erro no servidor TCP: ${err.message}`);
});

server.listen(nodeConfig.port, nodeConfig.host, () => {
  log(sensorId, `Servidor iniciado na porta ${nodeConfig.port}`);
});
