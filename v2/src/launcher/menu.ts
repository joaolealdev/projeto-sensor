import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import type { Readable } from "node:stream";
import { CALC_SERVICE, GATEWAYS, NODES } from "../config/topology";

type Kind = "calc" | "node" | "gateway" | "fog";

interface Job {
  name: string;
  kind: Kind;
  script: string;
  args: string[];
  listens: string;
}

const ROOT = path.resolve(__dirname, "../..");
const COLORS: Record<Kind, string> = { calc: "35", node: "32", gateway: "36", fog: "33" };

// a lista sai da topologia: talhao ou gateway novo em topology.ts aparece aqui sozinho
const JOBS: Job[] = [
  { name: "Calc", kind: "calc", script: "src/calc-service/calc-service.ts", args: [], listens: String(CALC_SERVICE.port) },
  ...Object.values(NODES).map((node) => ({
    name: node.id,
    kind: "node" as const,
    script: "src/field-node/node-server.ts",
    args: [node.id],
    listens: String(node.port),
  })),
  ...Object.values(GATEWAYS).map((gateway) => ({
    name: gateway.id,
    kind: "gateway" as const,
    script: "src/edge/gateway.ts",
    args: [gateway.id],
    listens: `${gateway.fogPort} (fog)`,
  })),
  { name: "Fog", kind: "fog", script: "src/fog/fog.ts", args: [], listens: "-" },
];

const running = new Map<string, ChildProcess>();
const stopping = new Set<string>();
let closing = false;

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: string, text: string): string => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// o que for digitado enquanto o menu esta ocupado fica na fila e e lido na proxima pergunta
const typed: string[] = [];
let waiting: ((line: string) => void) | null = null;

rl.on("line", (line) => {
  if (waiting) {
    const answer = waiting;
    waiting = null;
    answer(line);
  } else {
    typed.push(line);
  }
});

function ask(question: string): Promise<string> {
  rl.setPrompt(question);
  const queued = typed.shift();
  if (queued !== undefined) return Promise.resolve(queued);

  rl.prompt();
  return new Promise((resolve) => {
    waiting = resolve;
  });
}

// o log dos processos chega a qualquer hora; apaga a linha do prompt, escreve e desenha o prompt de novo
function printLog(line: string): void {
  if (!process.stdout.isTTY) {
    console.log(line);
    return;
  }
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  console.log(line);
  if (waiting) rl.prompt(true);
}

function pipeLines(stream: Readable | null, colorCode: string): void {
  if (!stream) return;
  readline.createInterface({ input: stream }).on("line", (line) => printLog(paint(colorCode, line)));
}

function startJob(job: Job): void {
  if (running.has(job.name)) return;

  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", "tsx", job.script, ...job.args], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  running.set(job.name, child);
  pipeLines(child.stdout, COLORS[job.kind]);
  pipeLines(child.stderr, "31");

  child.on("exit", (code) => {
    running.delete(job.name);
    if (stopping.delete(job.name) || closing) return;
    printLog(paint("31", `[${job.name}] parou sozinho (codigo ${code})`));
  });
}

async function stopJob(job: Job): Promise<void> {
  const child = running.get(job.name);
  if (!child) return;

  stopping.add(job.name);
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill();
  await exited;
}

// sobe na ordem da lista (calculo, nos, gateways, fog), com uma pausa quando muda o tipo
async function startJobs(jobs: Job[]): Promise<void> {
  const pending = jobs.filter((job) => !running.has(job.name));
  if (pending.length === 0) {
    console.log("tudo isso ja esta rodando");
    return;
  }

  for (const [index, job] of pending.entries()) {
    startJob(job);
    const next = pending[index + 1];
    if (next && next.kind !== job.kind) await sleep(1000);
  }
}

async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  console.log("\nparando tudo...");
  await Promise.all(JOBS.filter((job) => running.has(job.name)).map(stopJob));
  rl.close();
  process.exit(0);
}

function printMenu(): void {
  const on = JOBS.filter((job) => running.has(job.name)).map((job) => job.name);
  const nodes = Object.keys(NODES).length;
  const gateways = Object.keys(GATEWAYS).length;

  console.log(`
==== Smart Farm v2 ====
rodando agora: ${on.length === 0 ? "nada" : on.join(", ")} (${on.length} de ${JOBS.length})

  1  Subir tudo (calculo, ${nodes} talhoes, ${gateways} gateways e a fog)
  2  Subir so uma area Edge (um gateway com os talhoes dele)
  3  Ligar ou desligar um processo (para testar falhas)
  4  Ver o que esta rodando
  5  Ver as medias gravadas
  0  Sair e parar tudo
`);
}

function printStatus(): void {
  console.log("\n  processo  estado    porta");
  for (const job of JOBS) {
    const state = running.has(job.name) ? paint("32", "rodando") : "parado ";
    console.log(`  ${job.name.padEnd(8)}  ${state}   ${job.listens}`);
  }
}

async function chooseArea(): Promise<void> {
  const gateways = Object.values(GATEWAYS);
  console.log("\nQual area?");
  gateways.forEach((gateway, index) => console.log(`  ${index + 1}  ${gateway.id}: ${gateway.nodeIds.join(", ")}`));

  const gateway = gateways[Number((await ask("numero (Enter volta)> ")).trim()) - 1];
  if (!gateway) return;

  const names = new Set(["Calc", ...gateway.nodeIds, gateway.id]);
  await startJobs(JOBS.filter((job) => names.has(job.name)));
}

async function toggleJobs(): Promise<void> {
  for (;;) {
    console.log("\nDigite o numero para ligar ou desligar (Enter volta):");
    JOBS.forEach((job, index) => {
      const state = running.has(job.name) ? paint("32", "rodando") : "parado";
      console.log(`  ${String(index + 1).padStart(2)}  ${job.name.padEnd(5)} ${state}`);
    });

    const answer = (await ask("numero> ")).trim();
    if (!answer) return;

    const job = JOBS[Number(answer) - 1];
    if (!job) {
      console.log("numero invalido");
    } else if (running.has(job.name)) {
      await stopJob(job);
      console.log(`${job.name} desligado`);
    } else {
      startJob(job);
      await sleep(800);
    }
  }
}

async function showReport(): Promise<void> {
  const targets = [...Object.keys(GATEWAYS), "fog"];
  console.log("\nDe onde?");
  targets.forEach((target, index) => console.log(`  ${index + 1}  ${target}`));

  const target = targets[Number((await ask("numero (Enter volta)> ")).trim()) - 1];
  if (!target) return;

  const limit = (await ask("quantas linhas (Enter = 10)> ")).trim() || "10";
  spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", "tsx", "src/edge/report.ts", target, limit], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

async function main(): Promise<void> {
  console.log("Os logs dos processos aparecem aqui embaixo. Enter mostra o menu de novo.");

  for (;;) {
    printMenu();
    const choice = (await ask("opcao> ")).trim();

    if (choice === "1") await startJobs(JOBS);
    else if (choice === "2") await chooseArea();
    else if (choice === "3") await toggleJobs();
    else if (choice === "4") printStatus();
    else if (choice === "5") await showReport();
    else if (choice === "0") await shutdown();
    else if (choice) console.log("opcao invalida");
  }
}

process.on("SIGINT", () => void shutdown());
process.on("exit", () => running.forEach((child) => child.kill()));
rl.on("close", () => void shutdown());
void main();
