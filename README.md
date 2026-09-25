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
import { Wavoip, webRuntime } from "@wavoip/wavoip-api/web";

const wavoip = new Wavoip({ tokens: ["your-device-token"], runtime: webRuntime() });

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

## Entry points

| Import | What you get | For |
| --- | --- | --- |
| `@wavoip/wavoip-api/web` | the core **and** `webRuntime()` | the browser |
| `@wavoip/wavoip-api/node` | the core **and** `nodeRuntime()` | a headless process: bot, IVR, recording |
| `@wavoip/wavoip-api` | the core alone, with no platform in it | bringing your own runtime |

Importing a platform path is what pulls that implementation into your bundle. The root path
names no DOM type at all, and is 54 kB against the 2 MB of the browser build; the Node
adapter adds 5 kB.

Node takes whatever audio format your decoder produces and resamples it for you, optionally
on a worker thread. It needs `@roamhq/wrtc` and `ws`, both optional peer dependencies — a
browser install pulls neither.

## Requirements

Everything platform-specific sits behind an injected port, so the core itself needs no DOM.
The browser and Node.js runtimes ship today; React Native is in progress.

## License

MIT
