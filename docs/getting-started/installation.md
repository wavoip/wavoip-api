---
description: Adicione @wavoip/wavoip-api ao seu projeto.
icon: download
---

# Instalação

## Requisitos

* Um navegador moderno com suporte a WebRTC (Chrome 80+, Firefox 75+, Safari 14.1+)
* Um token de dispositivo Wavoip — obtido no [painel de controle Wavoip](https://wavoip.com)

{% hint style="warning" %}
Esta biblioteca funciona **apenas no navegador**. Ela depende de `navigator.mediaDevices`, `AudioContext`, `RTCPeerConnection` e Socket.IO — nenhum destes está disponível no Node.js.
{% endhint %}

## Instalar o pacote

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

## Notas sobre frameworks

A biblioteca é independente de framework. Use-a com React, Vue, Svelte, JS puro ou qualquer outro ambiente de navegador.

{% hint style="info" %}
Se você estiver usando um bundler como Vite ou webpack, os arquivos AudioWorklet são empacotados automaticamente. Nenhuma configuração extra é necessária.
{% endhint %}
