---
description: Create a Wavoip instance and understand its top-level API.
icon: rocket
---

# Initialization

## Constructor

```typescript
import { Wavoip } from "@wavoip/wavoip-api"

const wavoip = new Wavoip({
    tokens: ["token-1", "token-2"],
    platform?: string,        // optional — identifies the client platform
})
```

| Parameter  | Type       | Required | Description                                          |
| ---------- | ---------- | -------- | ---------------------------------------------------- |
| `tokens`   | `string[]` | Yes      | One or more Wavoip device tokens. Duplicates are ignored. |
| `platform` | `string`   | No       | Platform identifier sent to the server on connection. |

Each token creates a persistent WebSocket connection to the Wavoip infrastructure. The library immediately begins connecting on construction — no explicit `.connect()` call is needed.

---

## Events

### `offer`

Emitted when an incoming call arrives on any connected device.

```typescript
const unsub = wavoip.on("offer", (offer) => {
    console.log("Incoming call from", offer.peer.phone)
    // See Incoming Calls for what to do with `offer`
})

// Stop listening
unsub()
```

---

## Methods

### `getDevices()`

Returns a snapshot of all registered devices.

```typescript
const devices = wavoip.getDevices()
// Device[]
```

See [Device](../device.md) for the full `Device` interface.

---

### `addDevices(tokens)`

Adds new devices to the instance at runtime. Already-registered tokens are silently ignored.

```typescript
const added = wavoip.addDevices(["new-token"])
// Device[]  — only the newly added devices
```

---

### `removeDevices(tokens)`

Disconnects and removes devices by token. Returns the devices that remain.

```typescript
const remaining = wavoip.removeDevices(["token-to-remove"])
// Device[]
```

---

### `startCall(params)`

Initiates an outgoing call. Tries each eligible device in sequence and returns on the first success.

```typescript
const result = await wavoip.startCall({
    to: "+5511999999999",
    fromTokens?: string[],    // restrict which devices to try; default: all
})
```

**Success:**

```typescript
const { call, err } = result
// call: CallOutgoing  —  err: null
```

**Failure (all devices failed):**

```typescript
const { call, err } = result
// call: null
// err: { message: string; devices: { token: string; reason: string }[] }
```

See [Outgoing Calls](../calls/outgoing.md) for the full `CallOutgoing` API.

---

### `startCallIterator(params)`

An async generator variant of `startCall` that yields each device attempt before returning the final result. Useful when you want to show per-device feedback in the UI.

```typescript
const iter = wavoip.startCallIterator({ to: "+5511999999999" })

// Each yield is a failed attempt on one device
for await (const attempt of iter) {
    console.warn(`Device ${attempt.token} failed:`, attempt.err)
}

// .return() holds the final result
const result = await iter.return(undefined)
if (result.value?.call) {
    const call = result.value.call
}
```

{% hint style="info" %}
`startCall` is simpler for most use cases. Use `startCallIterator` only when per-device progress matters to the user.
{% endhint %}

---

### `wakeUpDevices(tokens?)`

Wakes hibernating devices. Returns an array of Promises so you can `Promise.all` them or handle results individually.

```typescript
const results = await Promise.all(wavoip.wakeUpDevices())
// { token: string; waken: boolean }[]
```

Pass an array of tokens to target specific devices; omit to wake all.

---

### `wakeUpDevicesIterator(tokens?)`

Async generator variant — yields each wake result as it completes.

```typescript
for await (const result of wavoip.wakeUpDevicesIterator()) {
    console.log(result.token, result.waken ? "woke up" : "failed")
}
```

---

### `getMultimediaDevices()`

Lists all available microphone and speaker devices.

```typescript
const devices = wavoip.getMultimediaDevices()
// MediaDeviceInfo[]
```

---

### `multimedia` (property)

Returns the currently active microphone and speaker.

```typescript
const { microphone, speaker } = wavoip.multimedia
// microphone: MediaDeviceInfo | undefined
// speaker:    MediaDeviceInfo | undefined
```
