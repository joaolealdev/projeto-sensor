export interface SensorNodeConfig {
  id: string;
  host: string;
  port: number;
}

export interface GatewayConfig {
  id: string;
  sensorNodes: SensorNodeConfig[];
  pollIntervalMs: number;
}

// --- Servidores de sensores (IoT simulados) ---
export const SENSOR_NODES: Record<string, SensorNodeConfig> = {
  S1: { id: "S1", host: "127.0.0.1", port: 5001 },
  S2: { id: "S2", host: "127.0.0.1", port: 5002 },
};

// --- Microsservico de processamento/agregacao ---
export const AVERAGE_SERVICE_CONFIG = {
  host: "127.0.0.1",
  port: 6000,
};

// --- Gateways Edge ---
// Cada gateway pode ser associado a um ou mais servidores de sensores,
// permitindo escalar a arquitetura no futuro sem mudar o codigo dos
// componentes, apenas esta configuracao.
export const GATEWAYS: Record<string, GatewayConfig> = {
  G1: { id: "G1", sensorNodes: [SENSOR_NODES.S1], pollIntervalMs: 2000 },
  G2: { id: "G2", sensorNodes: [SENSOR_NODES.S2], pollIntervalMs: 2000 },
};

// --- Parametros de rede e resiliencia ---
export const CONNECT_TIMEOUT_MS = 3000;
export const RESPONSE_TIMEOUT_MS = 3000;
export const MAX_READ_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 1000;

// --- Janela de agregacao do Average Service ---
export const AGGREGATION_WINDOW_MS = 10000;
