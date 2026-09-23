---
description: Controle e monitore uma chamada em andamento — mudo, estatísticas, estado do par e encerramento.
icon: phone
---

# Chamada Ativa

Um objeto `ActiveCall` é fornecido quando uma oferta recebida é aceita ou quando uma chamada realizada é atendida pelo destinatário. Ele oferece controle total sobre a chamada em andamento.

---

## Propriedades

| Propriedade           | Tipo                    | Descrição                                                              |
| --------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `id`                  | `string`                | Identificador único da chamada.                                        |
| `type`                | `CallType`              | `"official"` (WebRTC) ou `"unofficial"` (relay).                       |
| `direction`           | `CallDirection`         | `"INCOMING"` ou `"OUTGOING"`.                                          |
| `peer`                | `CallPeer`              | Parte remota — telefone, nome de exibição, foto de perfil e mudo.      |
| `deviceToken`         | `string`                | Token do dispositivo que gerencia esta chamada.                        |
| `status`              | `CallStatus`            | Estado atual da chamada. Acompanha os eventos do servidor: dentro de qualquer handler já traz o valor novo. |
| `connection`          | `CallConnection`        | A conexão da chamada com as duas pernas somadas: `"connected"`, `"reconnecting"` ou `"disconnected"`. |
| `audioAnalyserIn`     | `Promise<AnalyserNode>` | Resolve para um `AnalyserNode` conectado ao stream de áudio **recebido** (par → alto-falante local). |
| `audioAnalyserOut`    | `Promise<AnalyserNode>` | Resolve para um `AnalyserNode` conectado ao stream de áudio **enviado** (microfone local → par). |

---

## Métodos

### `mute()` / `unmute()`

Alterna o mudo do microfone. Opera na faixa de áudio — sem interrupção do stream, sem renegociação.

```typescript
await call.mute()    // Result<void, CommandFailure>
await call.unmute()
```

---

### `end()`

Encerra a chamada e libera todos os recursos de mídia. O outro lado desligando não passa por
aqui: isso chega como o evento `ended`.

```typescript
const { error } = await call.end()
```

---

### `getStats()`

Retorna um snapshot fresco de `CallStats`. Você controla a cadência — chame conforme a sua UI precisa (por exemplo, por frame de animação para um indicador de áudio, ou a cada segundo para um painel de qualidade).

```typescript
const stats = await call.getStats()
console.log(`RTT médio: ${stats.rtt.avg}ms | bitrate RX: ${stats.audio.rx.bitrate_kbps}kbps`)
```

Comportamento por tipo de chamada:

- **`official`**: dispara `pc.getStats()` no transporte WebRTC e retorna o snapshot resultante (RTT par-a-par, perda, bitrate, audio level, jitter).
- **`unofficial`** (relay): mescla o que o cliente mede (bitrate, níveis, jitter de chegada, fila de reprodução e latência de saída) com a última projeção recebida no push `call:stats` do servidor (RTT das duas pernas, perda, totais). Só a combinação tem a imagem completa.

Antes do transporte ser conectado (raro, apenas durante a transição `RINGING` → `ACTIVE`), retorna um snapshot vazio com zeros.

{% hint style="info" %}
Não existe evento de estatística: quem escolhe quando e com que frequência ler é você. Para um medidor que acompanha a tela, chame `getStats()` no seu próprio `requestAnimationFrame` ou `setInterval`.
{% endhint %}

---

## Eventos

Assine com `call.on(evento, callback)`. Retorna uma função `Unsubscribe`.

| Evento              | Payload             | Descrição                                                                                                              |
| ------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ended`             | —                   | **O outro lado desligou.** Desligar daqui responde no `Result` do `end()`.                                              |
| `failed`            | `WavoipError`       | A chamada caiu por falha. Veja [`ErrorCode`](../types.md#errorcode) para os motivos possíveis.                         |
| `peerMuteChanged`   | `boolean`           | O outro lado silenciou (`true`) ou reativou (`false`) o microfone.                                                      |
| `connectionChanged` | `CallConnection`    | A conexão da chamada mudou, somando as duas pernas (ver abaixo).                                                       |
| `iceDiagnostics`    | `IceDiagnostics`    | Diagnóstico da coleta ICE (duração, candidatos por tipo, STUN/TURN alcançados, par selecionado). Replay em listeners tardios. |
| `connectivityIssue` | `ConnectivityIssue` | Problema de conectividade detectado (`STUN_UNREACHABLE`, `ICE_GATHERING_TIMEOUT`, `ICE_CONNECTION_FAILED`, `NO_HOST_CANDIDATES`, `SYMMETRIC_NAT_SUSPECTED`). Todos os problemas observados são re-emitidos para listeners tardios. |

```typescript
call.on("ended", () => {
    showCallEndedScreen()
})

