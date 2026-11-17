# Smart Farm

Trabalho da disciplina de Sistemas Distribuídos (IFMS). Simula uma fazenda dividida em talhões, cada um com sensores de temperatura, umidade e incidência solar. As leituras vão para gateways que ficam perto do campo, um serviço calcula as médias e o resultado é guardado.

Sensor e gateway conversam por socket TCP, trocando JSON. Na v2, o gateway chama o serviço de cálculo por gRPC e a Fog busca as médias nos gateways, também por socket.

## Pastas

- `v1/`: primeira versão. O gateway pergunta a leitura ao sensor, as médias vão para um arquivo JSON e existe um painel web.
- `v2/`: segunda versão. O nó de campo manda as leituras sozinho, o cálculo é por gRPC, as médias ficam em um SQLite em cada gateway e a Fog junta as médias de todos.
- `docs/`: página em HTML com o resumo do projeto: como funciona, o que já está pronto e o que falta.
- `COMO-FUNCIONA.md`: explicação do código, versão por versão.

A análise de anomalias do diagrama da disciplina (o microsserviço que a Fog chamaria) ainda não foi feita.

## Como rodar

Precisa do Node.js 24 ou mais novo (testado com o 24.14.1). O TypeScript roda direto, sem build, e cada pasta tem o seu próprio `npm install`. Na v1 é um comando por terminal; na v2 existe um menu que sobe tudo.

v2:

```bash
cd v2
npm install
npm run dev:menu
```

O menu sobe o cálculo, os seis nós, os dois gateways e a Fog no mesmo terminal, e também dá para ligar e desligar cada um. O [README da v2](v2/README.md) tem os comandos para subir cada processo separado.

v1:

```bash
cd v1
npm install
npm run average-service
npm run sensor:s1
npm run gateway:g1
```

O painel web da v1 (http://127.0.0.1:3000) é a única parte que não roda assim, porque ele só existe compilado. O [README da v1](v1/README.md) explica como abrir.

## Portas

As duas versões usam portas diferentes, então dá para rodar as duas ao mesmo tempo.

| Processo | v1 | v2 |
| --- | --- | --- |
| Sensores / nós de campo | 5001, 5002 | 7101 a 7106 |
| Serviço de médias / de cálculo | 6000 | 7200 (gRPC) |
| Gateways (porta da Fog) | não escutam | 7301, 7302 |
| Painel web | 3000 | não tem |

No Windows algumas faixas de portas ficam reservadas pelo sistema, e o Node dá `EACCES: permission denied` quando tenta usar uma delas. O [README da v2](v2/README.md) mostra como descobrir quais são.
