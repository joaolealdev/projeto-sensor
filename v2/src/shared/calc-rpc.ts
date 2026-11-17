import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";

// le o proto/calc.proto na hora de rodar (sem gerar codigo); servidor e cliente
// usam o mesmo arquivo

// os mesmos tipos do .proto, so para o TypeScript
export interface NamedSeries {
  name: string;
  values: number[];
}

export interface AverageRequest {
  series: NamedSeries[];
}

export interface NamedMean {
  name: string;
  mean: number;
}

export interface AverageReply {
  means: NamedMean[];
}

// o que o gateway enxerga do servico: um metodo Average com callback no final
export interface MeanCalculatorClient extends grpc.Client {
  Average(
    request: AverageRequest,
    options: grpc.CallOptions,
    callback: grpc.requestCallback<AverageReply>,
  ): grpc.ClientUnaryCall;
}

// .service e usado pelo servidor (addService) e o new cria o cliente
interface MeanCalculatorService {
  new (
    address: string,
    credentials: grpc.ChannelCredentials,
    options?: Partial<grpc.ChannelOptions>,
  ): MeanCalculatorClient;
  service: grpc.ServiceDefinition;
}

// caminho absoluto, funciona de qualquer pasta
const PROTO_FILE = path.resolve(__dirname, "../../proto/calc.proto");

// arrays: lista vazia continua lista; defaults: texto vazio e 0 aparecem
const definition = loadSync(PROTO_FILE, { arrays: true, defaults: true });
const loaded = grpc.loadPackageDefinition(definition);

export const MeanCalculator = (loaded.smartfarm as unknown as { MeanCalculator: MeanCalculatorService })
  .MeanCalculator;
