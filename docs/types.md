---
description: Complete reference for all exported types.
icon: brackets-curly
---

# Types

All types listed here are re-exported from the package root and can be imported directly:

```typescript
import type {
    CallActive, CallActiveEvents,
    CallOutgoing, CallOutgoingEvents,
    Offer, OfferEvents,
    Device, DeviceEvents,
    CallPeer, CallStats, CallStatus, CallType, CallDirection,
    DeviceStatus, Contact,
    TransportStatus,
    Unsubscribe,
} from "@wavoip/wavoip-api"
```

---

## Call types

### `CallStatus`

All possible states a call can be in.

```typescript
type CallStatus =
    | "CALLING"       // Incoming offer received, not yet answered
    | "RINGING"       // Outgoing call ringing on the peer's end
    | "ACTIVE"        // Call is connected and audio is flowing
    | "ENDED"         // Call ended normally
    | "REJECTED"      // Call was rejected
    | "NOT_ANSWERED"  // No response before timeout
    | "FAILED"        // Transport-level failure during the call
    | "DISCONNECTED"  // Connection was lost
```

### `CallType`

```typescript
type CallType = "official" | "unofficial"
```

| Value         | Transport  | Description                                    |
| ------------- | ---------- | ---------------------------------------------- |
| `"official"`  | WebRTC     | Native WhatsApp call using SRTP.               |
| `"unofficial"`| WebSocket relay | Audio relayed through Wavoip servers.     |

### `CallDirection`

```typescript
type CallDirection = "INCOMING" | "OUTGOING"
```

---

## Peer

```typescript
type CallPeer = {
    phone: string               // E.164 phone number
    displayName: string | null  // WhatsApp display name
    profilePicture: string | null  // Profile picture URL
    muted: boolean              // Whether the peer is currently muted
}
```

---

## Call statistics

```typescript
type CallStats = {
    rtt: {
        min: number   // Minimum round-trip time (ms)
        max: number   // Maximum round-trip time (ms)
        avg: number   // Average round-trip time (ms)
    }
    tx: {
        total:       number  // Packets sent
        total_bytes: number  // Bytes sent
        loss:        number  // Packet loss (0–1)
    }
    rx: {
        total:       number  // Packets received
        total_bytes: number  // Bytes received
        loss:        number  // Packet loss (0–1)
    }
}
```

---

## Device types

### `DeviceStatus`

```typescript
type DeviceStatus =
    | "UP"                        // (legacy) Device is running
    | "disconnected"              // WebSocket not connected
    | "close"                     // Connected, no WhatsApp linked
    | "connecting"                // QR code ready, awaiting scan
    | "open"                      // Linked and ready for calls
    | "restarting"                // Restarting; no new calls
    | "hibernating"               // Inactive; call wakeUp()
    | "BUILDING"                  // Initialising
    | "WAITING_PAYMENT"           // Account payment required
    | "EXTERNAL_INTEGRATION_ERROR"// External integration failure
```

### `Contact`

```typescript
type Contact = {
    phone: string  // Linked WhatsApp number
}
```

---

## Transport

### `TransportStatus`

```typescript
type TransportStatus = "disconnected" | "connecting" | "connected" | "reconnecting"
```

---

## Event maps

### `OfferEvents`

```typescript
type OfferEvents = {
    acceptedElsewhere: []
    rejectedElsewhere: []
    unanswered:        []
    ended:             []
    status:            [status: CallStatus]
}
```

### `CallOutgoingEvents`

```typescript
type CallOutgoingEvents = {
    peerAccept: [call: CallActive]
    peerReject: []
    unanswered: []
    ended:      []
    status:     [status: CallStatus]
}
```

### `CallActiveEvents`

```typescript
type CallActiveEvents = {
    error:            [err: string]
    peerMute:         []
    peerUnmute:       []
    ended:            []
    stats:            [stats: CallStats]
    connectionStatus: [status: TransportStatus]
    status:           [status: CallStatus]
}
```

### `DeviceEvents`

```typescript
type DeviceEvents = {
    statusChanged:  [status: DeviceStatus]
    qrCodeChanged:  [qrCode?: string]
    contactChanged: [contact?: Contact]
}
```

---

## Utilities

### `Unsubscribe`

The return type of every `on()` call. Invoke it to remove the listener.

```typescript
type Unsubscribe = () => void

const unsub = wavoip.on("offer", handler)
// Later:
unsub()
```
