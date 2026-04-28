---
description: Crie uma instância Wavoip e entenda sua API de alto nível.
icon: rocket
---

# Inicialização

## Construtor

```typescript
import { Wavoip } from "@wavoip/wavoip-api"

const wavoip = new Wavoip({
    tokens: ["token-1", "token-2"],
    platform?: string,        // opcional — identifica a plataforma do cliente
})
```

| Parâmetro  | Tipo       | Obrigatório | Descrição                                                       |
| ---------- | ---------- | ----------- | --------------------------------------------------------------- |
| `tokens`   | `string[]` | Sim         | Um ou mais tokens de dispositivo Wavoip. Duplicatas são ignoradas. |
| `platform` | `string`   | Não         | Identificador de plataforma enviado ao servidor na conexão.     |

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
const { call, err } = result
// call: CallOutgoing  —  err: null
```

**Falha (todos os dispositivos falharam):**

```typescript
const { call, err } = result
// call: null
// err: { message: string; devices: { token: string; reason: string }[] }
```

Veja [Chamadas Realizadas](../calls/outgoing.md) para a API completa de `CallOutgoing`.

---

### `startCallIterator(params)`

Variante de gerador assíncrono de `startCall` que emite cada tentativa de dispositivo antes de retornar o resultado final. Útil para exibir feedback por dispositivo na interface.

```typescript
const iter = wavoip.startCallIterator({ to: "+5511999999999" })

// Cada yield é uma tentativa falha em um dispositivo
for await (const attempt of iter) {
    console.warn(`Dispositivo ${attempt.token} falhou:`, attempt.err)
}

// .return() contém o resultado final
const result = await iter.return(undefined)
if (result.value?.call) {
    const call = result.value.call
}
```

{% hint style="info" %}
`startCall` é mais simples para a maioria dos casos. Use `startCallIterator` apenas quando o progresso por dispositivo importa para o usuário.
{% endhint %}

---

### `wakeUpDevices(tokens?)`

Acorda dispositivos em hibernação. Retorna um array de Promises para que você possa usar `Promise.all` ou tratar os resultados individualmente.

```typescript
const results = await Promise.all(wavoip.wakeUpDevices())
// { token: string; waken: boolean }[]
```

Passe um array de tokens para atingir dispositivos específicos; omita para acordar todos.

---

### `wakeUpDevicesIterator(tokens?)`

Variante de gerador assíncrono — emite cada resultado de wake conforme concluído.

```typescript
for await (const result of wavoip.wakeUpDevicesIterator()) {
    console.log(result.token, result.waken ? "acordou" : "falhou")
}
```

---

### `getMultimediaDevices()`

Lista todos os microfones e alto-falantes disponíveis.

```typescript
const devices = wavoip.getMultimediaDevices()
// MediaDeviceInfo[]
```

---

### `multimedia` (propriedade)

Retorna o microfone e alto-falante ativos no momento.

```typescript
const { microphone, speaker } = wavoip.multimedia
// microphone: MediaDeviceInfo | undefined
// speaker:    MediaDeviceInfo | undefined
```
