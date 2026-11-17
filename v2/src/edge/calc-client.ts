import * as grpc from "@grpc/grpc-js";
import { CALC_SERVICE, CALC_TIMEOUT_MS, RECONNECT_MS } from "../config/topology";
import { MeanCalculator, type AverageRequest } from "../shared/calc-rpc";

const address = `${CALC_SERVICE.host}:${CALC_SERVICE.port}`;

// um cliente so para o processo inteiro: o gRPC reaproveita a conexao e religa
// sozinho se o calculo cair, com a mesma espera crescente usada nos nos
const client = new MeanCalculator(address, grpc.credentials.createInsecure(), {
  "grpc.initial_reconnect_backoff_ms": RECONNECT_MS.first,
  "grpc.max_reconnect_backoff_ms": RECONNECT_MS.max,
});

function describe(error: grpc.ServiceError): string {
  switch (error.code) {
    case grpc.status.DEADLINE_EXCEEDED:
      return "tempo esgotado";
    case grpc.status.UNAVAILABLE:
      return `servico de calculo fora do ar (${address})`;
    case grpc.status.INVALID_ARGUMENT:
      return `servico recusou o pedido: ${error.details}`;
    default:
      return `${grpc.status[error.code]}: ${error.details}`;
  }
}

// recebe { nome: [numeros] } e devolve { nome: media }
export function requestMeans(series: Record<string, number[]>): Promise<Record<string, number>> {
  const request: AverageRequest = {
    series: Object.entries(series).map(([name, values]) => ({ name, values })),
  };

  return new Promise((resolve, reject) => {
    client.Average(request, { deadline: Date.now() + CALC_TIMEOUT_MS }, (error, reply) => {
      if (error) {
        reject(new Error(describe(error)));
        return;
      }
      if (!reply) {
        reject(new Error("sem resultado"));
        return;
      }

      const means = Object.fromEntries(reply.means.map(({ name, mean }) => [name, mean]));
      const missing = Object.keys(series).filter((name) => !(name in means));
      if (missing.length > 0) {
        reject(new Error(`resposta sem as series: ${missing.join(", ")}`));
        return;
      }
      resolve(means);
    });
  });
}
