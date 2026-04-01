# Project Overview
TypeScript library that integrates audio calls via Wavoip devices into web projects.
Communicates with devices via WebSockets (Socket.IO) and standard Web APIs (WebRTC, AudioContext).

# Tech Stack

| Component | Technology |
|---|---|
| Language | TypeScript |
| Build / Test | Vite, Vitest |
| WebSocket | Socket.IO |
| HTTP | Axios |
| Media transport | WebRTC (official calls), WebSocket binary (unofficial calls) |
| Audio transcoding | LibSamplerateJs (via AudioWorklet) |
| Audio encoding | PCMU / µ-law G.711 |


# Folder Structure
```
src/
├── modules/
│   ├── call/           Call facades and internal event bus
│   ├── device/         Device connection, state and call construction
│   ├── media/          Audio transport (WebRTC / WebSocket) and MediaManager
│   ├── shared/         Shared primitives (EventEmitter)
│   └── worklets/       AudioWorklet processors (excluded from main TS build)
├── test/              Projects tests (Follow the same structure as modules)
│   ├── ...
├── Wavoip.ts           Public entry point — facade over all modules
└── index.ts            Public type/class exports
```


# Architecture Overview

## Layer diagram
```
Consumer
   │
   ▼
Wavoip              ← top-level facade; holds devices + MediaManager
   │
   ▼
DeviceConnection    ← one per device token; owns socket, builds call objects
   │  creates
   ├──▶ Offer          (incoming call, awaiting accept/reject)
   ├──▶ CallOutgoing   (outgoing call, awaiting peer answer)
   └──▶ CallActive     (call in progress, bidirectional audio)
          │  uses
          └──▶ ITransport  (WebRTCTransport | WebsocketTransport)
                    │  uses
                    └──▶ MediaManager  (mic, speaker, AudioContext)
```

## Key design decisions
- **Facades** — `Offer`, `CallOutgoing`, `CallActive` are the only objects returned to consumers.
  They encapsulate all internal state; consumers cannot mutate `Call`, `Device`, or transport directly.
- **CallBus** — internal normalized event bus (`src/modules/call/CallBus.ts`).
  Aggregates raw socket events (`DeviceSocket`) and transport events (`ITransport`) into a single
  typed stream. Facades subscribe to `CallBus` only — no direct socket/transport listener wiring.
- **No CallManager** — `DeviceConnection` is responsible for constructing all call objects
  (`Offer`, `CallOutgoing`, `CallActive`). It creates the `Call` model, `CallBus`, and the
  appropriate transport, then returns the facade to `Wavoip`.
- **Single MediaManager** — one `MediaManager` instance is shared across all `DeviceConnection`s
  and all active transports. It owns the `AudioContext` and all mic/speaker state.


# Modules

## `modules/call/`
Pure call-side facades and supporting types. No socket or transport code — receives everything via `CallBus`.

| File | Role |
|---|---|
| `CallBus.ts` | Internal event bus; normalizes socket + transport events for one call |
| `Offer.ts` | Facade for an incoming call awaiting accept/reject |
| `CallOutgoing.ts` | Facade for an outgoing call awaiting peer answer |
| `CallActive.ts` | Facade for an in-progress call |
| `Peer.ts` | `CallPeer` type (phone, displayName, profilePicture, muted) |
| `Stats.ts` | `CallStats` type (RTT, tx/rx packet counts and loss) |

## `modules/device/`
Device connection, state machine, and call object construction.

| File | Role |
|---|---|
| `DeviceConnection.ts` | Socket.IO connection per device; builds Offer/CallOutgoing/CallActive |
| `Device.ts` | Holds device state (status, qrCode, contact); `canCall()` business rules |
| `Call.ts` | Call model and status state machine (RINGING → ACTIVE → ENDED etc.) |
| `WebSocket.ts` | Socket.IO factory + full `ServerEvents` / `ClientEvents` type definitions |

## `modules/media/`
Audio I/O and transport implementations.

| File | Role |
|---|---|
| `MediaManager.ts` | Mic/speaker enumeration, stream lifecycle, mute, hot-swap, AudioContext |
| `ITransport.ts` | Interface + event types shared by both transports |
| `WebRTC.ts` | `WebRTCTransport` — RTCPeerConnection, SDP, stats, mute detection via FFT |
| `WebSocket.ts` | `WebsocketTransport` — binary WebSocket, PCMU decode, AudioWorklet pipeline |

## `modules/shared/`
| File | Role |
|---|---|
| `EventEmitter.ts` | Generic typed event emitter used throughout the project |

