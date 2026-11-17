import { GATEWAYS, NODES } from "../config/topology";
import { METRICS, UNITS, type MetricValues, type ReadingMessage } from "../shared/messages";
import { log, logError } from "../shared/wire";
import { requestMeans } from "./calc-client";
import { startFogServer } from "./fog-server";
import { NodeLink } from "./node-link";
import { EdgeStore, storeFileFor } from "./store";

const gatewayId = process.argv[2] || process.env.GATEWAY_ID || "G1";
const spec = GATEWAYS[gatewayId];

if (!spec) {
  console.error(
    `[gateway] "${gatewayId}" nao existe em src/config/topology.ts. Opcoes: ${Object.keys(GATEWAYS).join(", ")}`,
  );
  process.exit(1);
}

const missingNodes = spec.nodeIds.filter((id) => !NODES[id]);
if (missingNodes.length > 0) {
  console.error(`[gateway] ${gatewayId} aponta para nos inexistentes: ${missingNodes.join(", ")}`);
  process.exit(1);
}

const store = new EdgeStore(storeFileFor(gatewayId));

// leituras esperando o lote fechar, uma lista por no
const pending = new Map<string, ReadingMessage[]>();

function collect(reading: ReadingMessage): void {
  const batch = pending.get(reading.node) ?? [];
  batch.push(reading);

  if (batch.length < spec.readingsPerBatch) {
    pending.set(reading.node, batch);
    return;
  }

  pending.set(reading.node, []);
  void summarize(reading.node, batch);
}

async function summarize(nodeId: string, batch: ReadingMessage[]): Promise<void> {
  const first = batch[0];
  const last = batch[batch.length - 1];
  if (!first || !last) return;

  try {
    const series = Object.fromEntries(METRICS.map((metric) => [metric, batch.map((r) => r[metric])]));
    const means = await requestMeans(series);
    const values: MetricValues = {
      temperature: means.temperature,
      humidity: means.humidity,
      solarRadiation: means.solarRadiation,
    };

    store.saveBatch({
      gateway: gatewayId,
      node: nodeId,
      periodStart: first.at,
      periodEnd: last.at,
      samples: batch.length,
      means: values,
    });
    log(
      gatewayId,
      `${nodeId}: ${batch.length} leituras -> ${METRICS.map((m) => `${values[m]} ${UNITS[m]}`).join(" | ")}`,
    );
  } catch (err) {
    logError(gatewayId, `lote de ${nodeId} descartado: ${(err as Error).message}`);
  }
}

log(
  gatewayId,
  `iniciado: nos ${spec.nodeIds.join(", ")}, lote de ${spec.readingsPerBatch} leituras, banco em ${store.file}`,
);
startFogServer(spec, store);
for (const id of spec.nodeIds) {
  const node = NODES[id];
  if (node) new NodeLink(gatewayId, node, collect).start();
}
