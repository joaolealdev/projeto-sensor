import net from "node:net";

/**
 * TCP e um fluxo continuo de bytes: um unico evento "data" pode conter
 * menos de uma mensagem, exatamente uma, ou varias mensagens coladas.
 * Por isso o protocolo da aplicacao delimita cada mensagem JSON com "\n"
 * e o leitor abaixo acumula os bytes recebidos em um buffer, so
 * considerando uma mensagem completa quando encontra a quebra de linha.
 */
export function createLineReader(
  socket: net.Socket,
  onLine: (line: string) => void
): void {
  let buffer = "";

  socket.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        onLine(line);
      }

      newlineIndex = buffer.indexOf("\n");
    }
  });
}

export function sendMessage(socket: net.Socket, message: unknown): void {
  socket.write(JSON.stringify(message) + "\n");
}

export function timestamp(): string {
  return new Date().toISOString();
}

export function log(prefix: string, message: string): void {
  console.log(`[${prefix}] ${message}`);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
