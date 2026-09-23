import net from "node:net";
import { AVERAGE_SERVICE_CONFIG, CONNECT_TIMEOUT_MS, RESPONSE_TIMEOUT_MS } from "../config/config";
import { sendMessage, createLineReader } from "../shared/tcp-utils";
import { parseJsonLine } from "../shared/protocol";
import { GatewayReading, AckResponse, ErrorResponse } from "../shared/types";

/**
 * Envia uma leitura ja validada para o microsservico de processamento
 * (Average Service) e aguarda a confirmacao (ACK). Assim como no
 * cliente de sensores, a conexao e efemera: abre, envia, aguarda
 * resposta e fecha.
 */
export function sendReadingToAverageService(reading: GatewayReading): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const timeoutTimer = setTimeout(() => {
      finish(new Error("Timeout aguardando confirmacao do Average Service"));
    }, RESPONSE_TIMEOUT_MS);

    function finish(err: Error | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      socket.destroy();
      if (err) reject(err);
      else resolve();
    }

    socket.setTimeout(CONNECT_TIMEOUT_MS);

    socket.connect(AVERAGE_SERVICE_CONFIG.port, AVERAGE_SERVICE_CONFIG.host, () => {
      sendMessage(socket, reading);
    });

    createLineReader(socket, (line) => {
      let message: unknown;
      try {
        message = parseJsonLine<AckResponse | ErrorResponse>(line);
      } catch {
        finish(new Error("Resposta JSON invalida do Average Service"));
        return;
      }

      const parsed = message as { type?: string; message?: string };
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
