---
description: Adicione @wavoip/wavoip-api ao seu projeto.
icon: download
---

# Instalação

## Requisitos

* Um navegador moderno com suporte a WebRTC (Chrome 80+, Firefox 75+, Safari 14.1+)
* Um token de dispositivo Wavoip — obtido no [painel de controle Wavoip](https://wavoip.com)

{% hint style="info" %}
Além do navegador, há um runtime de **Node.js** para processos sem cabeça — bot, URA,
gravação. Ver [Plataformas](../platforms/README.md). O adaptador de React Native está em
andamento (DEV-277).
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
| `@wavoip/wavoip-api/node` | o núcleo e o `nodeRuntime()` | [processo sem cabeça](../platforms/node.md) |
| `@wavoip/wavoip-api` | só o núcleo, sem plataforma nenhuma | quem traz o próprio runtime |

Importar do `/web` é o que puxa a implementação do navegador para o seu bundle. O caminho
raiz existe para quem vai rodar em outro ambiente: ele não cita um tipo do DOM sequer, e é
por isso que um projeto React Native consegue compilá-lo.

{% hint style="info" %}
Importar o `/web` num servidor (SSR do Next.js, por exemplo) não quebra: nenhum global do
navegador é tocado no momento do import. Só a chamada a `webRuntime()` precisa do navegador.
{% endhint %}

### Formatos publicados

| Caminho | Formato | Quem usa |
| --- | --- | --- |
| `dist/index.mjs`, `web.mjs`, `node.mjs` | ESM | bundler e Node moderno |
| `dist/index.cjs`, `node.cjs` | CommonJS | `require()` |
| `dist/web.umd.js` | UMD | `<script>`, e o `require()` do `/web` |

O `exports` do pacote escolhe sozinho: `import` pega o `.mjs`, `require` pega o CommonJS.
Não há nada a configurar.

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
