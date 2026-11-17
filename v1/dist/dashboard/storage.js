"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendReading = appendReading;
exports.recentReadings = recentReadings;
exports.averageRecords = averageRecords;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const dataDir = node_path_1.default.resolve(__dirname, "../../data");
const readingsFile = node_path_1.default.join(dataDir, "readings.jsonl");
const averagesFile = node_path_1.default.join(dataDir, "averages.json");
function appendReading(reading) {
    node_fs_1.default.mkdirSync(dataDir, { recursive: true });
    node_fs_1.default.appendFileSync(readingsFile, `${JSON.stringify(reading)}\n`, "utf8");
}
function recentReadings(maxBytes = 256 * 1024) {
    if (!node_fs_1.default.existsSync(readingsFile))
        return [];
    const fd = node_fs_1.default.openSync(readingsFile, "r");
    try {
        const size = node_fs_1.default.fstatSync(fd).size;
        const start = Math.max(0, size - maxBytes);
        const buffer = Buffer.alloc(size - start);
        node_fs_1.default.readSync(fd, buffer, 0, buffer.length, start);
        const lines = buffer.toString("utf8").split("\n");
        if (start > 0)
            lines.shift(); // First line may begin in the middle of a record.
        return lines.flatMap((line) => {
            try {
                const value = JSON.parse(line);
                return value.type === "GATEWAY_READING" && Number.isFinite(Date.parse(value.timestamp))
                    ? [value]
                    : [];
            }
            catch {
                return [];
            }
        });
    }
    finally {
        node_fs_1.default.closeSync(fd);
    }
}
function averageRecords() {
    if (!node_fs_1.default.existsSync(averagesFile))
        return [];
    const value = JSON.parse(node_fs_1.default.readFileSync(averagesFile, "utf8"));
    if (!Array.isArray(value))
        return [];
    return value.filter((record) => Boolean(record && typeof record.gateway === "string" &&
        Number.isFinite(Date.parse(record.periodEnd)) &&
        Number.isFinite(record.samples) && record.averages &&
        Number.isFinite(record.averages.temperature) &&
        Number.isFinite(record.averages.humidity) &&
        Number.isFinite(record.averages.solarRadiation)));
}
