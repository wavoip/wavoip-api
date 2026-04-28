---
description: WebSocket-based library for integrating WhatsApp audio calls into web projects.
icon: phone
layout:
  title:
    visible: true
  description:
    visible: true
  tableOfContents:
    visible: true
  outline:
    visible: true
  pagination:
    visible: true
---

# wavoip-api

`@wavoip/wavoip-api` handles the full lifecycle of WhatsApp audio calls — incoming and outgoing — directly in the browser. It abstracts WebSocket (Socket.IO) signalling, WebRTC media transport, and audio device management behind a simple event-driven API.

{% hint style="info" %}
Version **2.2.0** — supports both official (WebRTC) and unofficial (WebSocket relay) call types.
{% endhint %}

## What it does

* Connects to one or more Wavoip devices via WebSocket
* Receives and dispatches incoming call offers
* Initiates outgoing calls with automatic device fallback
* Manages microphone and speaker selection with hot-swap support
* Exposes typed events for every call state change

## Quick start

```typescript
import { Wavoip } from "@wavoip/wavoip-api"

const wavoip = new Wavoip({ tokens: ["your-device-token"] })

// Receive incoming calls
wavoip.on("offer", async (offer) => {
    const { call } = await offer.accept()
    if (!call) return

    call.on("ended", () => console.log("Call ended"))
})

// Make outgoing calls
const { call, err } = await wavoip.startCall({ to: "+5511999999999" })
if (call) {
    call.on("peerAccept", (active) => {
        console.log("Call connected!")
    })
}
```

## Explore the docs

<table data-view="cards">
    <thead>
        <tr>
            <th>Section</th>
            <th data-card-target data-type="content-ref">Link</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>Installation &amp; setup</td>
            <td><a href="getting-started/installation.md">Installation</a></td>
        </tr>
        <tr>
            <td>Device management</td>
            <td><a href="device.md">Device</a></td>
        </tr>
        <tr>
            <td>Incoming calls</td>
            <td><a href="calls/incoming.md">Incoming Calls</a></td>
        </tr>
        <tr>
            <td>Outgoing calls</td>
            <td><a href="calls/outgoing.md">Outgoing Calls</a></td>
        </tr>
        <tr>
            <td>Active call control</td>
            <td><a href="calls/active.md">Active Call</a></td>
        </tr>
        <tr>
            <td>Audio devices</td>
            <td><a href="media.md">Media</a></td>
        </tr>
    </tbody>
</table>
