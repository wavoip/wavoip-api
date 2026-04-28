---
description: Manage individual Wavoip devices — status, pairing, and lifecycle.
icon: mobile
---

# Device

A `Device` represents a single Wavoip device identified by its token. Each device maintains a persistent WebSocket connection and exposes real-time status, QR code, and contact information.

Devices are returned by `wavoip.getDevices()`, `wavoip.addDevices()`, and `wavoip.removeDevices()`.

---

## Properties

| Property  | Type            | Description                                      |
| --------- | --------------- | ------------------------------------------------ |
| `token`   | `string`        | Unique device token (read-only).                 |
| `status`  | `DeviceStatus`  | Current connection/pairing state.                |
| `qrCode`  | `string \| undefined` | QR code string when device is in `connecting` state. |
| `contact` | `Contact \| undefined` | Linked WhatsApp number when device is `open`. |

---

## Device status

| Status                      | Meaning                                                                 |
| --------------------------- | ----------------------------------------------------------------------- |
| `disconnected`              | WebSocket is not connected. Auto-reconnect is in progress.              |
| `close`                     | Connected but no WhatsApp number linked. May enter hibernation.         |
| `connecting`                | QR code is ready — waiting for WhatsApp to be scanned.                  |
| `open`                      | Linked and ready to make/receive calls.                                 |
| `restarting`                | Device is restarting; new calls are blocked.                            |
| `hibernating`               | Inactive for 2.5+ minutes. Call `wakeUp()` to reactivate.              |
| `BUILDING`                  | Device is initialising; calls unavailable.                              |
| `WAITING_PAYMENT`           | Account payment required.                                               |
| `EXTERNAL_INTEGRATION_ERROR`| External WhatsApp integration error; restart required.                  |

{% hint style="info" %}
The device auto-reconnects on unexpected WebSocket drops. `disconnected` is transient — the library tries up to three reconnection attempts before giving up.
{% endhint %}

---

## Events

Subscribe with `device.on(event, callback)`. Returns an `Unsubscribe` function.

### `statusChanged`

```typescript
const unsub = device.on("statusChanged", (status: DeviceStatus) => {
    console.log("Status:", status)
})
```

### `qrCodeChanged`

Emitted whenever the QR code string changes (including when it clears after successful pairing).

```typescript
device.on("qrCodeChanged", (qrCode?: string) => {
    if (qrCode) renderQR(qrCode)
    else console.log("QR code cleared")
})
```

### `contactChanged`

Emitted when the linked WhatsApp contact changes — on pairing, logout, or reconnect.

```typescript
device.on("contactChanged", (contact?: Contact) => {
    if (contact) console.log("Linked to:", contact.phone)
})
```

---

## Methods

### `restart()`

Restarts the Wavoip device. Ongoing calls finish before restart begins.

```typescript
await device.restart()
```

---

### `logout()`

Unlinks the WhatsApp number from the device.

```typescript
await device.logout()
```

---

### `wakeUp()`

Wakes a hibernating device. Returns `true` if the device responded.

```typescript
const woken = await device.wakeUp()
```

---

### `pairingCode(phone)`

Requests a pairing code for linking a phone number without QR code scanning.

```typescript
const result = await device.pairingCode("+5511999999999")

if (result.err) {
    console.error(result.err)
} else {
    console.log("Pairing code:", result.pairingCode)
}
```

| Return field   | Type              | Description                          |
| -------------- | ----------------- | ------------------------------------ |
| `pairingCode`  | `string \| null`  | The code to enter on the phone.      |
| `err`          | `string \| null`  | Error message if the request failed. |

---

## Full example

```typescript
import { Wavoip } from "@wavoip/wavoip-api"

const wavoip = new Wavoip({ tokens: ["my-token"] })

const [device] = wavoip.getDevices()

device.on("statusChanged", (status) => {
    console.log("Device status:", status)
})

device.on("qrCodeChanged", (qrCode) => {
    if (qrCode) {
        // Render with any QR library, e.g. node-qrcode
        renderQRCode(qrCode)
    }
})

device.on("contactChanged", (contact) => {
    if (contact) console.log("Paired with:", contact.phone)
})
```
