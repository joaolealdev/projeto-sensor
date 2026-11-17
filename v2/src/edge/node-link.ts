import net from "node:net";
import { RECONNECT_MS, type NodeSpec } from "../config/topology";
import { isErrorMessage, isReading, type ReadingMessage } from "../shared/messages";
import { createLineReader, log, logError } from "../shared/wire";

// conexao do gateway com um no. se o no cair ou ainda nao existir, tenta de novo
// esperando o dobro a cada vez (1 s, 2 s, 4 s ate 15 s); volta a 1 s quando chega leitura
export class NodeLink {
  private waitMs = RECONNECT_MS.first;

  constructor(
    private readonly gatewayId: string,
    private readonly node: NodeSpec,
    private readonly onReading: (reading: ReadingMessage) => void,
  ) {}

  start(): void {
    const { id, host, port } = this.node;
    const socket = net.createConnection({ host, port });

    socket.on("connect", () => log(this.gatewayId, `conectado ao no ${id} (${host}:${port})`));
    socket.on("error", (err) => logError(this.gatewayId, `no ${id}: ${err.message}`));
    socket.on("close", () => {
      log(this.gatewayId, `no ${id} indisponivel, nova tentativa em ${this.waitMs / 1000} s`);
      setTimeout(() => this.start(), this.waitMs);
      this.waitMs = Math.min(this.waitMs * 2, RECONNECT_MS.max);
    });

    createLineReader(socket, (line) => this.handle(line));
  }

  private handle(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      logError(this.gatewayId, `no ${this.node.id}: linha que nao e JSON`);
      return;
    }

    if (isErrorMessage(message)) {
      logError(this.gatewayId, `no ${this.node.id} recusou a ligacao: ${message.message}`);
      return;
    }
    if (!isReading(message) || message.node !== this.node.id) {
      logError(this.gatewayId, `no ${this.node.id}: mensagem fora do contrato READING`);
      return;
    }

    this.waitMs = RECONNECT_MS.first;
    this.onReading(message);
  }
}
