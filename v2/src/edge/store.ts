import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { AverageRow, MetricValues } from "../shared/messages";

export interface BatchSummary {
  gateway: string;
  node: string;
  periodStart: string;
  periodEnd: string;
  samples: number;
  means: MetricValues;
}

export function storeFileFor(gatewayId: string): string {
  return path.resolve(__dirname, "../../data", `edge-${gatewayId}.sqlite`);
}

// um arquivo por gateway. so as medias vao pro banco, as leituras ficam na
// memoria ate o lote fechar
// unidades: temperature em °C, humidity em %, solar_radiation em W/m²
export class EdgeStore {
  private readonly conn: DatabaseSync;
  private readonly insert: StatementSync;
  private readonly selectAfter: StatementSync;
  private readonly selectLatest: StatementSync;

  constructor(readonly file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.conn = new DatabaseSync(file);
    this.conn.exec(`
      CREATE TABLE IF NOT EXISTS batch_averages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gateway TEXT NOT NULL,
        node TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        samples INTEGER NOT NULL,
        temperature REAL NOT NULL,
        humidity REAL NOT NULL,
        solar_radiation REAL NOT NULL
      )
    `);
    this.insert = this.conn.prepare(`
      INSERT INTO batch_averages
        (gateway, node, period_start, period_end, samples, temperature, humidity, solar_radiation)
      VALUES
        ($gateway, $node, $period_start, $period_end, $samples, $temperature, $humidity, $solar_radiation)
    `);
    this.selectAfter = this.conn.prepare(`
      SELECT id, node, period_start, period_end, samples, temperature, humidity, solar_radiation
      FROM batch_averages WHERE id > ? ORDER BY id LIMIT ?
    `);
    this.selectLatest = this.conn.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM batch_averages");
  }

  saveBatch(batch: BatchSummary): void {
    this.insert.run({
      gateway: batch.gateway,
      node: batch.node,
      period_start: batch.periodStart,
      period_end: batch.periodEnd,
      samples: batch.samples,
      temperature: batch.means.temperature,
      humidity: batch.means.humidity,
      solar_radiation: batch.means.solarRadiation,
    });
  }

  averagesAfter(since: number, limit: number): AverageRow[] {
    return this.selectAfter.all(since, limit).map((row) => ({
      id: Number(row.id),
      node: String(row.node),
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      samples: Number(row.samples),
      temperature: Number(row.temperature),
      humidity: Number(row.humidity),
      solarRadiation: Number(row.solar_radiation),
    }));
  }

  latestId(): number {
    return Number(this.selectLatest.get()?.id ?? 0);
  }
}
