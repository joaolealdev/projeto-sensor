# Smart Farm v2

Na v2 os nós de campo (um por talhão) mandam as leituras de clima sozinhos para os gateways. Cada gateway separa as leituras por nó, fecha um lote a cada 6, pede as médias a um serviço de cálculo e guarda o resultado num SQLite só dele. A Fog fica acima dos gateways: busca as médias de todos eles e junta tudo num banco só.

Existem três tipos de conversa:

- do nó para o gateway: socket TCP, com uma mensagem JSON por linha;
- do gateway para o serviço de cálculo: gRPC. O gateway chama a função `Average(...)` como se ela fosse local;
- da Fog para o gateway: socket TCP, também com JSON por linha. A Fog pergunta (`ASK`) e o gateway responde (`AVERAGES`).

```
 N1 :7101 -- socket: READING -->+
 N2 :7102 -- socket: READING -->+--> G1 -- gRPC: Average() --> Calc Service :7200
 N3 :7103 -- socket: READING -->+     |                              ^
                                      v                              |
                             data/edge-G1.sqlite                     |
                                                                     |
 N4 :7104 -- socket: READING -->+                                    |
 N5 :7105 -- socket: READING -->+--> G2 -- gRPC: Average() ----------+
 N6 :7106 -- socket: READING -->+     |
                                      v
                             data/edge-G2.sqlite
```

A Fog liga nos dois gateways, por uma porta de cada um (a 7301 do G1 e a 7302 do G2):

```
 G1 :7301 <-- socket: ASK / AVERAGES --+
                                       +-- Fog -- data/fog.sqlite
 G2 :7302 <-- socket: ASK / AVERAGES --+
```

## O que cada parte faz

- Nó de campo (`src/field-node/`): servidor TCP que simula temperatura, umidade e incidência solar e manda uma leitura a cada 1,5 s para o gateway que estiver conectado. Os seis nós rodam o mesmo programa.
- Gateway (`src/edge/`): liga nos nós, monta os lotes e chama o serviço de cálculo. Grava as médias no SQLite e responde à Fog, numa porta separada, com as médias que ela ainda não tem.
- Serviço de cálculo (`src/calc-service/`): servidor gRPC sem estado. Recebe séries de números e devolve a média de cada uma.
- Contrato do gRPC: o `proto/calc.proto` descreve a função e os dados, e o `src/shared/calc-rpc.ts` carrega esse arquivo para o servidor e para o cliente.
- Fog (`src/fog/`): liga nos gateways, pergunta de tempos em tempos pelas médias novas e guarda todas em `data/fog.sqlite`.
- Menu (`src/launcher/menu.ts`): sobe e derruba os processos acima por um menu no terminal.

A topologia e os tempos ficam em `src/config/topology.ts`. O formato das mensagens de socket está em `src/shared/messages.ts`.

## Topologia

| ID | Papel | Porta | Liga em |
| --- | --- | --- | --- |
| N1, N2, N3 | nós de campo (talhões) | 7101 a 7103 | atendidos pelo G1 |
| N4, N5, N6 | nós de campo (talhões) | 7104 a 7106 | atendidos pelo G2 |
| G1 | gateway | 7301 (só para a Fog) | N1, N2 e N3 (socket) e o cálculo (gRPC) |
| G2 | gateway | 7302 (só para a Fog) | N4, N5 e N6 (socket) e o cálculo (gRPC) |
| Calc | serviço de cálculo | 7200 | usado pelo G1 e pelo G2 |
| Fog | fog | não escuta | G1 e G2 (socket) |

### Perfil de cada talhão

O que diferencia um talhão do outro é o `profile` dele em `src/config/topology.ts`, e não o código, que é um só:

| Nó | Temperatura (°C) | Umidade (pontos %) | Sol que chega | Hora do dia (deslocamento) |
| --- | --- | --- | --- | --- |
| N1 | 0 | 0 | 100 % | 15 s |
| N2 | +1,5 | -6 | 95 % | 30 s |
| N3 | -1 | +8 | 85 % | 45 s |
| N4 | +2 | -10 | 100 % | 60 s |
| N5 | +0,5 | +4 | 90 % | 75 s |
| N6 | -0,5 | +3 | 80 % | 90 s |

