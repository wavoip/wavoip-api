---
description: Enumere e troque microfones e alto-falantes durante chamadas.
icon: microphone
---

# Mídia

A biblioteca gerencia todo o I/O de áudio através de um único `MediaManager` compartilhado. Você interage com ele através de métodos na instância `Wavoip`.

---

## Listando dispositivos disponíveis

```typescript
const devices = wavoip.getMultimediaDevices()
// MediaDeviceInfo[]

const mics     = devices.filter((d) => d.kind === "audioinput")
const speakers = devices.filter((d) => d.kind === "audiooutput")
```

`MediaDeviceInfo` é o tipo padrão do navegador. Campos principais:

| Campo      | Descrição                                              |
| ---------- | ------------------------------------------------------ |
| `deviceId` | Identificador único do dispositivo.                    |
| `kind`     | `"audioinput"` ou `"audiooutput"`.                     |
| `label`    | Nome legível (ex: `"Microfone integrado"`).            |

---

## Dispositivos ativos

```typescript
const { microphone, speaker } = wavoip.multimedia
// MediaDeviceInfo | undefined
```

Retorna os dispositivos de entrada e saída atualmente selecionados.

---

## Trocando o microfone

Use `wavoip.setMicrophone(deviceId)` para escolher o microfone antes ou durante uma chamada. Se houver uma chamada ativa, a troca acontece a quente — o áudio continua sem corte.

```typescript
const { err } = await wavoip.setMicrophone(mic.deviceId)
if (err) console.error(err)
```

As facades de chamada (`CallActive` e `CallOutgoing`) também expõem `setMicrophone(deviceId)` com a mesma semântica — útil quando você só tem o objeto da chamada em mãos.

```typescript
await callActive.setMicrophone(mic.deviceId)
await callOutgoing.setMicrophone(mic.deviceId)
```

### Evento `micChanged`

Disparado sempre que o microfone ativo muda — seja por chamada explícita a `setMicrophone`, seja porque o dispositivo atual foi desconectado fisicamente.

```typescript
wavoip.on("micChanged", (device) => {
    if (!device) console.warn("Microfone removido")
    else console.log("Novo microfone:", device.label)
})

callActive.on("micChanged", (device) => { /* mesma assinatura */ })
callOutgoing.on("micChanged", (device) => { /* mesma assinatura */ })
```

### Evento `devicesChanged`

Disparado quando a lista de dispositivos do sistema muda (conectar/desconectar fones, por exemplo). Use para atualizar seletores em tela.

```typescript
wavoip.on("devicesChanged", (devices) => {
    // re-render dropdowns
})
```

{% hint style="info" %}
A troca a quente substitui a track de áudio dentro do `MediaStream` compartilhado. No transporte WebRTC chamamos `RTCRtpSender.replaceTrack`; no transporte WebSocket recriamos o `MediaStreamAudioSourceNode` mantendo o worklet de resample.
{% endhint %}

---

## Padrão típico de seletor de dispositivo

```typescript
async function buildDevicePicker(wavoip) {
    const devices = wavoip.getMultimediaDevices()
    const { microphone, speaker } = wavoip.multimedia

    const mics     = devices.filter((d) => d.kind === "audioinput")
    const speakers = devices.filter((d) => d.kind === "audiooutput")

    // Renderize dropdowns usando mics / speakers
    // Marque microphone.deviceId e speaker.deviceId como selecionados
}
```

---

## Notas sobre o AudioContext

Um único `AudioContext` é compartilhado entre todas as chamadas. Ele é criado na construção do `Wavoip` e suspenso até o início da primeira chamada. Retoma automaticamente quando a captura de áudio começa e suspende quando todas as chamadas terminam.

{% hint style="warning" %}
Os navegadores exigem um gesto do usuário antes que o `AudioContext` possa retomar. Certifique-se de que `offer.accept()` ou `wavoip.startCall()` seja chamado a partir de um handler de clique ou toque.
{% endhint %}

---

## Estatísticas de qualidade de chamada

A qualidade de áudio por chamada é reportada pelo evento `stats` no `CallActive`:

```typescript
call.on("stats", (stats) => {
    console.log("Tempo de ida e volta:", stats.rtt.avg, "ms")
    console.log("Perda de pacotes RX:", stats.rx.loss)
})
```

Veja [Chamada Ativa → Estatísticas de chamada](calls/active.md#estatísticas-de-chamada) para o tipo completo de `CallStats`.
