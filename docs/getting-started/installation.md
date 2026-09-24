---
description: Adicione @wavoip/wavoip-api ao seu projeto.
icon: download
---

# Instalação

## Requisitos

* Um navegador moderno com suporte a WebRTC (Chrome 80+, Firefox 75+, Safari 14.1+)
* Um token de dispositivo Wavoip — obtido no [painel de controle Wavoip](https://wavoip.com)

{% hint style="warning" %}
O único runtime pronto hoje é o do navegador. O núcleo da biblioteca não depende de nada do
DOM, mas quem traz `AudioContext`, `getUserMedia`, `RTCPeerConnection` e o WebSocket é o
runtime — e por enquanto só existe o `webRuntime()`. Os adaptadores de React Native e
Node.js estão em andamento (DEV-277).
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

## Escolher o caminho de import

O pacote tem dois caminhos. Quem está no navegador usa o `/web`, que traz o núcleo e o
runtime juntos:

```typescript
import { Wavoip, webRuntime } from "@wavoip/wavoip-api/web"
```

| Import | O que vem | Para quem |
| --- | --- | --- |
| `@wavoip/wavoip-api/web` | o núcleo e o `webRuntime()` | navegador |
| `@wavoip/wavoip-api` | só o núcleo, sem nada do navegador | quem traz o próprio runtime |

Importar do `/web` é o que puxa a implementação do navegador para o seu bundle. O caminho
raiz existe para quem vai rodar em outro ambiente: ele não cita um tipo do DOM sequer, e é
por isso que um projeto React Native consegue compilá-lo.

{% hint style="info" %}
Importar o `/web` num servidor (SSR do Next.js, por exemplo) não quebra: nenhum global do
navegador é tocado no momento do import. Só a chamada a `webRuntime()` precisa do navegador.
{% endhint %}

## Carregar por `<script>`

```html
<script src="https://unpkg.com/@wavoip/wavoip-api/dist/web.umd.js"></script>
<script>
    const wavoip = new WavoipAPI.Wavoip({
        tokens: ["seu-token"],
        runtime: WavoipAPI.webRuntime(),
    })
</script>
```

## Notas sobre frameworks

A biblioteca é independente de framework. Use-a com React, Vue, Svelte, JS puro ou qualquer outro ambiente de navegador.

{% hint style="info" %}
Se você estiver usando um bundler como Vite ou webpack, os arquivos AudioWorklet são empacotados automaticamente. Nenhuma configuração extra é necessária.
{% endhint %}
