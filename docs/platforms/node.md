---
description: Chamadas de áudio num processo Node.js, sem navegador e sem aparelho de som.
icon: server
---

# Node.js

O runtime de Node serve ao processo que atende ou faz chamadas **sem ninguém na frente da
tela**: um bot, uma URA, um gravador, uma ponte para transcrição.

Como não existe microfone nem alto-falante, você diz de onde o áudio vem e para onde ele vai.

## Instalar

```bash
npm install @wavoip/wavoip-api @roamhq/wrtc ws
```

Funciona nas duas convenções de módulo:

{% tabs %}
{% tab title="ESM" %}
```typescript
import { Wavoip, nodeRuntime } from "@wavoip/wavoip-api/node"
```
{% endtab %}

{% tab title="CommonJS" %}
```javascript
const { Wavoip, nodeRuntime } = require("@wavoip/wavoip-api/node")
```
{% endtab %}
{% endtabs %}

{% hint style="warning" %}
`@roamhq/wrtc` e `ws` são dependências de par **opcionais**: quem instala para o navegador
não baixa nenhuma das duas. Num projeto Node, as duas são obrigatórias — o `@roamhq/wrtc`
traz o WebRTC nativo e o `ws`, o socket binário do relay.
{% endhint %}

## As duas pontas do áudio

```typescript
type AudioSource = {
    sampleRate?: number      // padrão 16000; o resto é reamostrado
    channelCount?: number    // padrão 1; estéreo intercalado é misturado
    start(onFrame: (pcm: Int16Array | Float32Array) => void): void
    stop(): void
}

type AudioSink = {
    sampleRate?: number      // padrão 16000; a taxa em que você quer receber
    write(pcm: Int16Array): void
    end(): void
}
```

**Entregue o que o seu decodificador já produz.** `Int16Array` ou `Float32Array`, qualquer
taxa, mono ou estéreo intercalado — você declara o formato e o runtime converte, mistura os
canais e reamostra.

| | Quem escreve | Quando é chamado |
| --- | --- | --- |
| `source.start` | a biblioteca | ao abrir a primeira chamada |
| `source` empurra frames | você | quando tiver áudio, no ritmo que der |
| `sink.write` | a biblioteca | a cada frame que chega do outro lado |

{% hint style="info" %}
Empurre frames de qualquer tamanho: o runtime os recorta nos blocos de 10 ms que o WebRTC
pede. Se a sua fonte atrasar, sai silêncio em vez de a chamada engasgar.
{% endhint %}

### O que a reamostragem custa

O reamostrador é sinc com janela e tabela pré-computada, em JavaScript puro — o mesmo que o
React Native vai usar, onde WebAssembly não roda.

O trabalho por amostra é **fixo e conhecido**: 33 taps de filtro, um por vizinho considerado.
Dessa constante saem as três regras que valem em qualquer máquina:

| | |
| --- | --- |
| **O custo acompanha a taxa de saída, não a de entrada** | converter 96 kHz → 16 kHz custa o mesmo que 8 kHz → 16 kHz |
| **Taxas iguais custam zero** | o runtime devolve o mesmo buffer, sem tocar nele |
| **Dobrar a taxa de saída dobra o custo** | entregar ao `sink` em 48 kHz custa 3× entregar em 16 kHz |

Em multiplicações-acumulações por segundo de áudio:

| Destino da conversão | Trabalho por segundo de áudio |
| --- | --- |
| nenhuma (16 kHz → 16 kHz) | — |
| → 16 kHz (entrada da chamada) | 16.000 × 33 ≈ **530 mil** |
| → 44,1 kHz (gravação em CD) | 44.100 × 33 ≈ **1,46 milhão** |
| → 48 kHz (gravação em estúdio) | 48.000 × 33 ≈ **1,58 milhão** |

{% hint style="success" %}
**A economia que sempre vale: fique em 16 kHz nas duas pontas.** O runtime detecta que não há
o que fazer e devolve o mesmo buffer. Converter só o que precisa ser convertido vale mais que
qualquer ajuste depois.
{% endhint %}

{% hint style="warning" %}
Node é single-thread, e a reamostragem acontece no mesmo event loop das suas chamadas. Quantas
cabem depende do seu hardware e da sua versão do Node — **meça no ambiente em que vai rodar**,
não em outro. A tabela acima serve para comparar as opções entre si, não para dimensionar
máquina.
{% endhint %}

### Por que não µ-law nem WebAssembly

O filtro anti-aliasing não é ornamento. Reduzir 48 kHz para 16 kHz sem filtrar não descarta o
que está acima de 8 kHz: **dobra para dentro da banda de voz**. Medido com um tom de 15 kHz,
interpolação linear devolve energia cheia (RMS 7071) onde o sinc devolve zero — é a diferença
entre voz limpa e ruído metálico.

## Uma chamada completa

{% stepper %}
{% step %}
## Montar as pontas do áudio

```typescript
import { readFileSync } from "node:fs"
import type { AudioSink, AudioSource } from "@wavoip/wavoip-api/node"

// Uma fonte que toca um arquivo de PCM 16 kHz do começo ao fim.
function fileSource(path: string): AudioSource {
    const pcm = new Int16Array(readFileSync(path).buffer)
    let offset = 0
    let timer: NodeJS.Timeout | null = null

    return {
        start(onFrame) {
            timer = setInterval(() => {
                const frame = pcm.subarray(offset, offset + 160)
                offset += 160
                if (frame.length > 0) onFrame(frame)
            }, 10)
        },
        stop() {
            if (timer) clearInterval(timer)
        },
    }
}

// Um sumidouro que guarda o que o contato falou.
function recordingSink(): AudioSink & { recorded: Int16Array[] } {
    const recorded: Int16Array[] = []
    return {
        recorded,
        write: (pcm) => void recorded.push(pcm.slice()),
        end: () => {},
    }
}
```
{% endstep %}

{% step %}
## Montar o Wavoip

```typescript
import { Wavoip, nodeRuntime } from "@wavoip/wavoip-api/node"

const sink = recordingSink()

const wavoip = new Wavoip({
    tokens: ["seu-token-de-dispositivo"],
    runtime: nodeRuntime({ source: fileSource("./saudacao.pcm"), sink }),
})
```
{% endstep %}

{% step %}
## Atender e falar

```typescript
wavoip.on("offer", async (offer) => {
    const { data: call, error } = await offer.accept()
    if (error) return console.error(error.code)

    // A partir daqui o `source` está sendo lido e o `sink` recebendo o contato.
    call.on("ended", () => console.log("gravado:", sink.recorded.length, "frames"))
})
```
{% endstep %}
{% endstepper %}

## O que não existe aqui

| Recurso | Comportamento |
| --- | --- |
| `wavoip.audio.listInputDevices()` | devolve `[]` — não há aparelho para listar |
| `wavoip.audio.currentInput` / `currentOutput` | `null` |
| `call.stats.latency.playout_ms` | `null` — não há alto-falante para medir |

O resto da API é idêntico ao do navegador: os mesmos eventos, os mesmos `Result`, os mesmos
códigos de erro.