call.on("peerMuteChanged", (muted) => {
    updatePeerMuteIndicator(muted)
})

call.on("connectionChanged", (connection) => {
    if (connection === "reconnecting") showReconnectingBanner()
    if (connection === "connected") hideReconnectingBanner()
    if (connection === "disconnected") showCallLostScreen()
})

call.on("failed", (error) => {
    console.error("Chamada caiu:", error.code)
})

// Pull de estatísticas — você decide a cadência.
setInterval(async () => {
    const stats = await call.getStats()
    updateStatsDisplay(stats)
}, 1000)
```

---

## Análise de áudio

Dois `AnalyserNode` do Web Audio são expostos — um por direção. Use-os para visualizar a forma de onda da chamada ou detectar silêncio em cada lado independentemente.

- `audioAnalyserIn` — áudio **recebido** do par (vai para o alto-falante local).
- `audioAnalyserOut` — áudio **enviado** pelo microfone local (vai para o par).

```typescript
const [analyserIn, analyserOut] = await Promise.all([
    call.audioAnalyserIn,
    call.audioAnalyserOut,
])

const inBuf = new Uint8Array(analyserIn.frequencyBinCount)
const outBuf = new Uint8Array(analyserOut.frequencyBinCount)

function frame() {
    analyserIn.getByteFrequencyData(inBuf)
    analyserOut.getByteFrequencyData(outBuf)
    // Desenhe inBuf (par falando) e outBuf (usuário falando) em canvas separados…
    requestAnimationFrame(frame)
}
frame()
```

{% hint style="info" %}
O grafo do microfone é ancorado por um `GainNode(0)` ligado ao `destination` para que o `AudioContext` renderize amostras no `audioAnalyserOut` — o ganho zero garante que o seu próprio áudio **não** seja reproduzido no alto-falante.
{% endhint %}

---

## Estatísticas de chamada

O formato completo de `CallStats`:

```typescript
type CallStats = {
    // RTT da perna cliente ⇔ servidor, acumulado ao longo da chamada, em ms
    rtt: { min: number; max: number; avg: number }

    latency: {
        total_ms:         number | null  // a soma do que foi medido
        network_ms:       number | null  // metade do RTT mais recente, cliente ⇔ servidor
        whatsapp_ms:      number | null  // metade do RTT servidor ⇔ WhatsApp
        jitter_buffer_ms: number | null  // áudio que chegou e ainda não tocou
        playout_ms:       number | null  // do motor de áudio até sair no aparelho
    }

    audio: {
        tx: { level: number; bitrate_kbps: number }
        rx: { level: number; bitrate_kbps: number; jitter_ms: number }
    }

    packets: {
        tx: { sent: number; lost: number; bytes: number }
        rx: { received: number; lost: number; bytes: number }
    }
}
```

{% hint style="warning" %}
`null` quer dizer **não medido** nesta plataforma ou neste tipo de chamada — não zero. Um zero
diria que a latência é nula, que é diferente de não saber. O `total_ms` soma só o que foi
medido, e por isso é uma estimativa, não uma medida de ponta a ponta.
{% endhint %}

### De onde vem cada latência

| Campo | Chamada oficial (WebRTC) | Chamada não oficial (relay) |
| --- | --- | --- |
| `network_ms` | `roundTripTime` do `getStats`, dividido por 2 | RTT que o servidor informa no `call:stats`, dividido por 2 |
| `whatsapp_ms` | `null` — a chamada é direta, não passa por essa perna | RTT servidor ⇔ WhatsApp, que só o servidor mede |
| `jitter_buffer_ms` | `jitterBufferDelay / jitterBufferEmittedCount` | medido dentro do worklet de reprodução |
| `playout_ms` | `baseLatency + outputLatency` do `AudioContext` | igual |

{% hint style="info" %}
O `playout_ms` cobre só do motor de áudio até o alto-falante. O que está **esperando na fila**
para tocar é o `jitter_buffer_ms`, e numa chamada por relay ele costuma ser o maior dos dois:
a fila de reprodução segura até cerca de 780ms de áudio antes de começar a descartar.
{% endhint %}

A origem dos demais campos depende do tipo da chamada:

- **Chamada oficial**: tudo medido localmente pelo `RTCPeerConnection.getStats()`.
- **Chamada não oficial (relay)**: o servidor envia RTT, perda e totais via `call:stats`; o transporte WebSocket mede bitrate, níveis de áudio, jitter de chegada e as duas latências locais. `getStats()` devolve a mescla.

`ServerCallStats` permanece exposto para quem precisa do RTT separado servidor↔cliente / servidor↔WhatsApp em chamadas não oficiais:

```typescript
type ServerCallStats = {
    rtt: {
        client:   { min: number; max: number; avg: number }  // ms — servidor ↔ cliente
        whatsapp: { min: number; max: number; avg: number }  // ms — servidor ↔ WhatsApp
    }
    tx: { total: number; total_bytes: number; loss: number }
    rx: { total: number; total_bytes: number; loss: number }
}
```

---

## Diagnóstico ICE e problemas de conectividade

Use `iceDiagnostics` para inspecionar a coleta de candidatos ICE (host/srflx/prflx/relay), confirmar se STUN/TURN foram alcançados e identificar o par selecionado. Use `connectivityIssue` para reagir a falhas conhecidas como `STUN_UNREACHABLE` ou `ICE_CONNECTION_FAILED`.

```typescript
call.on("iceDiagnostics", (diag) => {
    console.log("ICE:", diag.candidatesByType, "STUN:", diag.stunReached, "TURN:", diag.turnReached)
})

