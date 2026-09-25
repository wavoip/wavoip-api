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

## O pior caso de propósito

Os exemplos poderiam produzir 16 kHz mono — a taxa da chamada — e não converter nada. Não
convertem porque aí não provariam coisa alguma. Em vez disso usam o formato mais
desfavorável em cada ponta:

| | Formato | O que exercita |
| --- | --- | --- |
| Entrada (`mp3LikeSource`) | Float32, **estéreo**, **44,1 kHz** | converter de Float32, misturar os canais, reamostrar para baixo |
| Saída (`studioSink`) | **48 kHz** | reamostrar para cima — três vezes mais amostras por segundo |

É o formato que um decodificador de MP3 entrega e a taxa em que se costuma gravar, então é
também o caso realista. E é o mais caro: [o custo acompanha a taxa de
saída](../../docs/platforms/node.md), e 48 kHz é o triplo de 16 kHz.

Medido de ponta a ponta:

```
44,1 kHz estéreo → 16 kHz mono:  15.669 amostras em 1 s  (esperado 16.000)
16 kHz → 48 kHz:                 23.904 de 8.000         (esperado 24.000)
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
| `src/audio.ts` | as duas pontas de áudio, no pior formato |
| `src/wav.ts` | o PCM da chamada virando arquivo tocável |

## O que reparar no código

**O áudio é seu, dos dois lados.** Num processo sem cabeça não há microfone nem alto-falante:
você entrega um `source` e um `sink`, declara o formato, e a biblioteca converte.

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
