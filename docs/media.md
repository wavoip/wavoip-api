---
description: Enumerate and switch microphones and speakers during calls.
icon: microphone
---

# Media

The library manages all audio I/O through a single shared `MediaManager`. You interact with it through methods on the `Wavoip` instance.

---

## Listing available devices

```typescript
const devices = wavoip.getMultimediaDevices()
// MediaDeviceInfo[]

const mics     = devices.filter((d) => d.kind === "audioinput")
const speakers = devices.filter((d) => d.kind === "audiooutput")
```

`MediaDeviceInfo` is the standard browser type. Key fields:

| Field        | Description                             |
| ------------ | --------------------------------------- |
| `deviceId`   | Unique identifier for the device.       |
| `kind`       | `"audioinput"` or `"audiooutput"`.      |
| `label`      | Human-readable name (e.g. `"Built-in Microphone"`). |

---

## Active devices

```typescript
const { microphone, speaker } = wavoip.multimedia
// MediaDeviceInfo | undefined
```

Returns the currently selected input and output devices.

---

## Switching microphone

Call `setMicrophone` on a device retrieved from `getDevices()`, or access the underlying `MediaManager` through the device's internal socket. In practice, you get the `MediaManager` indirectly: the library performs a seamless hot-swap while a call is active — there is no interruption.

{% hint style="info" %}
Microphone and speaker switching is handled internally by the shared `MediaManager`. Device preferences are applied to all active and future calls automatically.
{% endhint %}

---

## Typical device picker pattern

```typescript
async function buildDevicePicker(wavoip) {
    const devices = wavoip.getMultimediaDevices()
    const { microphone, speaker } = wavoip.multimedia

    const mics     = devices.filter((d) => d.kind === "audioinput")
    const speakers = devices.filter((d) => d.kind === "audiooutput")

    // Render dropdowns using mics / speakers
    // Mark microphone.deviceId and speaker.deviceId as selected
}
```

---

## Audio context notes

A single `AudioContext` is shared across all calls. It is created on `Wavoip` construction and suspended until the first call starts. It resumes automatically when audio capture begins and suspends when all calls end.

{% hint style="warning" %}
Browsers require a user gesture before the `AudioContext` can resume. Ensure `offer.accept()` or `wavoip.startCall()` is called from a click or touch event handler.
{% endhint %}

---

## Call quality stats

Per-call audio quality is reported through the `stats` event on `CallActive`:

```typescript
call.on("stats", (stats) => {
    console.log("Round-trip time:", stats.rtt.avg, "ms")
    console.log("RX packet loss:", stats.rx.loss)
})
```

See [Active Call → Call statistics](calls/active.md#call-statistics) for the full `CallStats` type.
