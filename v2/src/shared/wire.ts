import type { Socket } from "node:net";
import { StringDecoder } from "node:string_decoder";

// o TCP entrega bytes, nao mensagens. cada mensagem termina em "\n" e o que
// sobra de uma leitura fica guardado ate chegar o resto. o StringDecoder evita
// cortar um caractere como o "°" no meio
export function createLineReader(socket: Socket, onLine: (line: string) => void): void {
  const decoder = new StringDecoder("utf8");
  let carry = "";

  socket.on("data", (chunk: Buffer) => {
    const pieces = (carry + decoder.write(chunk)).split("\n");
    carry = pieces.pop() ?? "";
    for (const piece of pieces) {
      const line = piece.trim();
      if (line) onLine(line);
    }
  });
}

export function sendMessage(socket: Socket, message: unknown): void {
  socket.write(`${JSON.stringify(message)}\n`);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function log(tag: string, text: string): void {
  console.log(`[${tag}] ${text}`);
}

export function logError(tag: string, text: string): void {
  console.error(`[${tag}] ${text}`);
}
