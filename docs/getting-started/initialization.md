---
description: Crie uma instância Wavoip e entenda sua API de alto nível.
icon: rocket
---

# Inicialização

## Construtor

```typescript
import { Wavoip, webRuntime } from "@wavoip/wavoip-api/web"

const wavoip = new Wavoip({
    tokens: ["token-1", "token-2"],
    runtime: webRuntime(),    // a plataforma: `webRuntime()` vem de "@wavoip/wavoip-api/web"
    platform?: string,        // opcional — identifica a plataforma do cliente
    iceConfig?: IceConfig,    // opcional — sobrescreve servidores STUN/TURN
})
```

| Parâmetro      | Tipo                  | Obrigatório | Descrição                                                                                                                                                                          |
| -------------- | --------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens`       | `string[]`            | Sim         | Um ou mais tokens de dispositivo Wavoip. Duplicatas são ignoradas.                                                                                                                |
| `platform`     | `string`              | Não         | Identificador de plataforma enviado ao servidor na conexão.                                                                                                                       |
| `iceConfig`    | `IceConfig`           | Não         | Servidores STUN/TURN e timeout de coleta ICE.                                                                                                                                     |

Cada token cria uma conexão WebSocket persistente com a infraestrutura Wavoip. A biblioteca começa a se conectar imediatamente na construção — nenhuma chamada explícita a `.connect()` é necessária.

---

## Eventos

### `offer`

Emitido quando uma chamada recebida chega em qualquer dispositivo conectado.

```typescript
const unsub = wavoip.on("offer", (offer) => {
    console.log("Chamada recebida de", offer.peer.phone)
    // Veja Chamadas Recebidas para saber o que fazer com `offer`
})

// Parar de escutar
unsub()
```

---

## Métodos

### `getDevices()`

Retorna um snapshot de todos os dispositivos registrados.

```typescript
const devices = wavoip.getDevices()
// Device[]
```

Veja [Dispositivo](../device.md) para a interface completa de `Device`.

---

### `addDevices(tokens)`

Adiciona novos dispositivos à instância em tempo de execução. Tokens já registrados são silenciosamente ignorados.

```typescript
const added = wavoip.addDevices(["novo-token"])
// Device[]  — apenas os dispositivos recém-adicionados
```

---

### `removeDevices(tokens)`

Desconecta e remove dispositivos pelo token. Retorna os dispositivos que permanecem.

```typescript
const remaining = wavoip.removeDevices(["token-a-remover"])
// Device[]
```

---

### `startCall(params)`

Inicia uma chamada. Tenta cada dispositivo elegível em sequência e retorna no primeiro sucesso.

```typescript
const result = await wavoip.startCall({
    to: "+5511999999999",
    fromTokens?: string[],    // restringe quais dispositivos tentar; padrão: todos
})
```

**Sucesso:**

```typescript
const { data: call, error } = result
// data: OutgoingCall  —  error: null
```

**Falha (todos os dispositivos falharam):**

```typescript
const { data, error } = result
// data: null
// error: StartCallFailure — o código do primeiro dispositivo que falhou,
//        mais `devices`, com o motivo de cada um na ordem tentada
```

Sem nenhum dispositivo para tentar, o código é `NO_DEVICES` e `devices` vem vazio.

Veja [Chamadas Realizadas](../calls/outgoing.md) para a API completa de `OutgoingCall`.

---

### `startCallIterator(params)`

Variante de gerador assíncrono de `startCall` que emite cada tentativa de dispositivo antes de retornar o resultado final. Útil para exibir feedback por dispositivo na interface.

```typescript
const attempts = wavoip.startCallIterator({ to: "+5511999999999" })

// Cada yield é um dispositivo que não pôde chamar.
let step = await attempts.next()
while (!step.done) {
    console.warn(`Dispositivo ${step.value.token} indisponível:`, step.value.error.code)
    step = await attempts.next()
}

// Terminou: `step.value` é o mesmo Result que o `startCall` devolveria.
const { data: call, error } = step.value
if (error) showError(error.code)
else handleOutgoingCall(call)
```

{% hint style="warning" %}
Não use `for await` aqui. Ele descarta o valor de **retorno** do gerador — que é justamente o
resultado da chamada — e você fica só com as tentativas que falharam.
{% endhint %}

{% hint style="info" %}
`startCall` é mais simples para a maioria dos casos. Use `startCallIterator` apenas quando o progresso por dispositivo importa para o usuário.
{% endhint %}

---

### `wakeUpDevices(tokens?)`

Acorda dispositivos em hibernação. Retorna um array de Promises para que você possa usar `Promise.all` ou tratar os resultados individualmente.

```typescript
const results = await Promise.all(wavoip.wakeUpDevices())
// { token: string; result: Result<void, DeviceApiFailure> }[]
```

Passe um array de tokens para atingir dispositivos específicos; omita para acordar todos.

---

### `wakeUpDevicesIterator(tokens?)`

Variante de gerador assíncrono — emite cada resultado de wake conforme concluído.

```typescript
for await (const { token, result } of wavoip.wakeUpDevicesIterator()) {
    console.log(token, result.error ? `falhou: ${result.error.code}` : "acordou")
}
```

---

### `audio`

Os aparelhos de áudio que a biblioteca enxerga. Veja [Mídia](../media.md).

```typescript
wavoip.audio.listInputDevices()
wavoip.audio.currentInput
```
