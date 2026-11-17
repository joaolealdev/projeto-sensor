import type { PlotProfile } from "../config/topology";
import type { MetricValues } from "../shared/messages";

// um dia simulado dura DAY_MS. o sol segue uma senoide: temperatura e radiacao
// sobem com ele e a umidade desce. cada talhao tem o seu perfil (hora do dia,
// vieses de temperatura e umidade, parte do sol que chega nele)
const DAY_MS = 120_000;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const jitter = (amplitude: number): number => (Math.random() * 2 - 1) * amplitude;

export function sampleClimate(profile: PlotProfile, now: number = Date.now()): MetricValues {
  const dayFraction = ((now + profile.shiftMs) % DAY_MS) / DAY_MS;
  const sun = Math.max(0, Math.sin(2 * Math.PI * (dayFraction - 0.25)));

  return {
    temperature: round1(18 + profile.tempBiasC + 14 * sun + jitter(0.6)),
    humidity: round1(clamp(82 + profile.humidityBiasPct - 38 * sun + jitter(2), 15, 100)),
    solarRadiation: round1(clamp(1000 * profile.sunShare * sun * (1 + jitter(0.08)), 0, 1100)),
  };
}