Os dois primeiros valores são somados à temperatura e à umidade da curva do dia, o sol que chega multiplica a radiação e o deslocamento escolhe a hora do dia em que o talhão está. O N4, por exemplo, é quente, seco e de sol pleno, e o N3 é mais fresco, úmido e sombreado.

Para acrescentar um talhão não precisa escrever código: é uma entrada nova em `NODES` (id, host, porta e perfil), o id dele na lista `nodeIds` de um gateway e `npm run dev:field -- N7`.

## Rodar

Precisa do Node.js 24 ou mais novo. O TypeScript roda direto, sem build:

```bash
cd v2
npm install
```

O jeito mais simples é o menu, que sobe os processos no mesmo terminal e mostra o log de todos:

```bash
npm run dev:menu
```

Ele pergunta o que fazer: subir tudo, subir só uma área Edge, ligar ou desligar um processo (para testar falhas), ver o que está rodando ou ver as médias gravadas. É só digitar o número da opção. Quando você sai, ele para tudo.

Se preferir, um comando por terminal:

```bash
npm run dev:calc
npm run dev:field -- N1
npm run dev:field -- N2
npm run dev:field -- N3
npm run dev:gateway -- G1
```

Para a segunda área Edge:

```bash
npm run dev:field -- N4
npm run dev:field -- N5
npm run dev:field -- N6
npm run dev:gateway -- G2
```

E a Fog, que pode subir antes ou depois dos gateways:

```bash
npm run dev:fog
```

Para ver o que foi gravado (por padrão as 10 últimas linhas do G1; o segundo argumento muda a quantidade):

```bash
npm run dev:report -- G1
npm run dev:report -- G1 25
npm run dev:report -- fog
```

O `npm run typecheck` confere os tipos, já que o `tsx` não faz isso.

Três variáveis de ambiente deixam a demonstração mais rápida:

| Variável | Padrão | O que muda |
| --- | --- | --- |
| `FARM_PUSH_MS` | 1500 | intervalo, em ms, entre as leituras que os nós mandam |
| `FARM_READINGS_PER_BATCH` | 6 | quantas leituras de um nó formam um lote |
| `FARM_FOG_POLL_MS` | 5000 | de quanto em quanto tempo, em ms, a Fog pergunta aos gateways |

No PowerShell: `$env:FARM_PUSH_MS = "300"; $env:FARM_READINGS_PER_BATCH = "4"` antes dos comandos acima. No bash: `FARM_PUSH_MS=300 npm run dev:field -- N1`.

## O caminho de uma leitura

1. O nó fica escutando na porta dele. Um relógio interno faz passar um "dia" de 2 minutos: o sol sobe e desce, a temperatura e a radiação seguem o sol e a umidade faz o contrário. Cada talhão segue o seu perfil (hora do dia, temperatura, umidade e sol), então as curvas dos seis nós não são iguais.
2. O gateway liga para cada nó da lista dele. Se o nó ainda não subiu ou cai, o gateway espera 1 s, depois 2 s, 4 s e assim até 15 s entre as tentativas. A espera volta para 1 s quando chega uma leitura válida.
3. Cada nó atende só um gateway por vez. Quem tentar entrar enquanto outro está conectado recebe uma mensagem `ERROR` e é desconectado.
4. O gateway guarda as leituras de cada nó em separado. Quando um nó junta `readingsPerBatch` leituras, o lote fecha.
5. O gateway chama o `Average` no serviço de cálculo (gRPC), mandando uma série para cada medida e esperando no máximo 5 s. A resposta traz uma média por série.
6. O gateway grava uma linha com o nó, o período, quantas leituras entraram e as três médias. As leituras individuais não são guardadas.
7. A Fog liga em cada gateway pela porta de Fog e, a cada 5 s, pergunta pelas médias gravadas depois da última linha que ela já tem (`ASK`, com o campo `since`). O gateway responde com até 200 linhas (`AVERAGES`), e se ainda sobrar linha a Fog pergunta de novo na hora.
8. A Fog grava as linhas em `data/fog.sqlite`. Uma média que já estava lá é ignorada, então perguntar duas vezes não duplica nada.

