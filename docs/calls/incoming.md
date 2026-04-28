---
description: Handle incoming call offers — accept or reject them and transition to an active call.
icon: phone-incoming
---

# Incoming Calls

When a call arrives on any connected device, the `Wavoip` instance emits an `"offer"` event with an `Offer` object. You have a limited window to accept or reject before the offer expires.

---

## Receiving an offer

```typescript
wavoip.on("offer", async (offer) => {
    console.log("Incoming call from", offer.peer.phone)

    const { call, err } = await offer.accept()
    if (err) {
        console.error("Accept failed:", err)
        return
    }

    // call is now a CallActive
    call.on("ended", () => console.log("Call ended"))
})
```

---

## Offer properties

| Property       | Type            | Description                                      |
| -------------- | --------------- | ------------------------------------------------ |
| `id`           | `string`        | Unique call identifier.                          |
| `type`         | `CallType`      | `"official"` (WebRTC) or `"unofficial"` (relay). |
| `direction`    | `CallDirection` | Always `"INCOMING"` for offers.                  |
| `peer`         | `CallPeer`      | Caller's phone, display name, profile picture.   |
| `device_token` | `string`        | Token of the device that received this call.     |
| `status`       | `CallStatus`    | Current call state (e.g. `"CALLING"`).           |

---

## Methods

### `accept()`

Accepts the call. Starts audio capture and returns an active call object.

```typescript
const { call, err } = await offer.accept()
// call: CallActive | null
// err:  string | null
```

{% hint style="warning" %}
`accept()` requests microphone permission if not already granted. Make sure to call it from a user gesture context (button click, etc.) to avoid browser autoplay policy restrictions.
{% endhint %}

---

### `reject()`

Rejects the call.

```typescript
const { err } = await offer.reject()
```

---

## Events

Subscribe with `offer.on(event, callback)`. Returns an `Unsubscribe` function.

| Event                | Payload | Description                                             |
| -------------------- | ------- | ------------------------------------------------------- |
| `acceptedElsewhere`  | —       | Another client (browser tab / device) accepted the call.|
| `rejectedElsewhere`  | —       | Another client rejected the call.                       |
| `unanswered`         | —       | Offer timed out with no response.                       |
| `ended`              | —       | Call ended before it was answered.                      |
| `status`             | `CallStatus` | Call status changed.                               |

```typescript
offer.on("acceptedElsewhere", () => {
    console.log("Call picked up elsewhere")
})

offer.on("unanswered", () => {
    console.log("No one answered")
})
```

---

## Full example

```typescript
wavoip.on("offer", async (offer) => {
    const { peer } = offer

    // Show incoming call UI
    showIncomingCallUI({
        name: peer.displayName ?? peer.phone,
        avatar: peer.profilePicture ?? undefined,
        onAccept: async () => {
            const { call, err } = await offer.accept()
            if (err) return showError(err)

            handleActiveCall(call)
        },
        onReject: () => offer.reject(),
    })

    offer.on("acceptedElsewhere", hideIncomingCallUI)
    offer.on("unanswered", hideIncomingCallUI)
    offer.on("ended", hideIncomingCallUI)
})
```

After `accept()` resolves, see [Active Call](active.md) for how to manage the in-progress call.
