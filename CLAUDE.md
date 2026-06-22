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


### Output worklet details
- Server sends raw **Int16 PCM at 16kHz** (little-endian, 2 bytes per sample) — **not** µ-law/PCMU encoded.
- The worklet decodes Int16 pairs to Float32, then resamples from 16kHz to the AudioContext's native
  sample rate (typically 48kHz) using **LibSampleRate** (already loaded in the worklet scope).
- A single shared `AudioContext` (owned by `MediaManager`) is used for both input and output.
  Resampling happens inside the worklet rather than creating a separate 16kHz `AudioContext`.
- Jitter buffer: incoming chunks are queued; if total buffered bytes exceed 25KB, oldest data is dropped
  (10KB at a time) to reduce latency.

### WebSocket reconnection
- On unexpected close, `WebsocketTransport` automatically reconnects to keep the call alive.
- **No reconnect** on codes `1000` (Normal Closure — server ended intentionally) and `1008`
  (Policy Violation — e.g. invalid token). All other close codes trigger reconnection.
- Reconnect attempts happen after a 1s delay. A 30s deadline timer starts on the first
  disconnect — if no successful reconnect occurs within that window, the transport gives up
  and transitions to `"disconnected"`.
- The `stopped` flag prevents reconnection after `stop()` is called (intentional teardown).

## Code style

- Functions: 4-20 lines. Split if longer.
- Files: under 500 lines. Split by responsibility.
- One thing per function, one responsibility per module (SRP).
- Names: specific and unique. Avoid `data`, `handler`, `Manager`.
  Prefer names that return <5 grep hits in the codebase.
- Types: explicit. No `any`, no `Dict`, no untyped functions.
- No code duplication. Extract shared logic into a function/module.
- Early returns over nested ifs. Max 2 levels of indentation.
- Exception messages must include the offending value and expected shape.

## Comments

- Keep your own comments. Don't strip them on refactor — they carry
  intent and provenance.
- Write WHY, not WHAT. Skip `// increment counter` above `i++`.
- Docstrings on public functions: intent + one usage example.
- Reference issue numbers / commit SHAs when a line exists because
  of a specific bug or upstream constraint.

## Tests

- Tests run with a single command: `<project-specific>`.
- Every new function gets a test. Bug fixes get a regression test.
- Mock external I/O (API, DB, filesystem) with named fake classes,
  not inline stubs.
- Tests must be F.I.R.S.T: fast, independent, repeatable,
  self-validating, timely.
  
## Formatting

- Use the language default formatter (`biome`). Don't discuss style beyond that.

# Documentation

Documentation lives in `docs/` and is formatted for GitBook (synced via Git). `.gitbook.yaml` at the repo root points GitBook at `./docs/`.

## GitBook file layout
```
docs/
  README.md          ← homepage
  SUMMARY.md         ← table of contents / sidebar
  getting-started/
    installation.md
    initialization.md
  device.md
  calls/
    incoming.md
    outgoing.md
    active.md
  media.md
  types.md
```

## Key GitBook syntax rules
- **Frontmatter**: YAML block at the very top — `description:`, `icon:`, `hidden:`, `layout:` fields.
- **Hints**: `{% hint style="info|warning|danger|success" %}...{% endhint %}`
- **Tabs**: `{% tabs %}{% tab title="..." %}...{% endtab %}{% endtabs %}`
- **Stepper**: `{% stepper %}{% step %}## Title\ncontent{% endstep %}{% endstepper %}`
- **Expandable**: `<details><summary>Title</summary>content</details>`
- **Columns** (max 2): `{% columns %}{% column %}...{% endcolumn %}{% endcolumns %}`
- **Buttons**: `<a href="..." class="button primary">Label</a>`
- **Cards**: `<table data-view="cards">` with `<th data-card-target data-type="content-ref">`
- Internal links use relative `.md` paths: `[text](../device.md)`
- Always close custom blocks exactly — mismatched tags silently break rendering.

## Language
All documentation in `docs/` must be written in **Portuguese (pt-BR)**. This includes descriptions, table headers, prose, hints, step titles, and code comments. Code identifiers, type names, and GitBook block syntax remain in English.

## When to update docs
Any change that affects how a consumer of `@wavoip/wavoip-api` uses the library MUST update `docs/` in the same change. This includes:
- New, renamed, or removed public types / classes / methods
- New, renamed, removed, or re-payloaded events on `Wavoip`, `Device`, `Offer`, `CallOutgoing`, `CallActive`
- Changes to call flow ordering, semantics, or replay/buffering behavior visible to consumers
- Changes to `Wavoip` constructor options or `setLanguage` / locale handling
- Breaking changes in WebSocket event names that consumers can observe

Keep `SUMMARY.md` in sync with the actual file structure — GitBook uses it as the authoritative sidebar.

# CI/CD
After every change, these commands should run and return success
```
pnpm lint
pnpm test
pnpm build
```

# Exceptional bugs 
## WebRTC audio not playing on chromium
There's a [bug on chromium](https://issues.chromium.org/issues/40094084) that blocks MediaStream for WebRTC to play audio.
The workaround is to wire the MediaStream to an Audio element
```
this.pc.ontrack = (event) => {
    const remoteStream = event.streams[0];

    const audio = new Audio();
    audio.muted = true;
    audio.srcObject = remoteStream;
}
```
