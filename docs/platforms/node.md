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

### Qual taxa eu devo declarar?

Se você não trabalha com áudio, esta é a única parte que precisa ler.

**Taxa de amostragem** é quantas medições do som existem em cada segundo do seu arquivo.
`44100` quer dizer 44.100 medições por segundo. Não é qualidade no sentido de "melhor ou
pior" — é uma característica do arquivo, como a resolução de uma imagem. O seu áudio *já tem*
uma taxa; você só precisa dizer qual é.

**Onde achar o número:**

| Se o seu áudio vem de… | Quase sempre é |
| --- | --- |
| um MP3, ou música em geral | `44100` |
| um WAV de gravador, ou vídeo | `48000` |
| um TTS (ElevenLabs, Google, Azure, OpenAI) | está escrito na resposta da API — costuma ser `22050` ou `24000` |
| outra chamada telefônica, ou WhatsApp | `8000` ou `16000` |
| você não faz ideia | rode `ffprobe seu-arquivo.mp3` e procure `Hz` |

```typescript
const source: AudioSource = {
    sampleRate: 44100,   // o número que você achou acima
    channelCount: 2,     // 2 se for estéreo, 1 se for mono
    start, stop,
}
```

{% hint style="danger" %}
**O sintoma de ter declarado errado é a voz sair em velocidade errada.** Grave e arrastada, ou
aguda e acelerada, como um disco na rotação errada. Se ouvir isso, o número que você declarou
não é o do arquivo — não é bug da chamada nem da rede.
{% endhint %}

{% hint style="success" %}
**Se você controla as duas pontas, use `16000` e pare de pensar nisso.** É a taxa que a
chamada usa por dentro, então nada precisa ser convertido e o processamento é zero. Qualquer
outro número funciona igual, só dá trabalho ao servidor.
{% endhint %}

### O que a conversão custa, em termos práticos

Converter áudio é parecido com redimensionar uma foto: **o trabalho depende do tamanho do
resultado, não do original.** Reduzir uma foto de 8000px para 200px é rápido; ampliar uma de
200px para 8000px é lento. Com áudio é a mesma coisa, e daí saem três consequências:

1. **Receber áudio de 96 kHz não custa mais caro que receber de 8 kHz.** Nos dois casos a
   chamada trabalha em 16 kHz, e é esse número que manda.
2. **Pedir para receber a gravação em 48 kHz custa três vezes mais** do que recebê-la em
   16 kHz — são três vezes mais medições para produzir.
3. **Taxas iguais nas duas pontas custam zero.** O runtime percebe que não há o que fazer e
   devolve o áudio intacto, sem processar nada.

{% hint style="warning" %}
Node roda tudo numa linha só de execução, e a conversão divide essa linha com as suas
chamadas. Quantas chamadas cabem depende do servidor e da versão do Node que você usa —
**meça no ambiente em que vai rodar de verdade**, porque um número medido na máquina de outra
pessoa não vale para a sua.
{% endhint %}

### O custo em detalhe

Para quem precisa dimensionar: o reamostrador é sinc com janela e tabela pré-computada, em
JavaScript puro — o mesmo que o React Native vai usar, onde WebAssembly não roda.

O trabalho por amostra é fixo: 33 taps de filtro. O custo total é a taxa de **saída** vezes
esse número, e a taxa de entrada não entra na conta.

| Destino da conversão | Multiplicações-acumulações por segundo de áudio |
| --- | --- |
| nenhuma (16 kHz → 16 kHz) | — |
| → 16 kHz (entrada da chamada) | 16.000 × 33 ≈ **530 mil** |
| → 44,1 kHz (gravação em CD) | 44.100 × 33 ≈ **1,46 milhão** |
| → 48 kHz (gravação em estúdio) | 48.000 × 33 ≈ **1,58 milhão** |

A tabela serve para comparar as opções entre si, não para dimensionar máquina.

### Por que a conversão é feita com cuidado

O jeito ingênuo de reduzir a taxa é jogar medições fora — pegar uma a cada três e seguir. O
resultado não é só "menos detalhe": os sons agudos que não cabem mais **não somem, viram
chiado grave** em cima da voz. É o mesmo efeito de uma roda de carroça que parece girar para
trás no cinema.

Por isso a conversão filtra antes de reduzir. Medindo com um som agudo que não cabe na taxa
nova: o jeito ingênuo devolve esse som inteiro, transformado em ruído; o daqui devolve
silêncio, que é o certo.

Esse cuidado é também o motivo de não usarmos uma biblioteca pronta em WebAssembly: ela
resolveria o Node e deixaria o React Native de fora, onde WebAssembly não roda.

## Uma chamada completa

{% stepper %}
{% step %}
## Montar as pontas do áudio

```typescript
import { readFileSync } from "node:fs"
import type { AudioSink, AudioSource } from "@wavoip/wavoip-api/node"

// Uma fonte que toca um arquivo do começo ao fim. Repare que ela não converte nada: só
// diz em que formato o arquivo está, e o runtime cuida do resto.
function fileSource(path: string, sampleRate: number): AudioSource {
    const pcm = new Int16Array(readFileSync(path).buffer)
    const framesPerTick = Math.round(sampleRate / 100)   // 10 ms de áudio
    let offset = 0
    let timer: NodeJS.Timeout | null = null

    return {
        sampleRate,
        channelCount: 1,
        start(onFrame) {
            timer = setInterval(() => {
                const frame = pcm.subarray(offset, offset + framesPerTick)
                offset += framesPerTick
                if (frame.length > 0) onFrame(frame)
            }, 10)
        },
        stop() {
            if (timer) clearInterval(timer)
        },
    }
}

// Um sumidouro que guarda o que o contato falou, para gravar depois.
function recordingSink(sampleRate: number): AudioSink & { recorded: Int16Array[] } {
    const recorded: Int16Array[] = []
    return {
        sampleRate,
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

// Uma saudação gravada a 44,1 kHz, e a gravação da conversa a 48 kHz.
const sink = recordingSink(48_000)

const wavoip = new Wavoip({
    tokens: ["seu-token-de-dispositivo"],
    runtime: nodeRuntime({ source: fileSource("./saudacao.pcm", 44_100), sink }),
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
