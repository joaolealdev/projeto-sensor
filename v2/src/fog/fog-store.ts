import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { AverageRow } from "../shared/messages";
import { nowIso } from "../shared/wire";

export function fogStoreFile(): string {
  return path.resolve(__dirname, "../../data", "fog.sqlite");
}

// as medias de todos os gateways num lugar so. source_id e a linha no banco do gateway;
// a mesma media nunca entra duas vezes (gateway + no + inicio do periodo)
export class FogStore {
  private readonly conn: DatabaseSync;
  private readonly insert: StatementSync;
  private readonly lastId: StatementSync;

  constructor(readonly file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.conn = new DatabaseSync(file);
    this.conn.exec(`
      CREATE TABLE IF NOT EXISTS gateway_averages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gateway TEXT NOT NULL,
        node TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        samples INTEGER NOT NULL,
        temperature REAL NOT NULL,
        humidity REAL NOT NULL,
        solar_radiation REAL NOT NULL,
        received_at TEXT NOT NULL,
        UNIQUE (gateway, node, period_start)
      )
    `);
    this.insert = this.conn.prepare(`
      INSERT OR IGNORE INTO gateway_averages
        (gateway, node, source_id, period_start, period_end, samples, temperature, humidity, solar_radiation, received_at)
      VALUES
        ($gateway, $node, $source_id, $period_start, $period_end, $samples, $temperature, $humidity, $solar_radiation, $received_at)
    `);
    this.lastId = this.conn.prepare(
      "SELECT COALESCE(MAX(source_id), 0) AS id FROM gateway_averages WHERE gateway = ?",
    );
  }

  lastSourceId(gateway: string): number {
    return Number(this.lastId.get(gateway)?.id ?? 0);
  }

  // devolve quantas linhas eram novas
  saveAverages(gateway: string, rows: AverageRow[]): number {
    const receivedAt = nowIso();
    let added = 0;

    this.conn.exec("BEGIN");
    try {
      for (const row of rows) {
        const result = this.insert.run({
          gateway,
          node: row.node,
          source_id: row.id,
          period_start: row.periodStart,
          period_end: row.periodEnd,
          samples: row.samples,
          temperature: row.temperature,
          humidity: row.humidity,
          solar_radiation: row.solarRadiation,
          received_at: receivedAt,
        });
        added += Number(result.changes);
      }
      this.conn.exec("COMMIT");
    } catch (err) {
      this.conn.exec("ROLLBACK");
      throw err;
    }
    return added;
  }
}
