import net from "node:net";
import { SensorNodeConfig, CONNECT_TIMEOUT_MS, RESPONSE_TIMEOUT_MS } from "../config/config";
import { sendMessage, createLineReader } from "../shared/tcp-utils";
import { parseJsonLine, isValidSensorReading } from "../shared/protocol";
import { SensorReadingResponse, ErrorResponse } from "../shared/types";

/**
 * Abre uma conexao TCP curta com um servidor de sensor, envia uma
 * requisicao READ_SENSORS e resolve com a leitura recebida. A conexao
 * e fechada assim que a resposta chega (ou em caso de erro/timeout).
 */
export function readSensor(
  gatewayId: string,
  node: SensorNodeConfig
): Promise<SensorReadingResponse> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const timeoutTimer = setTimeout(() => {
      finish(new Error(`Timeout aguardando resposta de ${node.id}`));
    }, RESPONSE_TIMEOUT_MS);

    function finish(err: Error | null, data?: SensorReadingResponse) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      socket.destroy();
      if (err) reject(err);
      else resolve(data!);
    }

    socket.setTimeout(CONNECT_TIMEOUT_MS);

    socket.connect(node.port, node.host, () => {
      sendMessage(socket, { type: "READ_SENSORS", gateway: gatewayId });
    });

    createLineReader(socket, (line) => {
      let message: unknown;
      try {
        message = parseJsonLine<SensorReadingResponse | ErrorResponse>(line);
      } catch {
        finish(new Error(`Resposta JSON invalida do sensor ${node.id}`));
        return;
      }

      const parsed = message as { type?: string; message?: string };
      if (parsed.type === "ERROR") {
        finish(new Error(`Sensor ${node.id} retornou erro: ${parsed.message}`));
        return;
      }

      if (!isValidSensorReading(message)) {
        finish(new Error(`Leitura invalida recebida do sensor ${node.id}`));
        return;
      }

      finish(null, message as SensorReadingResponse);
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
