import { DatabaseSync } from "node:sqlite";
import { GATEWAYS } from "../config/topology";
import { fogStoreFile } from "../fog/fog-store";
import { storeFileFor } from "./store";

const target = process.argv[2] || "G1";
const limit = Number(process.argv[3]) || 10;
const isFog = target.toLowerCase() === "fog";

if (!isFog && !GATEWAYS[target]) {
  console.error(`Uso: dev:report -- <${Object.keys(GATEWAYS).join(" | ")} | fog> [quantas linhas]`);
  process.exit(1);
}

const file = isFog ? fogStoreFile() : storeFileFor(target);
const table = isFog ? "gateway_averages" : "batch_averages";
let db: DatabaseSync;
try {
  db = new DatabaseSync(file, { readOnly: true });
} catch {
  console.error(`Ainda nao existe banco em ${file}. Rode ${isFog ? "a fog" : `o gateway ${target}`} primeiro.`);
  process.exit(1);
}

const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id DESC LIMIT ?`).all(limit);
console.log(`${file}: ultimas ${rows.length} medias`);
console.table(rows.reverse());
db.close();
