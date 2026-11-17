# Como o projeto funciona

Este texto explica o projeto desde o começo, para quem nunca viu o código. Primeiro as ideias, depois como cada versão as usa.

Roteiro: 1. A ideia, 2. Conceitos, 3. O desenho da disciplina, 4. A v1, 5. A v2, 6. v1 e v2 lado a lado, 7. Problemas que o projeto mostra, 8. O que falta.

---

## 1. A ideia

Uma fazenda é dividida em talhões (pedaços de terra). Em cada talhão existem sensores que medem temperatura, umidade e incidência solar. Em vez de mandar todas as leituras brutas para um servidor distante, o sistema trabalha perto do campo:

```
 sensores do talhão --> gateway --> serviço de cálculo --> armazenamento
      (medem)           (coleta)        (calcula)          (guarda só a média)
```

Na v2 existe ainda a Fog, que fica acima dos gateways e junta as médias de todos num lugar só.

Tudo é simulado. Os "sensores" são programas que geram números parecidos com os reais de temperatura (°C), umidade (%) e incidência solar (W/m²). Cada peça é um programa separado que conversa com os outros pela rede, e é por isso que o sistema é distribuído.

---

## 2. Conceitos

- Talhão: um pedaço da plantação com os seus sensores. Pense num canteiro da horta.
- Socket TCP: um canal entre dois programas pela rede. As mensagens chegam inteiras e na ordem, como numa ligação de telefone: abre, conversa, desliga.
- Porta: um número que diz qual programa da máquina vai atender. É como o ramal do telefone.
- Servidor e cliente: o servidor fica esperando conexões e o cliente é quem liga. Quem atende e quem liga.
- JSON: texto estruturado para representar dados, como `{"temperature": 31.2}`.
- Gateway: programa que fica entre os sensores e o resto do sistema. Coleta, organiza e encaminha, como o porteiro de um condomínio.
- Microsserviço: programa pequeno, com uma tarefa só, que outros chamam pela rede. Aqui a tarefa é calcular médias. É uma calculadora que atende por telefone.
- Edge: a camada perto dos sensores, ou seja, o campo.
- Fog: uma camada local no meio do caminho, que enxerga várias áreas ao mesmo tempo. É a sala de controle da fazenda.
- Lote: um grupo de leituras processadas juntas, como fechar o caixa a cada 6 vendas.
- Polling e push: no polling quem precisa do dado fica perguntando de tempos em tempos ("chegou carta?"). No push quem tem o dado avisa sozinho (o carteiro tocando a campainha).
- SQLite: um banco de dados que vive em um único arquivo.
- RPC (Remote Procedure Call): chamar uma função de outro programa como se ela fosse local, tipo `calcularMedia(dados)`. É como pedir a um colega "calcula isso para mim" e receber a resposta.
- gRPC: tecnologia de RPC do Google. Você descreve a função uma vez e a biblioteca leva os dados pela rede (em binário, sobre HTTP/2), traz a resposta e avisa quando dá erro.
- `.proto` (Protobuf): arquivo que descreve as funções e o formato dos dados. Cliente e servidor leem o mesmo arquivo, como um cardápio que o cliente e a cozinha usam.
- Deadline (prazo): o tempo máximo que o gateway espera por uma resposta. Passou do prazo, ele desiste.

Uma coisa que confunde: ser servidor ou cliente não tem a ver com quem manda os dados. No projeto o nó de campo é servidor (fica esperando) e o gateway é cliente (liga para ele), mas na v2 os dados vão do servidor para o cliente.

---

## 3. O desenho da disciplina

O diagrama do professor tem duas camadas, Edge e Fog, e dois tipos de comunicação:

```
 EDGE A: talhões 01, 02, 03 (cada um com temperatura, umidade e IS)
    |
    | socket
    v
 GATEWAY ----- RPC -----> microsserviço de cálculo (média)
    |
    | socket
    v
 FOG (servidor local) ----- RPC -----> microsserviço de anomalias
                                       "umidade baixa? ligar irrigação"

 EDGE B: igual ao A, com o seu próprio gateway, ligado à mesma Fog
```

- Socket: entre sensor e gateway, e entre gateway e Fog.
- RPC: entre gateway e microsserviço de cálculo, e entre Fog e microsserviço de anomalias.

O que já existe no código:

