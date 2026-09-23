const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const processes = [
  ["Average Service + painel", "services/average-service.js"],
  ["Sensor S1", "sensors/sensor-server.js", "S1"],
  ["Sensor S2", "sensors/sensor-server.js", "S2"],
  ["Gateway G1", "gateways/gateway.js", "G1"],
  ["Gateway G2", "gateways/gateway.js", "G2"],
].map(([name, file, ...args]) => {
  const child = spawn(process.execPath, [path.join(root, "dist", file), ...args], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  child.on("error", (error) => console.error(`[${name}] ${error.message}`));
  return child;
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of processes) if (!child.killed) child.kill();
  setTimeout(() => process.exit(0), 200).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log("\nPainel: http://127.0.0.1:3000  ·  Ctrl+C para encerrar\n");