Se o serviço de cálculo estiver fora do ar, o lote é descartado e vai para o log. O gateway continua recebendo e os lotes seguintes voltam a ser gravados quando o serviço volta.

## Mensagens do socket (nó para gateway)

Cada mensagem é um objeto JSON em uma linha terminada em `\n`.

```jsonc
// leitura normal
{"type":"READING","node":"N1","at":"2026-10-23T14:02:11.480Z","temperature":27.4,"humidity":55.1,"solarRadiation":812.6}

// quando já existe outro gateway conectado
{"type":"ERROR","message":"nó ocupado: já existe um gateway conectado"}
```

## Mensagens do socket (Fog para gateway)

Mesmo formato, uma mensagem JSON por linha. A Fog manda um `ASK` e o gateway responde com um `AVERAGES`:

```jsonc
// fog -> gateway: me dê as médias gravadas depois da linha 36 do seu banco
{"type":"ASK","since":36}

// gateway -> fog: até 200 linhas por resposta, em ordem; latest é a última linha do banco do gateway
{"type":"AVERAGES","gateway":"G1","latest":39,"rows":[{"id":37,"node":"N2","periodStart":"2026-11-10T14:02:11.480Z","periodEnd":"2026-11-10T14:02:20.480Z","samples":6,"temperature":24.1,"humidity":63.8,"solarRadiation":410.2}]}

// pedido que não é um ASK válido
{"type":"ERROR","message":"pedido fora do contrato ASK"}
```

A Fog guarda a última linha que recebeu de cada gateway e pergunta sempre a partir dela, então o que ela perdeu enquanto estava fora do ar vem na primeira pergunta depois que volta. Se o `latest` for menor que o `since`, o banco do gateway foi refeito, e a Fog volta a pedir desde a linha 0.

Os dois lados leem as mensagens por `src/shared/messages.ts`. O gateway aceita mais de uma Fog ao mesmo tempo, porque só responde e não guarda nada de quem perguntou.

## gRPC (gateway para serviço de cálculo)

O contrato está em [`proto/calc.proto`](proto/calc.proto): o serviço `MeanCalculator` tem uma função, `Average`, que recebe uma lista de séries (cada uma com um nome qualquer e uma lista de números) e devolve uma média por série.

```proto
service MeanCalculator {
  rpc Average(AverageRequest) returns (AverageReply);
}
```

Servidor e cliente leem esse mesmo arquivo na hora de rodar, com `@grpc/proto-loader` (`loadSync`), então não tem código gerado nem build. O `@grpc/grpc-js` cuida do transporte (HTTP/2, com os dados em binário Protobuf).

- `src/shared/calc-rpc.ts`: carrega o `.proto` e entrega o serviço `MeanCalculator` para o servidor e para o cliente.
- `src/calc-service/calc-service.ts`: o servidor. Usa `new Server()`, `addService(...)` e `bindAsync(...)` na porta 7200.
- `src/edge/calc-client.ts`: o cliente. Usa `new MeanCalculator(endereço, credenciais)` e `client.Average(pedido, { deadline }, callback)`. Existe uma conexão só, reaproveitada em todos os lotes.

O mesmo pedido e a mesma resposta, escritos como JSON só para ler (na rede vão em binário):

```jsonc
// gateway -> serviço de cálculo: Average(AverageRequest)
{"series":[{"name":"temperature","values":[27.1,27.4,27.9]},{"name":"humidity","values":[55.4,55.0,54.1]},{"name":"solarRadiation","values":[780.2,801.5,825.9]}]}

// serviço de cálculo -> gateway: AverageReply
{"means":[{"name":"temperature","mean":27.47},{"name":"humidity","mean":54.83},{"name":"solarRadiation","mean":802.53}]}
```

O serviço não sabe o que as séries representam. Ele devolve uma média para cada nome que receber.

Os erros que o gateway pode ver (códigos de status do gRPC):