call.on("connectivityIssue", (issue) => {
    showConnectivityBanner(issue)
})
```

{% hint style="info" %}
Se você assinar `iceDiagnostics` ou `connectivityIssue` depois que a chamada já iniciou (por exemplo, ao abrir um painel de diagnóstico após o atendimento), o `ActiveCall` re-emite o último `iceDiagnostics` conhecido e todos os `connectivityIssue` já observados. Isso garante que o consumidor reconstrua o estado completo sem precisar coordenar a assinatura com o ciclo de aceitação.
{% endhint %}

Veja [Tipos → Diagnóstico ICE](../types.md#diagnostico-ice) para os payloads completos.

---

## Recuperação de conexão

Uma chamada tem **duas pernas**: a mídia entre você e o servidor, e a perna entre o servidor e
o WhatsApp. As duas caem de formas diferentes, e a `connection` soma as duas num estado só —
qualquer uma delas caindo de forma recuperável deixa a chamada em `"reconnecting"`.

Para chamadas não oficiais (relay), o transporte WebSocket se reconecta sozinho em desconexões
inesperadas. O evento `connectionChanged` rastreia isso:

{% stepper %}
{% step %}
## Conectado

As duas pernas de pé. `connection === "connected"`.
{% endstep %}

{% step %}
## Reconectando

O WebSocket caiu inesperadamente, ou o servidor avisou que a perna do WhatsApp parou. A
biblioteca tenta reconectar a cada 1 segundo por até 30 segundos. `connection === "reconnecting"`.
{% endstep %}

{% step %}
## Desconectado

Prazo de 30 segundos excedido sem reconexão bem-sucedida.
`connection === "disconnected"` — trate a chamada como perdida.
{% endstep %}
{% endstepper %}

---

## Exemplo completo

```typescript
wavoip.on("offer", async (offer) => {
    const { data: call, error } = await offer.accept()
    if (error) return

    call.on("peerMuteChanged", setPeerMuted)

    call.on("connectionChanged", (connection) => {
        if (connection === "reconnecting") showReconnectingBanner()
        if (connection === "connected") hideReconnectingBanner()
    })

    const statsTimer = setInterval(async () => {
        const { rtt, audio, packets, latency } = await call.getStats()
        updateStatsDisplay({
            rtt: rtt.avg,
            loss: packets.rx.lost,
            jitter: audio.rx.jitter_ms,
            latency: latency.total_ms,
        })
    }, 500)

    call.on("ended", () => {
        clearInterval(statsTimer)
        closeCallUI()
    })

    // Botão de mudo
    document.getElementById("mute-btn")?.addEventListener("click", () => {
        call.mute()
    })

    // Botão de encerrar chamada
    document.getElementById("end-btn")?.addEventListener("click", () => {
        call.end()
    })
})
```
