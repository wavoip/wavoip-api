# Introdução

Essa biblioteca foi feita com o intuito de facilitar a utilização dos dispositivos da Wavoip por meio de websockets. Ela abstrai toda comunicação de eventos entre o cliente e o dispositivo, além de toda parte de áudio de chamadas

Como a comunicação de websockets se dá por meio de eventos, a biblioteca foi feita para ser utilizada por meio callbacks.

## Instalação

Instale a biblioteca utilizando seu gerenciador de dependências favorito

{% tabs %}
{% tab title="PNPM" %}
```bash
pnpm add @wavoip/wavoip-api
```
{% endtab %}

{% tab title="NPM" %}
```bash
npm install @wavoip/wavoip-api
```
{% endtab %}
{% endtabs %}

## Classe Wavoip

Instancie a classe Wavoip e passe os tokens de seus dispositivos como parâmetros

{% hint style="info" %}
É possível adicionar ou remover tokens de dispositivos após a classe ser instanciada&#x20;
{% endhint %}

```typescript
import { Wavoip } from "@wavoip/wavoip-api"

const wavoip = new Wavoip({
    tokens: ["token 1", "token 2", ...]
})
```
