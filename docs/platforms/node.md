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

{% hint style="warning" %}
`@roamhq/wrtc` e `ws` são dependências de par **opcionais**: quem instala para o navegador
não baixa nenhuma das duas. Num projeto Node, as duas são obrigatórias — o `@roamhq/wrtc`
traz o WebRTC nativo e o `ws`, o socket binário do relay.
{% endhint %}

## As duas pontas do áudio

```typescript
type AudioSource = {
    start(onFrame: (pcm: Int16Array) => void): void
    stop(): void
}

type AudioSink = {
    write(pcm: Int16Array): void
    end(): void
}
```

Os dois falam **PCM Int16, 16 kHz, mono** — o mesmo formato que a biblioteca usa de ponta a
ponta. Por isso nada é reamostrado no caminho, e o adaptador de Node não precisa de WebAssembly.

| | Quem escreve | Quando é chamado |
| --- | --- | --- |
| `source.start` | a biblioteca | ao abrir a primeira chamada |
| `source` empurra frames | você | quando tiver áudio, no ritmo que der |
| `sink.write` | a biblioteca | a cada frame que chega do outro lado |

{% hint style="info" %}
Empurre frames de qualquer tamanho: o runtime os recorta nos blocos de 10 ms que o WebRTC
pede. Se a sua fonte atrasar, sai silêncio em vez de a chamada engasgar.
{% endhint %}

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
