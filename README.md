# @wavoip/wavoip-api

WhatsApp audio calls in your web app, through a Wavoip device.

The library handles the whole call lifecycle — incoming and outgoing — and keeps the
signalling (Socket.IO), the media transport (WebRTC, or a WebSocket relay) and the audio
devices behind a typed, event-driven API.

```bash
npm install @wavoip/wavoip-api
```

## Quick start

```typescript
import { Wavoip } from "@wavoip/wavoip-api";

const wavoip = new Wavoip({ tokens: ["your-device-token"] });

// Answer what comes in.
wavoip.on("offer", async (offer) => {
    const { data: call, error } = await offer.accept();
    if (error) return console.error(error.code);

    call.on("ended", () => console.log("the peer hung up"));
});

// Place a call.
const { data: outgoing, error } = await wavoip.startCall({ to: "+5511999999999" });
if (error) {
    // `error.devices` says why each device could not take it.
    console.error(error.code);
} else {
    outgoing.on("accepted", (call) => console.log("connected"));
    outgoing.on("rejected", () => console.log("declined"));
}
```

Every method that can fail answers with `{ data, error }`, and `error.code` is a stable
string you branch on and translate — the library ships no user-facing text.

## Documentation

- [Guides and reference](https://wavoip.gitbook.io/api/wavoip-api/)
- [Migrating from v2 to v3](https://wavoip.gitbook.io/api/wavoip-api/migration)

## Requirements

Browsers only, for now. The library needs `navigator.mediaDevices`, `AudioContext`,
`RTCPeerConnection` and a WebSocket — none of which Node.js provides. Everything that
touches the platform sits behind an injected port, and the published types no longer
mention any DOM type, which is the groundwork for other runtimes.

## License

MIT
