import * as grpc from "@grpc/grpc-js";
import { CALC_SERVICE } from "../config/topology";
import { MeanCalculator, type AverageReply, type AverageRequest } from "../shared/calc-rpc";
import { log, logError } from "../shared/wire";

const TAG = "Calc Service";

function mean(values: number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 100) / 100;
}

// devolve o motivo se o pedido for invalido, senao null
function findProblem(request: AverageRequest): string | null {
  if (request.series.length === 0) return "o pedido nao tem nenhuma serie";

  const seen = new Set<string>();
  for (const { name, values } of request.series) {
    if (!name) return "toda serie precisa de um nome";
    if (seen.has(name)) return `a serie "${name}" aparece mais de uma vez`;
    seen.add(name);
    if (values.length === 0) return `a serie "${name}" esta vazia`;
    if (!values.every(Number.isFinite)) return `a serie "${name}" tem um valor que nao e numero`;
  }
  return null;
}

// a funcao que o gateway chama; nao guarda nada entre as chamadas
function average(
  call: grpc.ServerUnaryCall<AverageRequest, AverageReply>,
  callback: grpc.sendUnaryData<AverageReply>,
): void {
  const problem = findProblem(call.request);
  if (problem) {
    logError(TAG, `pedido recusado: ${problem}`);
    callback({ code: grpc.status.INVALID_ARGUMENT, details: problem });
    return;
  }

  const means = call.request.series.map(({ name, values }) => ({ name, mean: mean(values) }));
  callback(null, { means });
  log(TAG, `${means.length} series calculadas`);
}

const server = new grpc.Server();
server.addService(MeanCalculator.service, { Average: average });

server.bindAsync(`0.0.0.0:${CALC_SERVICE.port}`, grpc.ServerCredentials.createInsecure(), (error, port) => {
  if (error) {
    logError(TAG, `servidor gRPC: ${error.message}`);
    process.exit(1);
  }
  log(TAG, `servico de calculo (gRPC) escutando na porta ${port}`);
});
