---
description: Initiate outgoing calls and handle peer responses.
icon: phone-outgoing
---

# Outgoing Calls

Use `wavoip.startCall()` to initiate a call. The method returns a `CallOutgoing` object that emits events as the peer responds.

---

## Starting a call

```typescript
const { call, err } = await wavoip.startCall({
    to: "+5511999999999",
})

if (err) {
    console.error("Could not start call:", err.message)
    // err.devices lists which devices were tried and why each failed
    return
}

// call is a CallOutgoing
call.on("peerAccept", (active) => {
    console.log("Call connected!")
    handleActiveCall(active)
})

call.on("peerReject", () => console.log("Peer rejected the call"))
call.on("unanswered", () => console.log("No answer"))
```

---

## `startCall` parameters

| Parameter    | Type       | Required | Description                                              |
| ------------ | ---------- | -------- | -------------------------------------------------------- |
| `to`         | `string`   | Yes      | Destination phone number (E.164 format recommended).     |
| `fromTokens` | `string[]` | No       | Restrict which devices to try. Default: all devices.     |

### Return value

**Success** — `{ call: CallOutgoing; err: null }`

**Failure** — `{ call: null; err: { message: string; devices: { token: string; reason: string }[] } }`

{% hint style="info" %}
`startCall` tries each eligible device in sequence. The first device that successfully initiates the call is used; the rest are not tried. Use `fromTokens` to control which devices participate.
{% endhint %}

---

## CallOutgoing properties

| Property       | Type            | Description                                        |
| -------------- | --------------- | -------------------------------------------------- |
| `id`           | `string`        | Unique call identifier.                            |
| `type`         | `CallType`      | `"official"` or `"unofficial"`.                    |
| `direction`    | `CallDirection` | Always `"OUTGOING"`.                               |
| `peer`         | `CallPeer`      | Recipient's phone, display name, profile picture.  |
| `device_token` | `string`        | Token of the device placing the call.              |
| `status`       | `CallStatus`    | Current call state.                                |

---

## Events

Subscribe with `call.on(event, callback)`. Returns an `Unsubscribe` function.

| Event        | Payload        | Description                                       |
| ------------ | -------------- | ------------------------------------------------- |
| `peerAccept` | `CallActive`   | Peer answered — a `CallActive` is provided.       |
| `peerReject` | —              | Peer declined the call.                           |
| `unanswered` | —              | Call timed out with no response.                  |
| `ended`      | —              | Call ended (e.g. peer hung up before answering).  |
| `status`     | `CallStatus`   | Call status changed.                              |

```typescript
call.on("peerAccept", (active) => {
    // Transition to active call UI
    active.on("ended", () => showCallEndedScreen())
})

call.on("peerReject", () => showNotification("Call rejected"))
call.on("unanswered", () => showNotification("No answer"))
```

---

## Methods

### `mute()` / `unmute()`

Mute or unmute the microphone for this call.

```typescript
await call.mute()    // { err: string | null }
await call.unmute()
```

---

### `end()`

End the outgoing call.

```typescript
await call.end()
```

---

## Multiple device fallback example

Use `startCallIterator` to display per-device feedback while trying devices in sequence:

```typescript
const iter = wavoip.startCallIterator({ to: "+5511999999999" })

// Yield for each failed attempt
for await (const attempt of iter) {
    console.warn(`Device ${attempt.token} unavailable: ${attempt.err}`)
    updateUI({ tryingNext: true })
}

// Final result
const final = await iter.return(undefined)
if (final.value?.call) {
    handleOutgoingCall(final.value.call)
} else {
    showError("All devices failed")
}
```

After the peer answers, see [Active Call](active.md) for managing the in-progress call.
