"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDashboardServer = startDashboardServer;
const node_http_1 = __importDefault(require("node:http"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("../config/config");
const storage_1 = require("./storage");
const metrics = ["temperature", "humidity", "solarRadiation"];
const windows = { "1h": 3600000, "24h": 86400000, "7d": 604800000 };
const webDir = node_path_1.default.resolve(__dirname, "../../web");
const assets = {
    "/": "index.html",
    "/index.html": "index.html",
    "/styles.css": "styles.css",
    "/app.js": "app.js",
};
const mime = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
};
function snapshot(windowKey, gateway) {
    const now = Date.now();
    const since = now - windows[windowKey];
    const recent = (0, storage_1.recentReadings)();
    const selected = gateway === "all" ? recent : recent.filter((r) => r.gateway === gateway);
    const latest = new Map();
    for (const reading of recent) {
        const previous = latest.get(reading.sensorNode);
        if (!previous || reading.timestamp > previous.timestamp)
            latest.set(reading.sensorNode, reading);
    }
    const sensors = Object.values(config_1.SENSOR_NODES).map((sensor) => {
        const reading = latest.get(sensor.id) ?? null;
        const age = reading ? now - Date.parse(reading.timestamp) : Infinity;
        const assignedGateway = Object.values(config_1.GATEWAYS).find((g) => g.sensorNodes.some((n) => n.id === sensor.id));
        return {
            id: sensor.id,
            gateway: assignedGateway?.id ?? "—",
            status: age >= 0 && age <= 15000 ? "online" : "offline",
            reading,
        };
    });
    const active = sensors.filter((s) => s.status === "online" && s.reading &&
        (gateway === "all" || s.gateway === gateway));
    const current = active.length ? Object.fromEntries(metrics.map((metric) => [
        metric,
        active.reduce((sum, sensor) => sum + sensor.reading[metric], 0) / active.length,
    ])) : null;
    const records = (0, storage_1.averageRecords)().filter((record) => Date.parse(record.periodEnd) >= since &&
        (gateway === "all" || record.gateway === gateway));
    const buckets = new Map();
    const bucketMs = Math.max(1000, Math.ceil(windows[windowKey] / 100));
    for (const record of records) {
        addBucket(buckets, record, bucketMs);
    }
    const series = [...buckets].map(([id, points]) => ({
        gateway: id,
        points: [...points.values()].sort((a, b) => a.time - b.time).map((point) => ({
            time: new Date(point.time).toISOString(),
            ...Object.fromEntries(metrics.map((metric) => [metric, +(point.sums[metric] / point.samples).toFixed(2)])),
        })),
    })).sort((a, b) => a.gateway.localeCompare(b.gateway));
    return {
        generatedAt: new Date(now).toISOString(),
        window: windowKey,
        gateway,
        sensors,
        current,
        sampleCount: records.reduce((sum, r) => sum + r.samples, 0),
        series,
        readings: selected.filter((r) => Date.parse(r.timestamp) >= since).slice(-30).reverse(),
    };
}
function addBucket(buckets, record, bucketMs) {
    let gatewayBuckets = buckets.get(record.gateway);
    if (!gatewayBuckets) {
        gatewayBuckets = new Map();
        buckets.set(record.gateway, gatewayBuckets);
    }
    const bucket = Math.floor(Date.parse(record.periodEnd) / bucketMs);
    const existing = gatewayBuckets.get(bucket) ?? {
        time: Date.parse(record.periodEnd),
        samples: 0,
        sums: { temperature: 0, humidity: 0, solarRadiation: 0 },
    };
    existing.time = Math.max(existing.time, Date.parse(record.periodEnd));
    existing.samples += record.samples;
    for (const metric of metrics)
        existing.sums[metric] += record.averages[metric] * record.samples;
    gatewayBuckets.set(bucket, existing);
}
function startDashboardServer() {
    const port = Number(process.env.DASHBOARD_PORT ?? 3000);
    const host = process.env.DASHBOARD_HOST ?? "127.0.0.1";
    const server = node_http_1.default.createServer((request, response) => {
        const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'");
        if (request.method !== "GET") {
            response.writeHead(405, { "Content-Type": "application/json; charset=utf-8", Allow: "GET" });
            response.end(JSON.stringify({ error: "Metodo nao permitido" }));
            return;
        }
        if (url.pathname === "/api/dashboard") {
            const windowKey = url.searchParams.get("window") ?? "1h";
            const gateway = url.searchParams.get("gateway") ?? "all";
            if (!Object.prototype.hasOwnProperty.call(windows, windowKey) ||
                (gateway !== "all" && !Object.prototype.hasOwnProperty.call(config_1.GATEWAYS, gateway))) {
                response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
                response.end(JSON.stringify({ error: "Filtro invalido" }));
                return;
            }
            try {
                response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
                response.end(JSON.stringify(snapshot(windowKey, gateway)));
            }
            catch (err) {
                console.error("[Dashboard] Falha ao carregar historico:", err);
                if (!response.headersSent)
                    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
                response.end(JSON.stringify({ error: "Nao foi possivel carregar os dados" }));
            }
            return;
        }
        const asset = assets[url.pathname];
        if (!asset) {
            response.writeHead(404);
            response.end("Nao encontrado");
            return;
        }
        const file = node_path_1.default.join(webDir, asset);
        response.writeHead(200, { "Content-Type": mime[node_path_1.default.extname(file)] });
        const stream = node_fs_1.default.createReadStream(file);
        stream.on("error", (err) => {
            console.error("[Dashboard] Falha ao servir arquivo:", err);
            response.destroy(err);
        });
        stream.pipe(response);
    });
    server.on("error", (err) => console.error(`[Dashboard] Falha no servidor HTTP: ${err.message}`));
    server.listen(port, host, () => console.log(`[Dashboard] http://${host}:${port}`));
}
