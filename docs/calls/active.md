---
description: Controle e monitore uma chamada em andamento — mudo, estatísticas, estado do par e encerramento.
icon: phone
---

# Chamada Ativa

Um objeto `CallActive` é fornecido quando uma oferta recebida é aceita ou quando uma chamada realizada é atendida pelo destinatário. Ele oferece controle total sobre a chamada em andamento.

---

## Propriedades

| Propriedade         | Tipo                    | Descrição                                                              |
| ------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `id`                | `string`                | Identificador único da chamada.                                        |
| `type`              | `CallType`              | `"official"` (WebRTC) ou `"unofficial"` (relay).                       |
| `direction`         | `CallDirection`         | `"INCOMING"` ou `"OUTGOING"`.                                          |
| `peer`              | `CallPeer`              | Parte remota — telefone, nome de exibição, foto de perfil e mudo.      |
| `device_token`      | `string`                | Token do dispositivo que gerencia esta chamada.                        |
| `status`            | `CallStatus`            | Estado atual da chamada.                                               |
| `connection_status` | `TransportStatus`       | Estado do transporte de mídia: `"connecting"`, `"connected"`, `"reconnecting"` ou `"disconnected"`. |
| `audio_analyser`    | `Promise<AnalyserNode>` | Resolve para um `AnalyserNode` do Web Audio conectado ao stream de áudio remoto. |

---

## Métodos

### `mute()` / `unmute()`

Alterna o mudo do microfone. Opera na faixa de áudio — sem interrupção do stream, sem renegociação.

```typescript
await call.mute()    // { err: string | null }
await call.unmute()
```

---

### `end()`

Encerra a chamada e libera todos os recursos de mídia.

```typescript
await call.end()
```

---

## Eventos

Assine com `call.on(evento, callback)`. Retorna uma função `Unsubscribe`.

| Evento              | Payload             | Descrição                                                                                                              |
| ------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ended`             | —                   | Chamada encerrada (por qualquer uma das partes).                                                                       |
| `peerMute`          | —                   | Parte remota silenciou o microfone.                                                                                    |
| `peerUnmute`        | —                   | Parte remota ativou o microfone.                                                                                       |
| `connectionStatus`  | `TransportStatus`   | Estado de conexão do transporte de mídia mudou.                                                                        |
| `stats`             | `CallStats`         | Estatísticas periódicas de qualidade da chamada (RTT cliente, pacotes, perda). Projeção do payload `serverStats` — funciona igual em chamadas oficiais e não oficiais. |
| `serverStats`       | `ServerCallStats`   | Estatísticas brutas agregadas pelos servidores Wavoip, com RTT separado (servidor↔cliente e servidor↔WhatsApp).        |
| `iceDiagnostics`    | `IceDiagnostics`    | Diagnóstico da coleta ICE (duração, candidatos por tipo, STUN/TURN alcançados, par selecionado). Replay em listeners tardios. |
| `connectivityIssue` | `ConnectivityIssue` | Problema de conectividade detectado (`STUN_UNREACHABLE`, `ICE_GATHERING_TIMEOUT`, `ICE_CONNECTION_FAILED`, `NO_HOST_CANDIDATES`, `SYMMETRIC_NAT_SUSPECTED`). Todos os problemas observados são re-emitidos para listeners tardios. |
| `error`             | `string`            | Ocorreu um erro no nível de transporte.                                                                                |
| `status`            | `CallStatus`        | Status da chamada mudou.                                                                                               |

```typescript
call.on("ended", () => {
    showCallEndedScreen()
})

call.on("peerMute", () => {
    updatePeerMuteIndicator(true)
})

call.on("peerUnmute", () => {
    updatePeerMuteIndicator(false)
})

call.on("connectionStatus", (status) => {
    console.log("Transporte:", status)
})

call.on("stats", (stats) => {
    console.log(`RTT médio: ${stats.rtt.avg}ms | Perda RX: ${stats.rx.loss}`)
})

call.on("error", (err) => {
    console.error("Erro na chamada:", err)
})
```

---

## Análise de áudio

`audio_analyser` resolve para um `AnalyserNode` do Web Audio conectado ao stream de áudio remoto. Use-o para visualizar a forma de onda da chamada ou detectar silêncio.

```typescript
const analyser = await call.audio_analyser

const dataArray = new Uint8Array(analyser.frequencyBinCount)
analyser.getByteFrequencyData(dataArray)
// Desenhe dataArray em um canvas…
```

---

## Estatísticas de chamada

Os servidores Wavoip são a fonte da verdade para estatísticas de chamada. O evento `stats` é uma projeção de `serverStats` no formato `CallStats` — usa o RTT do trecho servidor↔cliente. Use `serverStats` quando precisar do RTT servidor↔WhatsApp separadamente.

```typescript
type CallStats = {
    rtt: { min: number; max: number; avg: number }  // milissegundos
    tx: { total: number; total_bytes: number; loss: number }
    rx: { total: number; total_bytes: number; loss: number }
}

type ServerCallStats = {
    rtt: {
        client:   { min: number; max: number; avg: number }  // servidor ↔ cliente
        whatsapp: { min: number; max: number; avg: number }  // servidor ↔ WhatsApp
    }
    tx: { total: number; total_bytes: number; loss: number }
    rx: { total: number; total_bytes: number; loss: number }
}
```

```typescript
call.on("serverStats", ({ rtt }) => {
    console.log(`servidor↔cliente: ${rtt.client.avg}ms | servidor↔WhatsApp: ${rtt.whatsapp.avg}ms`)
})
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
Se você assinar `iceDiagnostics` ou `connectivityIssue` depois que a chamada já iniciou (por exemplo, ao abrir um painel de diagnóstico após o atendimento), o `CallActive` re-emite o último `iceDiagnostics` conhecido e todos os `connectivityIssue` já observados. Isso garante que o consumidor reconstrua o estado completo sem precisar coordenar a assinatura com o ciclo de aceitação.
{% endhint %}

Veja [Tipos → Diagnóstico ICE](../types.md#diagnostico-ice) para os payloads completos.

---

## Recuperação de conexão

Para chamadas não oficiais (relay), o transporte WebSocket se reconecta automaticamente em desconexões inesperadas. O evento `connectionStatus` rastreia isso:

{% stepper %}
{% step %}
## Conectado

Chamada funcionando normalmente. `connection_status === "connected"`.
{% endstep %}

{% step %}
## Reconectando

WebSocket caiu inesperadamente. A biblioteca tenta reconectar a cada 1 segundo por até 30 segundos.
`connection_status === "reconnecting"`.
{% endstep %}

{% step %}
## Desconectado

Prazo de 30 segundos excedido sem reconexão bem-sucedida.
`connection_status === "disconnected"` — trate a chamada como perdida.
{% endstep %}
{% endstepper %}

---

## Exemplo completo

```typescript
wavoip.on("offer", async (offer) => {
    const { call, err } = await offer.accept()
    if (err || !call) return

    call.on("peerMute",   () => setPeerMuted(true))
    call.on("peerUnmute", () => setPeerMuted(false))

    call.on("connectionStatus", (status) => {
        if (status === "reconnecting") showReconnectingBanner()
        if (status === "connected")   hideReconnectingBanner()
    })

    call.on("stats", ({ rtt, rx }) => {
        updateStatsDisplay({ rtt: rtt.avg, loss: rx.loss })
    })

    call.on("ended", () => {
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
