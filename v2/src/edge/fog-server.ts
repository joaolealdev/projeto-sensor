import net from "node:net";
import type { GatewaySpec } from "../config/topology";
import { isAsk, type AveragesMessage, type ErrorMessage } from "../shared/messages";
import { createLineReader, log, logError, sendMessage } from "../shared/wire";
import type { EdgeStore } from "./store";

const MAX_ROWS = 200;

// a fog liga aqui e pergunta; o gateway so responde. nao guarda nada sobre quem perguntou
export function startFogServer(spec: GatewaySpec, store: EdgeStore): void {
  const server = net.createServer((socket) => {
    const peer = `${socket.remoteAddress}:${socket.remotePort}`;
    log(spec.id, `fog conectada (${peer})`);
    socket.on("error", (err) => logError(spec.id, `conexao com a fog ${peer}: ${err.message}`));
    socket.on("close", () => log(spec.id, `fog desconectada (${peer})`));

    createLineReader(socket, (line) => {
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        message = null;
      }

      if (!isAsk(message)) {
        const refused: ErrorMessage = { type: "ERROR", message: "pedido fora do contrato ASK" };
        sendMessage(socket, refused);
        return;
      }

      const reply: AveragesMessage = {
        type: "AVERAGES",
        gateway: spec.id,
        latest: store.latestId(),
        rows: store.averagesAfter(message.since, MAX_ROWS),
      };
      sendMessage(socket, reply);
    });
  });

  server.on("error", (err) => {
    logError(spec.id, `servidor da fog (porta ${spec.fogPort}): ${err.message}`);
    process.exit(1);
  });

  server.listen(spec.fogPort, () => log(spec.id, `escutando a fog na porta ${spec.fogPort}`));
}
