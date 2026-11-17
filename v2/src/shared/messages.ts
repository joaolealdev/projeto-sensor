export const METRICS = ["temperature", "humidity", "solarRadiation"] as const;
export type MetricName = (typeof METRICS)[number];
export type MetricValues = Record<MetricName, number>;

export const UNITS: Record<MetricName, string> = {
  temperature: "°C",
  humidity: "%",
  solarRadiation: "W/m²",
};

// no -> gateway, mandada a cada intervalo sem o gateway pedir
export interface ReadingMessage extends MetricValues {
  type: "READING";
  node: string;
  at: string;
}

// no -> gateway, quando ja existe outro gateway conectado
// (o contrato do gRPC fica em proto/calc.proto)
export interface ErrorMessage {
  type: "ERROR";
  message: string;
}

// fog -> gateway: pede as medias gravadas depois da linha `since` do banco do gateway
export interface AskMessage {
  type: "ASK";
  since: number;
}

export interface AverageRow extends MetricValues {
  id: number;
  node: string;
  periodStart: string;
  periodEnd: string;
  samples: number;
}

// gateway -> fog. `latest` e a ultima linha do banco, e a fog compara com a ultima que recebeu
export interface AveragesMessage {
  type: "AVERAGES";
  gateway: string;
  latest: number;
  rows: AverageRow[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isReading(value: unknown): value is ReadingMessage {
  return (
    isRecord(value) &&
    value.type === "READING" &&
    typeof value.node === "string" &&
    typeof value.at === "string" &&
    METRICS.every((metric) => isFiniteNumber(value[metric]))
  );
}

export function isErrorMessage(value: unknown): value is ErrorMessage {
  return isRecord(value) && value.type === "ERROR" && typeof value.message === "string";
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isAsk(value: unknown): value is AskMessage {
  return isRecord(value) && value.type === "ASK" && isCount(value.since);
}

function isAverageRow(value: unknown): value is AverageRow {
  return (
    isRecord(value) &&
    isCount(value.id) &&
    typeof value.node === "string" &&
    typeof value.periodStart === "string" &&
    typeof value.periodEnd === "string" &&
    isCount(value.samples) &&
    METRICS.every((metric) => isFiniteNumber(value[metric]))
  );
}

export function isAverages(value: unknown): value is AveragesMessage {
  return (
    isRecord(value) &&
    value.type === "AVERAGES" &&
    typeof value.gateway === "string" &&
    isCount(value.latest) &&
    Array.isArray(value.rows) &&
    value.rows.every(isAverageRow)
  );
}
