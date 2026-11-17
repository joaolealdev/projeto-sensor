export interface PlotProfile {
  tempBiasC: number;
  humidityBiasPct: number;
  sunShare: number;
  shiftMs: number;
}

export interface NodeSpec {
  id: string;
  host: string;
  port: number;
  profile: PlotProfile;
}

export interface GatewaySpec {
  id: string;
  host: string;
  fogPort: number;
  nodeIds: string[];
  readingsPerBatch: number;
}

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// um no por talhao; para rodar em outra maquina e so trocar o host
export const NODES: Record<string, NodeSpec> = {
  N1: {
    id: "N1",
    host: "127.0.0.1",
    port: 7101,
    profile: { tempBiasC: 0, humidityBiasPct: 0, sunShare: 1, shiftMs: 15_000 },
  },
  N2: {
    id: "N2",
    host: "127.0.0.1",
    port: 7102,
    profile: { tempBiasC: 1.5, humidityBiasPct: -6, sunShare: 0.95, shiftMs: 30_000 },
  },
  N3: {
    id: "N3",
    host: "127.0.0.1",
    port: 7103,
    profile: { tempBiasC: -1, humidityBiasPct: 8, sunShare: 0.85, shiftMs: 45_000 },
  },
  N4: {
    id: "N4",
    host: "127.0.0.1",
    port: 7104,
    profile: { tempBiasC: 2, humidityBiasPct: -10, sunShare: 1, shiftMs: 60_000 },
  },
  N5: {
    id: "N5",
    host: "127.0.0.1",
    port: 7105,
    profile: { tempBiasC: 0.5, humidityBiasPct: 4, sunShare: 0.9, shiftMs: 75_000 },
  },
  N6: {
    id: "N6",
    host: "127.0.0.1",
    port: 7106,
    profile: { tempBiasC: -0.5, humidityBiasPct: 3, sunShare: 0.8, shiftMs: 90_000 },
  },
};

// servico de calculo, o mesmo para todos os gateways (gRPC, contrato em proto/calc.proto)
export const CALC_SERVICE = { host: "127.0.0.1", port: 7200 };

// cada gateway cuida de tres nos e atende a fog na fogPort
export const GATEWAYS: Record<string, GatewaySpec> = {
  G1: {
    id: "G1",
    host: "127.0.0.1",
    fogPort: 7301,
    nodeIds: ["N1", "N2", "N3"],
    readingsPerBatch: envInt("FARM_READINGS_PER_BATCH", 6),
  },
  G2: {
    id: "G2",
    host: "127.0.0.1",
    fogPort: 7302,
    nodeIds: ["N4", "N5", "N6"],
    readingsPerBatch: envInt("FARM_READINGS_PER_BATCH", 6),
  },
};

export const PUSH_INTERVAL_MS = envInt("FARM_PUSH_MS", 1500);
export const RECONNECT_MS = { first: 1000, max: 15000 };
// quanto o gateway espera pela resposta do calculo (deadline do gRPC)
export const CALC_TIMEOUT_MS = 5000;
// de quanto em quanto tempo a fog pergunta aos gateways, e quanto espera pela resposta
export const FOG_POLL_MS = envInt("FARM_FOG_POLL_MS", 5000);
export const FOG_TIMEOUT_MS = 5000;
