---
description: Control and monitor an in-progress call — mute, stats, peer state, and teardown.
icon: phone
---

# Active Call

A `CallActive` object is provided either when an incoming offer is accepted or when an outgoing call is answered by the peer. It gives full control over the in-progress call.

---

## Properties

| Property            | Type              | Description                                                          |
| ------------------- | ----------------- | -------------------------------------------------------------------- |
| `id`                | `string`          | Unique call identifier.                                              |
| `type`              | `CallType`        | `"official"` (WebRTC) or `"unofficial"` (relay).                    |
| `direction`         | `CallDirection`   | `"INCOMING"` or `"OUTGOING"`.                                        |
| `peer`              | `CallPeer`        | Remote party — phone, display name, profile picture, and mute state. |
| `device_token`      | `string`          | Token of the device handling this call.                              |
| `status`            | `CallStatus`      | Current call state.                                                  |
| `connection_status` | `TransportStatus` | Media transport state: `"connecting"`, `"connected"`, `"reconnecting"`, or `"disconnected"`. |
| `audio_analyser`    | `Promise<AnalyserNode>` | Resolves to a Web Audio `AnalyserNode` connected to the remote audio stream. |

---

## Methods

### `mute()` / `unmute()`

Toggle microphone mute. Operates on the audio track — no stream teardown, no re-negotiation.

```typescript
await call.mute()    // { err: string | null }
await call.unmute()
```

---

### `end()`

Terminate the call and clean up all media resources.

```typescript
await call.end()
```

---

## Events

Subscribe with `call.on(event, callback)`. Returns an `Unsubscribe` function.

| Event              | Payload           | Description                                              |
| ------------------ | ----------------- | -------------------------------------------------------- |
| `ended`            | —                 | Call ended (by either party).                            |
| `peerMute`         | —                 | Remote party muted their microphone.                     |
| `peerUnmute`       | —                 | Remote party unmuted their microphone.                   |
| `connectionStatus` | `TransportStatus` | Media transport connection state changed.                |
| `stats`            | `CallStats`       | Periodic call quality statistics (RTT, packet loss).     |
| `error`            | `string`          | A transport-level error occurred.                        |
| `status`           | `CallStatus`      | Call status changed.                                     |

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
    console.log("Transport:", status)
})

call.on("stats", (stats) => {
    console.log(`RTT avg: ${stats.rtt.avg}ms | RX loss: ${stats.rx.loss}`)
})

call.on("error", (err) => {
    console.error("Call error:", err)
})
```

---

## Audio analysis

`audio_analyser` resolves to a Web Audio `AnalyserNode` connected to the remote audio stream. Use it to visualise the call waveform or detect silence.

```typescript
const analyser = await call.audio_analyser

const dataArray = new Uint8Array(analyser.frequencyBinCount)
analyser.getByteFrequencyData(dataArray)
// Draw dataArray on a canvas…
```

---

## Call statistics

The `stats` event fires periodically with a `CallStats` object:

```typescript
type CallStats = {
    rtt: { min: number; max: number; avg: number }  // milliseconds
    tx: { total: number; total_bytes: number; loss: number }
    rx: { total: number; total_bytes: number; loss: number }
}
```

---

## Connection recovery

For unofficial (relay) calls, the WebSocket transport reconnects automatically on unexpected disconnections. The `connectionStatus` event tracks this:

{% stepper %}
{% step %}
## Connected

Call is running normally. `connection_status === "connected"`.
{% endstep %}

{% step %}
## Reconnecting

WebSocket dropped unexpectedly. Library retries every 1 second for up to 30 seconds.
`connection_status === "reconnecting"`.
{% endstep %}

{% step %}
## Disconnected

30-second deadline exceeded with no successful reconnect.
`connection_status === "disconnected"` — treat the call as lost.
{% endstep %}
{% endstepper %}

---

## Full example

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

    // Mute button handler
    document.getElementById("mute-btn")?.addEventListener("click", () => {
        call.mute()
    })

    // End call button handler
    document.getElementById("end-btn")?.addEventListener("click", () => {
        call.end()
    })
})
```
