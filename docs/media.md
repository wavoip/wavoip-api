---
description: Os microfones e alto-falantes que a biblioteca enxerga, e como o áudio é tratado.
icon: microphone
---

# Mídia

`wavoip.audio` é por onde a biblioteca conta o que ela vê de áudio. Todas as chamadas
compartilham a mesma captura, então o que está aqui vale para todas elas.

---

## Listando os aparelhos

```typescript
const mics     = wavoip.audio.listInputDevices()
const speakers = wavoip.audio.listOutputDevices()
```

Cada um é um `AudioDevice`:

| Campo   | Descrição                                                        |
| ------- | ---------------------------------------------------------------- |
| `id`    | Identificador do aparelho, do jeito que a plataforma o nomeia.     |
| `label` | Nome legível (ex.: `"Microfone integrado"`).                      |
| `kind`  | `"input"` ou `"output"`.                                          |

{% hint style="warning" %}
**O `label` vem vazio antes da primeira permissão de microfone.** É assim que o navegador
evita que uma página identifique o seu hardware sem você deixar. Depois da primeira chamada
aceita, os nomes aparecem.
{% endhint %}

---

## O aparelho em uso

```typescript
wavoip.audio.currentInput    // AudioDevice | null
wavoip.audio.currentOutput   // AudioDevice | null
```

`null` quer dizer que nenhuma chamada abriu o microfone ainda. Depois disso, `currentInput`
traz o aparelho que o sistema efetivamente entregou — que pode não ser o primeiro da lista.

Os dois são getters vivos: leia-os quando for desenhar, e não guarde uma cópia.

```typescript
function renderDevicePicker() {
    const mics = wavoip.audio.listInputDevices()
    const current = wavoip.audio.currentInput

    for (const mic of mics) {
        addOption(mic.id, mic.label, { selected: mic.id === current?.id })
    }
}
```

---

## Escolhendo o aparelho

```typescript
const { error } = await wavoip.audio.selectInput(mic.id)
if (error) console.error(error.code)

await wavoip.audio.selectOutput(speaker.id)
```

O `id` é o de um aparelho que `listInputDevices()` ou `listOutputDevices()` devolveu. **A troca
vale para a chamada em curso**: a track é substituída sem desligar, e quem está do outro lado
não percebe nada além da mudança de microfone.

Os dois devolvem `Result`, porque nem toda plataforma escolhe:

| Código | Quando |
| --- | --- |
| `AUDIO_DEVICE_NOT_FOUND` | o `id` não está na lista; ele volta em `details` |
| `OUTPUT_SELECTION_UNSUPPORTED` | a plataforma não escolhe a saída — um navegador sem `setSinkId`, por exemplo |
| `INPUT_SELECTION_UNSUPPORTED` | a plataforma não escolhe o microfone; quem decide é o sistema |

{% hint style="info" %}
No celular, a escolha de saída é entre o fone do aparelho e o viva-voz, e os dois aparecem em
`listOutputDevices()`. Ver [React Native](platforms/react-native.md).
{% endhint %}

```typescript
async function onPickMicrophone(id: string) {
    const { error } = await wavoip.audio.selectInput(id)
    if (error) return showMessage(traduzir(error.code))

    renderDevicePicker()   // o `currentInput` já reflete a troca
}
```

{% hint style="info" %}
Testar o microfone antes da chamada e controlar o volume ainda não estão na API.
{% endhint %}

---

## Desenhando o áudio

```typescript
call.audio.in.level()      // 0 a 1, o contato falando
call.audio.in.spectrum()   // uma banda de frequência por byte, 0 a 255, da grave à aguda
```

Os dois são síncronos, para ler dentro de um `requestAnimationFrame`. O espectro desenhado
como barras é uma onda sonora:

```typescript
function drawWave(canvas: HTMLCanvasElement, call: ActiveCall) {
    const bands = call.audio.in.spectrum()
    if (bands.length === 0) return   // esta plataforma não analisa o áudio

    const perBar = Math.floor(bands.length / 15)
    for (let bar = 0; bar < 15; bar++) {
        drawBar(canvas, bar, bands[bar * perBar] / 255)
    }
}
```

{% hint style="warning" %}
**Confira o `length` antes de desenhar.** Vazio é diferente de uma faixa de zeros: zeros
pareceriam silêncio medido.
{% endhint %}

| Ambiente | Espectro | Por quê |
| --- | --- | --- |
| Navegador | ✅ | do `AnalyserNode`, que a chamada já usa |
| Node.js | ✅ | o PCM atravessa o processo, então há o que analisar |
| React Native | só na chamada não oficial | na oficial o sistema toca em nativo, e nada passa pelo JavaScript para ser analisado |

---

## Áudio estourado

```typescript
call.audio.out.clipping()   // o seu microfone, de 0 a 1
call.audio.in.clipping()    // o que chega do contato
```

A fração de amostras que bateram no teto do conversor no último instante. Acima de uns 2% já
se ouve como aspereza na voz.

{% hint style="danger" %}
**Nível alto não é a mesma coisa que estourado.** Um sinal forte e limpo tem `level()` alto e
`clipping()` zero. Quando o ganho passa do ponto, o topo da onda é cortado fora — e **nada
recupera o que foi cortado**: baixar o volume depois só deixa a distorção mais baixa. É por
isso que existe uma leitura separada.
{% endhint %}

| Onde | O que significa | O que dizer à pessoa |
| --- | --- | --- |
| `out.clipping()` alto | o microfone dela está com ganho demais | baixar o ganho no sistema, ou no botão do próprio microfone |
| `in.clipping()` alto | o áudio chegou assim | o problema é do outro lado; nada a fazer daqui |

```typescript
function renderWarning(call: ActiveCall) {
    if (call.audio.out.clipping() > 0.02) {
        show("Seu microfone está com volume alto demais e a voz está distorcendo.")
    }
}
```

{% hint style="info" %}
A biblioteca **não corrige** o ganho. No navegador ela já pede `autoGainControl` ao sistema,
mas quando o sinal chega ceifado não há o que ajustar — só quem está no controle do aparelho
resolve. Por isso ela mede e conta, em vez de tentar consertar.
{% endhint %}

---

## Notas sobre o áudio

A biblioteca mantém um motor de áudio só, compartilhado entre todas as chamadas. Ele é criado
junto com o `Wavoip` e fica suspenso até a primeira chamada: retoma quando a captura começa e
suspende de novo quando a última chamada termina.

{% hint style="warning" %}
Os navegadores exigem um gesto do usuário para o áudio poder tocar. Chame `offer.accept()` ou
`wavoip.startCall()` de dentro de um handler de clique ou toque.
{% endhint %}

O áudio que cruza uma chamada não oficial é PCM Int16 a 16 kHz, reamostrado dentro de um
worklet — não é µ-law.

---

## Qualidade da chamada

A qualidade por chamada sai do `getStats()` do `ActiveCall`, na cadência que você escolher:

```typescript
const { rtt, packets, latency } = await call.getStats()
console.log("Ida e volta:", rtt.avg, "ms")
console.log("Perda RX:", packets.rx.lost)
console.log("Latência estimada:", latency.total_ms, "ms")
```

Veja [Chamada Ativa → Estatísticas de chamada](calls/active.md#estatisticas-de-chamada) para o
tipo completo de `CallStats`, e para de onde vem cada latência.