- Nas duas versões: sensor e gateway conversando por socket, dois gateways (G1 e G2) e um serviço que calcula a média. Cada sensor (ou talhão) mede temperatura, umidade e incidência solar.
- Só na v2: seis talhões, três por gateway, como no desenho. Todos rodam o mesmo programa, e cada um tem o seu perfil de clima.
- Só na v2: a conversa entre gateway e serviço de cálculo é por RPC de verdade (gRPC). Na v1 era socket.
- Só na v2: a Fog, que é cliente dos gateways por socket e junta as médias de todos num banco só.
- Em nenhuma das duas: o microsserviço de anomalias.

Ou seja, a v2 cobre a camada Edge e a Fog do desenho, e o microsserviço de anomalias (com o "ligar irrigação") é a próxima etapa.

---

## 4. Como a v1 funciona

Tem dois sensores (S1 e S2), dois gateways (G1 e G2) e o Average Service. Cada gateway cuida de um sensor.

```
 S1 (servidor :5001) <-- "me dê a leitura" -- G1 --+
                      -- leitura ---------->       |  cada leitura
 S2 (servidor :5002) <-- "me dê a leitura" -- G2 --+
                      -- leitura ---------->       v
                                            Average Service (servidor :6000)
                                            junta 10 s de leituras e calcula a média
```

Os sensores e o Average Service são servidores, e os gateways são clientes dos dois. O fluxo é de polling: o gateway é quem pergunta.

A cada 2 segundos, para o G1:

1. O G1 abre uma conexão com o S1 e manda `{"type":"READ_SENSORS","gateway":"G1"}`.
2. O S1 sorteia uma leitura (temperatura de 15 a 38 °C, umidade de 30 a 90 %, incidência solar de 0 a 1000 W/m²) e responde `{"type":"SENSOR_READING","sensorNode":"S1","timestamp":"...","temperature":31.2,"humidity":38,"solarRadiation":820}`. O sensor não guarda histórico, só gera o valor na hora.
3. O G1 confere a resposta e fecha a conexão (cada pergunta usa uma conexão curta). Se der erro, tenta de novo até 3 vezes, com 1 s entre as tentativas. Se continuar falhando, desiste daquele ciclo e tenta no seguinte.
4. O G1 reembala a leitura como `GATEWAY_READING` e manda para o Average Service, que responde `{"type":"ACK"}`, quer dizer, "recebi".
5. O Average Service guarda a leitura na memória, separada por gateway.

A cada 10 segundos o Average Service calcula a média de temperatura, umidade e radiação de cada gateway, grava um registro em `data/averages.json` e descarta as leituras individuais. É uma média por tempo (janela de 10 s).

No painel web (demo em `scripts/run-demo.js`), o serviço também guarda cada leitura em `data/readings.jsonl`, e um servidor HTTP na porta 3000 mostra as médias atuais, o gráfico de cada gateway, os sensores online e as últimas leituras.

---

## 5. Como a v2 funciona

Tem seis nós de campo (N1 a N6, um por talhão), dois gateways (o G1 cuida de N1, N2 e N3, e o G2 de N4, N5 e N6) um serviço de cálculo e a Fog. Entre o nó e o gateway o fluxo é de push: o nó manda as leituras sem ninguém pedir.

```
 N1 (servidor :7101) --+
 N2 (servidor :7102) --+-- socket: READING a cada 1,5 s --> G1 --+
 N3 (servidor :7103) --+   grava em data/edge-G1.sqlite          |
                                                                 +-- gRPC: Average() --> Calc Service (gRPC :7200)
 N4 (servidor :7104) --+                                         |   <--- as médias ---
 N5 (servidor :7105) --+-- socket: READING a cada 1,5 s --> G2 --+
 N6 (servidor :7106) --+   grava em data/edge-G2.sqlite
```

E a Fog, por cima dos gateways:

```
 Fog (cliente) -- ASK: "o que tem de novo?" --> G1 (servidor :7301)
   |           <-- AVERAGES: as médias novas --
   |
   +---------- ASK ---------------------------> G2 (servidor :7302)
   |           <-- AVERAGES ---------------------
   v
 data/fog.sqlite
```

Passo a passo:

1. O nó de campo sobe e fica escutando na porta definida em `src/config/topology.ts`. Ele simula um "dia" de 2 minutos: o sol sobe e desce, a temperatura e a radiação seguem o sol e a umidade faz o contrário. Os seis nós rodam o mesmo programa, mas cada talhão tem o seu perfil em `topology.ts` (hora do dia, ajuste de temperatura e de umidade e quanto sol chega nele), então os números não saem iguais. Cada nó atende um gateway por vez, e um segundo que tente entrar recebe uma mensagem `ERROR` e é desconectado.
2. O gateway liga para os nós dele (o G1 cuida de N1, N2 e N3, e o G2 de N4, N5 e N6). Se um nó ainda não subiu ou cai, o gateway tenta de novo esperando 1 s, depois 2 s, 4 s e assim até 15 s. A espera volta para 1 s quando chega uma leitura válida.
3. A cada 1,5 s o nó manda uma leitura, sem ninguém pedir: `{"type":"READING","node":"N1","at":"...","temperature":27.4,"humidity":55.1,"solarRadiation":812.6}`. O nó diz quem é no campo `node`, e o gateway confere se bate com o nó que ele chamou.
4. O gateway separa as leituras por nó e fecha um lote quando um nó junta 6 (`readingsPerBatch`). Leituras de nós diferentes nunca se misturam.
5. O gateway chama o serviço de cálculo por gRPC. Em vez de montar uma mensagem na mão, ele chama a função `Average` como se fosse local, passando uma série para cada medida: `{"series":[{"name":"temperature","values":[...]}, {"name":"humidity","values":[...]}, {"name":"solarRadiation","values":[...]}]}`. A resposta traz uma média por série: `{"means":[{"name":"temperature","mean":...}, ...]}`. Se o serviço estiver fora do ar ou não responder em 5 s, a chamada falha e o lote é descartado.
6. O gateway grava no SQLite uma linha com o nó, o começo e o fim do período do lote, quantas leituras entraram e as três médias. As leituras individuais são descartadas e só a média fica guardada.
7. A Fog liga em cada gateway (porta 7301 no G1, 7302 no G2) e, a cada 5 s, manda `{"type":"ASK","since":36}`, que quer dizer "me dê as médias gravadas depois da linha 36 do seu banco". O gateway responde `{"type":"AVERAGES","gateway":"G1","latest":39,"rows":[...]}` com até 200 linhas. A Fog guarda o número da última linha que recebeu de cada gateway, então o que ela perdeu enquanto estava fora do ar vem na primeira pergunta depois que volta.
8. A Fog grava as linhas em `data/fog.sqlite`. Se a mesma média chegar duas vezes, a segunda é ignorada (gateway, nó e início do período são únicos).

Um exemplo com números, para um lote de 6 leituras do N1:

| | 1ª | 2ª | 3ª | 4ª | 5ª | 6ª | média |
| --- | --- | --- | --- | --- | --- | --- | --- |
| temperatura (°C) | 27,1 | 27,4 | 27,9 | 28,2 | 28,4 | 28,6 | 27,93 |
| umidade (%) | 55,4 | 55,0 | 54,1 | 53,8 | 53,2 | 52,9 | 54,07 |
| radiação (W/m²) | 780,2 | 801,5 | 825,9 | 840,3 | 862,7 | 881,4 | 832 |

Na tabela `batch_averages` fica uma linha com `gateway = G1`, `node = N1`, `samples = 6`, `temperature = 27.93`, `humidity = 54.07` e `solar_radiation = 832`, além do horário da primeira e da última leitura. A Fog depois copia essa mesma linha para o `data/fog.sqlite`.

Os papéis seguem o desenho do professor: o gateway é servidor para a Fog, e é a Fog que liga e pergunta. Para o nó é o contrário, porque ele é o servidor e manda sozinho.

O serviço de cálculo não sabe nada do resto. Ele recebe séries com nomes livres e devolve uma média para cada nome. Não conhece sensores, nós, gateways nem banco. Por isso os dois gateways usam o mesmo serviço, e dá para acrescentar uma medida nova sem mexer nele.

O gRPC fica em três arquivos:

1. [`v2/proto/calc.proto`](v2/proto/calc.proto) é o contrato: descreve a função `Average` e o formato do pedido e da resposta.
2. [`v2/src/calc-service/calc-service.ts`](v2/src/calc-service/calc-service.ts) é o servidor: registra a função (`addService`) e abre a porta 7200 (`bindAsync`).
3. [`v2/src/edge/calc-client.ts`](v2/src/edge/calc-client.ts) é o cliente que o gateway usa: chama `client.Average(...)` com um prazo de 5 s.