| Código | Quando acontece | O que o gateway escreve no log |
| --- | --- | --- |
| `INVALID_ARGUMENT` | pedido sem séries, ou com série sem nome, repetida, vazia ou com valor que não é número | `servico recusou o pedido: ...` |
| `UNAVAILABLE` | o serviço de cálculo não está no ar | `servico de calculo fora do ar (127.0.0.1:7200)` |
| `DEADLINE_EXCEEDED` | o serviço não respondeu em 5 s (`CALC_TIMEOUT_MS`) | `tempo esgotado` |

Nos três casos o lote é descartado e o gateway segue recebendo leituras.

## Banco

Cada gateway grava em `data/edge-<gateway>.sqlite` (por exemplo `data/edge-G1.sqlite`), na tabela `batch_averages`:

| Coluna | O que guarda |
| --- | --- |
| `gateway`, `node` | quem fechou o lote e de qual nó vieram as leituras |
| `period_start`, `period_end` | horário da primeira e da última leitura do lote |
| `samples` | quantas leituras entraram no lote |
| `temperature` | média em °C |
| `humidity` | média em % |
| `solar_radiation` | média em W/m² |

A Fog grava em `data/fog.sqlite`, na tabela `gateway_averages`, as mesmas colunas e mais duas: `source_id` (a linha da média no banco do gateway) e `received_at` (quando a Fog recebeu). Gateway, nó e início do período juntos são únicos, e é isso que impede uma média de entrar duas vezes.

## Rodando em várias máquinas

Em cada máquina, troque o `host` dos nós, dos gateways e do serviço de cálculo em `src/config/topology.ts` pelo IP real. Quem liga é sempre o cliente (o gateway liga nos nós e no cálculo, e a Fog liga nos gateways), então precisam ter a porta liberada no firewall os nós, o serviço de cálculo e os gateways (7301 e 7302).

## Testando falhas

- Nó que entra depois: suba o G1 antes do N2 e veja as tentativas com 1 s, 2 s e 4 s de espera. Quando o N2 subir, o G1 conecta sozinho.
- Nó que cai e volta: feche o N1 e suba de novo. O G1 reconecta e retoma os lotes.
- Cálculo fora do ar: suba o N4 e o G2 sem o `dev:calc` e veja a mensagem `lote ... descartado: servico de calculo fora do ar`. Quando o serviço subir, os lotes voltam a ser gravados em poucos segundos. O gRPC religa sozinho, com espera de 1 s crescendo até 15 s, então numa queda longa a volta pode levar até 15 s.
- Cálculo que cai e volta: com tudo rodando, feche o `dev:calc` (Ctrl+C) e suba de novo. Os nós e o gateway não são afetados.
- Nó ocupado: com o N1 já ligado ao G1, abra outra conexão na porta 7101 e leia a mensagem `ERROR`.
- Fog que cai e volta: feche a Fog (Ctrl+C) e suba de novo. Os gateways não são afetados, e na primeira pergunta a Fog busca o que perdeu.
- Gateway que cai: feche o G1 e veja a Fog escrever `gateway G1 indisponivel, nova tentativa em ...` (1 s, 2 s, 4 s até 15 s) enquanto as médias do G2 continuam chegando. Quando o G1 volta, a Fog liga sozinha.
- Banco do gateway refeito: com o G1 parado, apague `data/edge-G1.sqlite` e suba o G1. A Fog escreve `banco do gateway G1 foi refeito, pedindo tudo de novo` e guarda as médias novas sem perder o histórico que já tinha.

## O que ainda não tem

- Microsserviço de anomalias, que a Fog chamaria por RPC, e o gatilho de irrigação. Por enquanto a Fog só junta as médias.
- A ligação gRPC não é criptografada (`createInsecure`), como no exemplo do professor. Serve para a rede do laboratório, não para a internet.
- O lote perdido porque o serviço de cálculo estava fora do ar não é recuperado.
- O `node:sqlite` ainda é experimental e mostra um aviso quando o gateway inicia.

## Erro `listen EACCES: permission denied`

No Windows o sistema reserva faixas de portas (Hyper-V, WSL, Docker) e nenhum programa pode escutar nelas. Não é permissão de pasta nem de administrador. Para ver as faixas reservadas:

```bash
netsh int ipv4 show excludedportrange protocol=tcp
```

Se uma porta da topologia cair numa faixa reservada, troque ela em `src/config/topology.ts`.
