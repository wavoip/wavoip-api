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

Chame `setMicrophone` em um dispositivo obtido via `getDevices()`, ou acesse o `MediaManager` subjacente pelo socket interno do dispositivo. Na prática, o `MediaManager` é acessado indiretamente: a biblioteca realiza uma troca a quente sem interrupção enquanto uma chamada está ativa.

{% hint style="info" %}
A troca de microfone e alto-falante é tratada internamente pelo `MediaManager` compartilhado. As preferências de dispositivo são aplicadas a todas as chamadas ativas e futuras automaticamente.
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
