import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { AVERAGE_SERVICE_CONFIG, AGGREGATION_WINDOW_MS } from "../config/config";
import { sendMessage, createLineReader, log, timestamp } from "../shared/tcp-utils";
import { parseJsonLine, isGatewayReading } from "../shared/protocol";
import { GatewayReading, AveragesRecord, ErrorResponse, AckResponse } from "../shared/types";

const DATA_DIR = path.resolve(__dirname, "../../data");
const AVERAGES_FILE = path.join(DATA_DIR, "averages.json");

interface GatewayBuffer {
  readings: GatewayReading[];
}

// As leituras individuais ficam apenas em memoria, durante a janela de
// agregacao. Ao final da janela, sao descartadas — somente as medias
// calculadas sao persistidas em disco.
const buffers = new Map<string, GatewayBuffer>();
let periodStart = timestamp();

function ensureDataFile(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(AVERAGES_FILE)) {
    fs.writeFileSync(AVERAGES_FILE, "[]", "utf8");
  }
}

function appendAverageRecord(record: AveragesRecord): void {
  ensureDataFile();

  let records: AveragesRecord[] = [];
  try {
    const raw = fs.readFileSync(AVERAGES_FILE, "utf8");
    records = JSON.parse(raw);
  } catch {
    records = [];
  }

  records.push(record);
  fs.writeFileSync(AVERAGES_FILE, JSON.stringify(records, null, 2), "utf8");
}

function average(values: number[]): number {
  const sum = values.reduce((acc, v) => acc + v, 0);
  return +(sum / values.length).toFixed(2);
}

function flush(): void {
  const periodEnd = timestamp();

  for (const [gatewayId, buffer] of buffers.entries()) {
    if (buffer.readings.length === 0) {
      continue;
    }

    const record: AveragesRecord = {
      gateway: gatewayId,
      periodStart,
      periodEnd,
      samples: buffer.readings.length,
      averages: {
        temperature: average(buffer.readings.map((r) => r.temperature)),
        humidity: average(buffer.readings.map((r) => r.humidity)),
        solarRadiation: average(buffer.readings.map((r) => r.solarRadiation)),
      },
    };

    log("Average Service", `${buffer.readings.length} amostras acumuladas (gateway ${gatewayId})`);
    log("Average Service", `Media calculada (gateway ${gatewayId})`);

    appendAverageRecord(record);
    buffer.readings = [];

    log("Average Service", `Leituras individuais descartadas (gateway ${gatewayId})`);
  }

  periodStart = periodEnd;
}

setInterval(flush, AGGREGATION_WINDOW_MS);

const server = net.createServer((socket) => {
  const remote = `${socket.remoteAddress}:${socket.remotePort}`;

  createLineReader(socket, (line) => {
    let message: unknown;

    try {
      message = parseJsonLine(line);
    } catch {
      log("Average Service", `Mensagem JSON invalida recebida de ${remote}: ${line}`);
      const errorResponse: ErrorResponse = { type: "ERROR", message: "JSON invalido" };
      sendMessage(socket, errorResponse);
      return;
    }

    if (!isGatewayReading(message)) {
      log("Average Service", `Mensagem com formato invalido recebida de ${remote}`);
      const errorResponse: ErrorResponse = {
        type: "ERROR",
        message: "Formato de leitura invalido",
      };
      sendMessage(socket, errorResponse);
      return;
    }

    const reading = message;
    log("Average Service", `Leitura recebida de ${reading.gateway}/${reading.sensorNode}`);

    if (!buffers.has(reading.gateway)) {
      buffers.set(reading.gateway, { readings: [] });
    }
    buffers.get(reading.gateway)!.readings.push(reading);

    const ack: AckResponse = { type: "ACK" };
    sendMessage(socket, ack);
  });

  socket.on("error", (err) => {
    log("Average Service", `Conexao com ${remote} encerrada com erro: ${err.message}`);
  });
});

server.on("error", (err) => {
  console.error(`[Average Service] Erro no servidor TCP: ${err.message}`);
});

server.listen(AVERAGE_SERVICE_CONFIG.port, AVERAGE_SERVICE_CONFIG.host, () => {
  log(
    "Average Service",
    `Servico iniciado na porta ${AVERAGE_SERVICE_CONFIG.port} ` +
      `(janela de agregacao: ${AGGREGATION_WINDOW_MS}ms)`
  );
});
