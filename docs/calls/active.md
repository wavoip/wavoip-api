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

| Evento             | Payload           | Descrição                                                    |
| ------------------ | ----------------- | ------------------------------------------------------------ |
| `ended`            | —                 | Chamada encerrada (por qualquer uma das partes).             |
| `peerMute`         | —                 | Parte remota silenciou o microfone.                          |
| `peerUnmute`       | —                 | Parte remota ativou o microfone.                             |
| `connectionStatus` | `TransportStatus` | Estado de conexão do transporte de mídia mudou.              |
| `stats`            | `CallStats`       | Estatísticas periódicas de qualidade (RTT, perda de pacotes).|
| `error`            | `string`          | Ocorreu um erro no nível de transporte.                      |
| `status`           | `CallStatus`      | Status da chamada mudou.                                     |

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

O evento `stats` é emitido periodicamente com um objeto `CallStats`:

```typescript
type CallStats = {
    rtt: { min: number; max: number; avg: number }  // milissegundos
    tx: { total: number; total_bytes: number; loss: number }
    rx: { total: number; total_bytes: number; loss: number }
}
```

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
