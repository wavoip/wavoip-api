---
description: Add @wavoip/wavoip-api to your project.
icon: download
---

# Installation

## Requirements

* A modern browser with WebRTC support (Chrome 80+, Firefox 75+, Safari 14.1+)
* A Wavoip device token — obtained from the [Wavoip control panel](https://wavoip.com)

{% hint style="warning" %}
This library runs in the **browser only**. It depends on `navigator.mediaDevices`, `AudioContext`, `RTCPeerConnection`, and Socket.IO — none of which are available in Node.js.
{% endhint %}

## Install the package

{% tabs %}
{% tab title="pnpm" %}
```bash
pnpm add @wavoip/wavoip-api
```
{% endtab %}

{% tab title="npm" %}
```bash
npm install @wavoip/wavoip-api
```
{% endtab %}

{% tab title="yarn" %}
```bash
yarn add @wavoip/wavoip-api
```
{% endtab %}
{% endtabs %}

## Framework notes

The library is framework-agnostic. Use it in React, Vue, Svelte, vanilla JS, or any other browser environment.

{% hint style="info" %}
If you're using a bundler like Vite or webpack, the AudioWorklet files are bundled automatically. No extra configuration is needed.
{% endhint %}
