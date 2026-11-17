import net from "node:net";
import { NODES, PUSH_INTERVAL_MS } from "../config/topology";
import type { ErrorMessage, ReadingMessage } from "../shared/messages";
import { log, logError, nowIso, sendMessage } from "../shared/wire";
import { sampleClimate } from "./climate";

const nodeId = process.argv[2] || process.env.FIELD_NODE_ID || "N1";
const spec = NODES[nodeId];

if (!spec) {
  console.error(
    `[field] no "${nodeId}" nao existe em src/config/topology.ts. Opcoes: ${Object.keys(NODES).join(", ")}`,
  );
  process.exit(1);
}

// so um gateway por vez
let gateway: net.Socket | null = null;

const server = net.createServer((socket) => {
  const peer = `${socket.remoteAddress}:${socket.remotePort}`;

  if (gateway) {
    const busy: ErrorMessage = { type: "ERROR", message: "no ocupado: ja existe um gateway conectado" };
    sendMessage(socket, busy);
    socket.end();
    log(nodeId, `conexao de ${peer} recusada, ja ha um gateway`);
    return;
  }

  gateway = socket;
  log(nodeId, `gateway conectado (${peer})`);
  socket.on("error", (err) => logError(nodeId, `conexao com ${peer}: ${err.message}`));
  socket.on("close", () => {
    gateway = null;
    log(nodeId, "gateway desconectado");
  });
});

server.on("error", (err) => {
  logError(nodeId, `servidor TCP: ${err.message}`);
  process.exit(1);
});

server.listen(spec.port, () => {
  log(nodeId, `escutando na porta ${spec.port}, uma leitura a cada ${PUSH_INTERVAL_MS} ms`);

  setInterval(() => {
    if (!gateway || gateway.destroyed) return;
    const reading: ReadingMessage = {
      type: "READING",
      node: nodeId,
      at: nowIso(),
      ...sampleClimate(spec.profile),
    };
    sendMessage(gateway, reading);
  }, PUSH_INTERVAL_MS);
});