Os dois lados leem o mesmo `.proto` (pelo [`v2/src/shared/calc-rpc.ts`](v2/src/shared/calc-rpc.ts)), então não tem como discordarem sobre o formato dos dados.

---

## 6. v1 e v2 lado a lado

| | v1 | v2 |
| --- | --- | --- |
| Quem começa a troca | O gateway pergunta a cada 2 s (polling). | O nó manda a cada 1,5 s (push). |
| Conexão com o sensor | Curta: abre, pergunta, recebe, fecha. | Uma só, contínua. |
| Gateways por nó | Qualquer um pode perguntar. | Um por vez, o segundo recebe `ERROR`. |
| Valores simulados | Sorteados do zero a cada pergunta. | Seguem a curva de um dia simulado. |
| Quem calcula a média | O Average Service, por tempo (janela de 10 s). | O serviço de cálculo, por quantidade (lote de 6 formado pelo gateway). |
| O serviço conhece o domínio? | Sim: sabe de gateways, valida leituras e escreve arquivos. | Não: recebe séries com nomes livres e devolve uma média por nome. |
| Conversa gateway e cálculo | Socket com JSON (`GATEWAY_READING` e `ACK`), uma leitura por vez. | gRPC: o gateway chama `Average(séries)` e recebe as médias. O contrato fica em `proto/calc.proto`. |
| Onde guarda o resultado | `averages.json`, no serviço. | SQLite, no gateway (`data/edge-G1.sqlite`), e a Fog guarda uma cópia de todos em `data/fog.sqlite`. |
| Fog | Não tem. | Pergunta aos gateways e junta as médias. |
| Se o nó cai | Até 3 tentativas por ciclo. | Reconecta sozinho, com espera crescente de 1 s a 15 s. |
| Painel web | Tem. | Não tem (o `npm run dev:report` mostra o banco). |

Por que mudar? Na v2 cada peça tem uma responsabilidade só: o nó mede, o gateway organiza e guarda, o serviço de cálculo calcula. Isso deixa o serviço reaproveitável e o sistema mais fácil de crescer, porque para ampliar basta subir outro nó e outro gateway.

---

## 7. Problemas que o projeto mostra

- O TCP é um fluxo de bytes, não de mensagens. Duas mensagens podem chegar coladas e uma pode chegar cortada no meio. Por isso cada mensagem JSON termina com `\n`, e quem recebe vai juntando os bytes num buffer e só entrega a mensagem quando a linha está completa (`src/shared`, nas duas versões).
- Falha parcial é normal. O nó pode cair (o gateway reconecta), o serviço de cálculo pode cair (o lote é descartado e vai para o log, e o gateway segue funcionando) e o gateway pode cair (o nó volta a aceitar outro).
- Insistir sem pausa também é problema. Se um nó está fora do ar, tentar reconectar a cada instante só gasta recurso, então a espera entre as tentativas dobra.
- Serviço sem estado é fácil de replicar. O serviço de cálculo da v2 não guarda nada entre as chamadas, então qualquer gateway pode usar.
- O RPC esconde a rede, mas ela continua lá. Uma chamada `Average(...)` parece uma função local, mas o outro lado pode estar fora do ar ou lento. Por isso toda chamada tem um prazo (deadline, de 5 s) e o erro volta com um código (`UNAVAILABLE`, `DEADLINE_EXCEEDED`, `INVALID_ARGUMENT`).
- Processar na borda reduz o que trafega e o que se guarda: só as médias vão para o armazenamento.
- Quem pergunta precisa lembrar até onde já leu. A Fog guarda o número da última linha de cada gateway, então se ela cair não perde nada: volta e pergunta a partir dali. E se o banco de um gateway for apagado, ela percebe (o número dele ficou menor que o que ela tinha) e pede tudo de novo.
- O sistema operacional também conta. No Windows algumas faixas de portas ficam reservadas e o Node dá `EACCES: permission denied`. Não é problema de permissão de arquivo, é preciso usar outra porta.

---

## 8. O que falta

- Microsserviço de anomalias: aplica regras como `umidade < 25 %` para gerar ações como "ligar irrigação". Pelo diagrama, a Fog chama esse serviço por RPC. O caminho já está aberto, porque basta um segundo `.proto` e o mesmo padrão de servidor e cliente usado no cálculo.

---