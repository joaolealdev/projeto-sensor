import { FOG_POLL_MS, GATEWAYS } from "../config/topology";
import { log } from "../shared/wire";
import { FogStore, fogStoreFile } from "./fog-store";
import { GatewayLink } from "./gateway-link";

const TAG = "Fog";
const store = new FogStore(fogStoreFile());

const links = Object.values(GATEWAYS).map(
  (gateway) =>
    new GatewayLink(TAG, gateway, store.lastSourceId(gateway.id), (reply) => {
      const added = store.saveAverages(reply.gateway, reply.rows);
      if (reply.rows.length === 0) return;
      const nodes = [...new Set(reply.rows.map((row) => row.node))].join(", ");
      log(TAG, `${reply.gateway}: ${added} medias novas (${nodes})`);
    }),
);

log(
  TAG,
  `iniciada: gateways ${Object.keys(GATEWAYS).join(", ")}, pergunta a cada ${FOG_POLL_MS / 1000} s, banco em ${store.file}`,
);
for (const link of links) link.start();
setInterval(() => links.forEach((link) => link.tick()), FOG_POLL_MS);
