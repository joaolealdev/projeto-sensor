import net from "node:net";
import { FOG_TIMEOUT_MS, RECONNECT_MS, type GatewaySpec } from "../config/topology";
import { isAverages, isErrorMessage, type AskMessage, type AveragesMessage } from "../shared/messages";
import { createLineReader, log, logError, sendMessage } from "../shared/wire";

// conexao da fog com um gateway. a fog pergunta e o gateway responde, como na seta continua
// do desenho; se o professor quiser o contrario, precisamos mudar isso.
// se o gateway cair ou ainda nao existir, tenta de novo com a mesma espera crescente do gateway
export class GatewayLink {
  private socket: net.Socket | null = null;
  private askedAt = 0;
  private waitMs = RECONNECT_MS.first;

  constructor(
    private readonly tag: string,
    private readonly gateway: GatewaySpec,
    private since: number,
    private readonly onAverages: (reply: AveragesMessage) => void,
  ) {}

  start(): void {
    const { id, host, fogPort } = this.gateway;
    const socket = net.createConnection({ host, port: fogPort });
    this.socket = socket;

    socket.on("connect", () => {
      log(this.tag, `conectada ao gateway ${id} (${host}:${fogPort})`);
      this.ask();
    });
    socket.on("error", (err) => logError(this.tag, `gateway ${id}: ${err.message}`));
    socket.on("close", () => {
      this.socket = null;
      this.askedAt = 0;
      log(this.tag, `gateway ${id} indisponivel, nova tentativa em ${this.waitMs / 1000} s`);
      setTimeout(() => this.start(), this.waitMs);
      this.waitMs = Math.min(this.waitMs * 2, RECONNECT_MS.max);
    });

    createLineReader(socket, (line) => this.handle(line));
  }

  // chamado a cada intervalo: pergunta de novo, ou derruba a ligacao se o gateway nao respondeu
  tick(): void {
    if (!this.socket || this.socket.connecting) return;

    if (this.askedAt === 0) {
      this.ask();
    } else if (Date.now() - this.askedAt > FOG_TIMEOUT_MS) {
      logError(this.tag, `gateway ${this.gateway.id} nao respondeu em ${FOG_TIMEOUT_MS / 1000} s`);
      this.socket.destroy();
    }
  }

  private ask(): void {
    if (!this.socket || this.socket.destroyed) return;
    this.askedAt = Date.now();
    const ask: AskMessage = { type: "ASK", since: this.since };
    sendMessage(this.socket, ask);
  }

  private handle(line: string): void {
    const id = this.gateway.id;
    this.askedAt = 0;

    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      logError(this.tag, `gateway ${id}: linha que nao e JSON`);
      return;
    }

    if (isErrorMessage(message)) {
      logError(this.tag, `gateway ${id} recusou o pedido: ${message.message}`);
      return;
    }
    if (!isAverages(message) || message.gateway !== id) {
      logError(this.tag, `gateway ${id}: mensagem fora do contrato AVERAGES`);
      return;
    }

    this.waitMs = RECONNECT_MS.first;

    if (message.latest < this.since) {
      log(this.tag, `banco do gateway ${id} foi refeito, pedindo tudo de novo`);
      this.since = 0;
      this.ask();
      return;
    }

    try {
      this.onAverages(message);
    } catch (err) {
      logError(this.tag, `nao consegui gravar as medias do ${id}: ${(err as Error).message}`);
      return;
    }

    const last = message.rows[message.rows.length - 1];
    if (last) this.since = last.id;
    if (this.since < message.latest) this.ask();
  }
}
