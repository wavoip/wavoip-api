# Chamadas em Node.js

Dois exemplos: um que **atende** e outro que **liga**. Os dois tocam uma saudação, gravam a
conversa num `.wav` e percorrem o caminho inteiro do runtime de Node — diagnóstico, device,
áudio nas duas direções e desligamento.

```bash
npm install

WAVOIP_TOKEN=seu-token npm run answer              # atende quem ligar
WAVOIP_TOKEN=seu-token npm run dial -- 5511999999  # liga para um número
```

Sem token, os dois rodam só o diagnóstico e saem.

## Áudio de verdade, e conversão nos dois lados

O exemplo toca `audio/exemplo.wav`, que vem junto: áudio gravado, e não um tom sintetizado —
assim dá para julgar de ouvido se a chamada está boa. Qualquer um roda sem preparar nada.

Nenhuma das duas pontas está na taxa da chamada, de propósito:

| | Formato | O que exercita |
| --- | --- | --- |
| Entrada (`audio/exemplo.wav`) | **44,1 kHz estéreo** | misturar os canais e reamostrar para baixo, numa razão que não é inteira |
| Saída (`studioSink`) | **48 kHz** | reamostrar para cima — três vezes mais amostras por segundo |

Os 16 kHz da chamada ficam no meio. A saída é o lado caro: [o custo acompanha a taxa de
saída](../../docs/platforms/node.md), e 48 kHz é o triplo de 16 kHz.

Medido com o arquivo:

```
44,1 kHz estéreo → 16 kHz mono:  47.349 amostras em 3 s  (esperado 48.000)
pico do sinal:                   6.056 no arquivo → 5.968 depois  (98,5% preservado)
16 kHz → 48 kHz:                 2,96 s gravados de 3 s de chamada
```

{% hint style="info" %}
**Repare no tamanho do frame em `audio.ts`.** Num arquivo estéreo as amostras vêm
intercaladas, uma de cada canal, então um frame de 20 ms tem o dobro delas. Sem multiplicar
pelo número de canais, o áudio sai na metade da velocidade — e é o tipo de engano que um
arquivo mono nunca revelaria.
{% endhint %}

Para usar outro áudio, aponte para qualquer WAV de 16 bits:

```bash
WAVOIP_AUDIO=./minha-mensagem.wav npm run answer
```

Por isso os exemplos também ligam o worker:

```typescript
nodeRuntime({ source, sink, resampleInWorker: true })
```

Com uma chamada só isso é exagero — é a partir de algumas dezenas simultâneas que a
reamostragem começa a segurar o event loop. Está ligado para mostrar onde fica a opção.

## Os arquivos

| Arquivo | O que demonstra |
| --- | --- |
| `src/answer.ts` | atender uma oferta, acompanhar a chamada, gravar ao desligar |
| `src/dial.ts` | `startCall`, os eventos da chamada que sai, desistir por tempo |
| `src/shared.ts` | montar o runtime, rodar o diagnóstico, conectar o device |
| `src/audio.ts` | as duas pontas de áudio, cada uma numa taxa diferente da chamada |
| `src/wav.ts` | ler e escrever WAV sem nenhuma dependência |

## O que reparar no código

**O áudio é seu, dos dois lados.** Num processo sem cabeça não há microfone nem alto-falante:
você entrega um `source` e um `sink`, declara o formato, e a biblioteca converte. A fonte do
exemplo não converte nada — ela diz `sampleRate: 22050` e entrega as amostras como estão.

**O diagnóstico vem antes da primeira chamada.** Num servidor ninguém vê o STUN bloqueado por
um firewall — a chamada simplesmente não completaria, e o log não diria por quê.

**Quando `startCall` falha, `error.devices` diz o porquê de cada device**, e é isso que
distingue "o número não existe" de "o seu device está desconectado".

**Desistir é decisão sua.** O `dial.ts` cancela depois de 45 s: sem isso o processo ficaria
tocando até o outro lado resolver alguma coisa.

**O estouro é olhado durante a chamada**, e não só no diagnóstico: o ganho pode mudar no meio,
e quem fala nunca percebe que está distorcendo — só quem ouve.

## Requisitos

- Node 22 ou mais novo (o `--experimental-strip-types` roda o TypeScript direto)
- `@roamhq/wrtc` para a chamada oficial e `ws` para a não oficial

Nada além disso: o WAV é lido e escrito em JavaScript puro, sem `ffmpeg` nem módulo nativo de
áudio.
