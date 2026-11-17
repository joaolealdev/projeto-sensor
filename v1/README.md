# Smart Farm v1

Primeira versão do projeto. Tem dois sensores (S1 e S2) que respondem quando os gateways (G1 e G2) perguntam. Cada gateway manda as leituras para o serviço de médias (Average Service), que junta 10 s de leituras, calcula a média e grava em JSON. Também tem um painel web.

## Como funciona

```
 SENSOR S1 (servidor :5001)  <-- pergunta / leitura --  GATEWAY G1 --+
                                                                      |  cada leitura
 SENSOR S2 (servidor :5002)  <-- pergunta / leitura --  GATEWAY G2 --+
                                                                      v
                                                    AVERAGE SERVICE (servidor :6000)
                                                    junta 10 s e calcula a média
                                                                      |
                                           data/averages.json   data/readings.jsonl
                                                                      |
                                                          PAINEL WEB  http://127.0.0.1:3000
```

- `src/sensors/sensor-server.ts`: servidor do sensor. Responde `READ_SENSORS` com temperatura, umidade e radiação solar. Os valores são sorteados a cada pergunta e nada é guardado.
- `src/gateways/gateway.ts`: a cada 2 s pergunta ao sensor (até 3 tentativas) e manda a leitura para o Average Service.
- `src/services/average-service.ts`: recebe as leituras, separa por gateway e, a cada 10 s, grava a média e descarta as leituras.
- `src/config/config.ts`: portas, qual gateway cuida de qual sensor, intervalos e tempos limite.

O G1 cuida do S1 e o G2 cuida do S2. As mensagens são JSON terminado em `\n` (o código está em `src/shared/`).

## Rodar

Precisa do Node.js 24 ou mais novo. Dentro da pasta `v1/`:

```bash
npm install
```

### Modo dev, um processo por terminal

O TypeScript roda direto, sem compilar. Suba o `average-service` primeiro:

```bash
npm run average-service
npm run sensor:s1
npm run sensor:s2
npm run gateway:g1
npm run gateway:g2
```

Isso gera o `data/averages.json`.

### Demo com o painel web

Usa o `dist/` que já está no repositório, então não tem build para rodar:

```bash
node scripts/run-demo.js
```

Sobe o Average Service, os dois sensores, os dois gateways e o painel em http://127.0.0.1:3000. Para encerrar tudo é só dar `Ctrl+C`. A demo também grava o `data/readings.jsonl`, que é o histórico de leituras usado pelo painel.

O painel (Campo Vivo) mostra as médias atuais, o gráfico de cada gateway (1 h, 24 h ou 7 dias), o estado dos sensores (online se mandou leitura nos últimos 15 s) e a tabela com as últimas leituras.

## O painel só existe compilado

O painel (`dist/dashboard/`) e a integração dele no `dist/services/average-service.js` estão no repositório só como JavaScript compilado. Não existe `src/dashboard/`, e o `src/services/average-service.ts` é uma versão anterior, sem o painel. Por isso:

- Não rode `npm run build` se quiser manter o painel. O `tsc` sobrescreve o `dist/services/average-service.js` com a versão sem painel e a demo deixa de servir a porta 3000.
- O modo dev usa o código de `src/` e não tem painel.

## Dados gerados

O `data/averages.json` é uma lista de registros assim:

```json
{
  "gateway": "G1",
  "periodStart": "2026-09-23T02:10:28.251Z",
  "periodEnd": "2026-09-23T02:10:38.253Z",
  "samples": 4,
  "averages": { "temperature": 29.7, "humidity": 43.27, "solarRadiation": 685.52 }
}
```

Os arquivos de `data/` que estão no Git vêm de uma execução antiga e ficaram como exemplo. Rodar o sistema acrescenta linhas a eles.