## `modules/worklets/` *(excluded from main TS build)*
| File | Role |
|---|---|
| `AudioWorkletMic.ts` | `ResampleProcessor` — mic Float32 → 16 kHz Int16 PCM (LibSampleRate) |
| `AudioWorkletOut.ts` | `AudioDataWorkletStream` — PCMU bytes → Float32 → native rate (LibSampleRate) |


# Models

## Device (`modules/device/Device.ts`)
Holds device runtime state. Owns `canCall()` which enforces status-based rules
(rejects calls if status is `"error"`, `"connecting"`, or `"restarting"`).

```typescript
class Device {
    token: string
    status: DeviceStatus   // "disconnected" | "UP" | "connecting" | "error" | "restarting" | ...
    qrCode?: string
    contact: DeviceContact // { official?: Contact; unofficial?: Contact }
    canCall(): { err?: string }
    receiveOffer(id, type, peer): Call
}
```

## Call (`modules/device/Call.ts`)
State machine for a single call. Status transitions are guarded — each method returns `false` if the
transition is invalid.

```
CALLING / RINGING → ACTIVE   (accept)
CALLING / RINGING → NOT_ANSWERED (timeout)
ACTIVE  → ENDED              (end)
ACTIVE  → REJECTED           (reject)
ACTIVE  → FAILED             (fail)
```

## CallBus (`modules/call/CallBus.ts`)
Internal only — never exposed to consumers. Created by `DeviceConnection`, passed to facades.
Wires socket events on construction; transport events are wired later via `bus.wireTransport(transport)`
once a transport is established (e.g. after SDP exchange or call acceptance).


# Call Flows

## Incoming official call (WebRTC)
```
socket "call:offer:official"
  └─ DeviceConnection.onOfficialOffer()
       ├─ new Call(id, "official", "INCOMING", ...)
       ├─ new CallBus(call, wss)
       └─ new Offer(call, bus, { onAccept, onReject })
            └─ emitted → consumer via Wavoip "offer" event

consumer: offer.accept()
  └─ onAccept callback (DeviceConnection)
       ├─ new WebRTCTransport(mediaManager, sdpOffer, onAnswer)
       ├─ webRTC.start()  →  mic → pc.addTrack → createAnswer → answerPromise.resolve
       └─ onAnswer(answer):
            ├─ offerProps.res({ action:"accept", answer: sdp })  → server
            ├─ bus.wireTransport(webRTC)
            └─ resolveActive(new CallActive(call, bus, webRTC, mediaManager, { onEnd }))
```

## Outgoing unofficial call (WebSocket audio)
```
wavoip.startCall({ to })
  └─ DeviceConnection.startCall(to)
       ├─ wss.emit("call:start", to, callback)
       └─ callback({ id, peer, transport: server })
            ├─ new Call(id, "unofficial", "OUTGOING", ...)
            ├─ new CallBus(call, wss)
            └─ new CallOutgoing(call, bus, wss, mediaManager, server)  → returned to Wavoip

consumer: outgoing.onPeerAccept(cb)
  └─ bus.on("accepted")
       ├─ new WebsocketTransport(mediaManager, server, deviceToken)
       ├─ call.accept()
       ├─ bus.wireTransport(wsTransport)
       ├─ new CallActive(call, bus, wsTransport, mediaManager, { onEnd })
       └─ wsTransport.start()  →  mic AudioWorklet → binary WS → PCMU decode AudioWorklet → speaker
```


# WebSocket Event Naming
- `:` separates domains: `call:accepted`, `device:status`
- `.` denotes client-initiated actions: `call.end`, `device.pairing_code`
- Received events are past tense: `call:accepted`, `call:rejected`
- Action events are imperative: `call:end`, `call:mute`


# Media Pipeline

# MediaManager
It manages all media. It's responsible for the audio context lifecycle (Instantiating, loading modules, suspending and starting) and devices managing (Microphone and Speaker)

## Official calls (WebRTC)
```
Microphone → MediaStream → RTCPeerConnection → (SRTP) → WhatsApp
WhatsApp   → (SRTP) → RTCPeerConnection.ontrack → AudioContext → Speaker
```
Peer mute is detected via 1-second FFT analysis on the remote audio stream.

## Unofficial calls (WebSocket binary)
```
Mic → AudioWorklet(ResampleProcessor) → 16kHz Int16 PCM → binary WebSocket → server
server → binary WebSocket → AudioWorklet(AudioDataWorkletStream) → PCMU decode
       → LibSampleRate (16kHz → native) → AudioContext destination → Speaker
```
Output worklet maintains a 500 ms jitter buffer; drops oldest frames on overflow.

# CI/CD
After every change, these commands should run and return success
```
pnpm lint
pnpm test
pnpm build
```
