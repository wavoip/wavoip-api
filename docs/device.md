---
description: Gerencie dispositivos Wavoip individualmente — status, pareamento e ciclo de vida.
icon: mobile
---

# Dispositivo

Um `Device` representa um único dispositivo Wavoip identificado pelo seu token. Cada dispositivo mantém uma conexão WebSocket persistente e expõe status em tempo real, QR code e informações de contato.

Os dispositivos são retornados por `wavoip.getDevices()`, `wavoip.addDevices()` e `wavoip.removeDevices()`.

---

## Propriedades

| Propriedade | Tipo                  | Descrição                                                    |
| ----------- | --------------------- | ------------------------------------------------------------ |
| `token`     | `string`              | Token único do dispositivo (somente leitura).                |
| `status`    | `DeviceStatus`        | Estado atual de conexão/pareamento.                          |
| `qrCode`    | `string \| undefined` | String do QR code quando o dispositivo está em `connecting`. |
| `contact`   | `Contact \| undefined`| Número WhatsApp vinculado quando o dispositivo está `open`.  |

---

## Status do dispositivo

| Status                       | Significado                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `disconnected`               | WebSocket não está conectado. Reconexão automática em andamento.             |
| `close`                      | Conectado, mas sem número WhatsApp vinculado. Pode entrar em hibernação.     |
| `connecting`                 | QR code pronto — aguardando leitura pelo WhatsApp.                           |
| `open`                       | Vinculado e pronto para realizar/receber chamadas.                           |
| `restarting`                 | Dispositivo está reiniciando; novas chamadas estão bloqueadas.               |
| `hibernating`                | Inativo por 2,5+ minutos. Chame `wakeUp()` para reativar.                   |
| `BUILDING`                   | Dispositivo inicializando; chamadas indisponíveis.                           |
| `WAITING_PAYMENT`            | Pagamento da conta necessário.                                               |
| `EXTERNAL_INTEGRATION_ERROR` | Erro de integração externa com o WhatsApp; reinicialização necessária.       |

{% hint style="info" %}
O dispositivo se reconecta automaticamente em quedas inesperadas do WebSocket. `disconnected` é transitório — a biblioteca tenta até três reconexões antes de desistir.
{% endhint %}

---

## Eventos

Assine com `device.on(evento, callback)`. Retorna uma função `Unsubscribe`.

### `statusChanged`

```typescript
const unsub = device.on("statusChanged", (status: DeviceStatus) => {
    console.log("Status:", status)
})
```

### `qrCodeChanged`

Emitido sempre que a string do QR code muda (inclusive quando é limpa após o pareamento bem-sucedido).

```typescript
device.on("qrCodeChanged", (qrCode?: string) => {
    if (qrCode) renderQR(qrCode)
    else console.log("QR code limpo")
})
```

### `contactChanged`

Emitido quando o contato WhatsApp vinculado muda — no pareamento, logout ou reconexão.

```typescript
device.on("contactChanged", (contact?: Contact) => {
    if (contact) console.log("Vinculado a:", contact.phone)
})
```

---

## Métodos

### `restart()`

Reinicia o dispositivo Wavoip. Chamadas em andamento são finalizadas antes do reinício.

```typescript
await device.restart()
```

---

### `logout()`

Desvincula o número WhatsApp do dispositivo.

```typescript
await device.logout()
```

---

### `wakeUp()`

Acorda um dispositivo em hibernação. Retorna `true` se o dispositivo respondeu.

```typescript
const woken = await device.wakeUp()
```

---

### `pairingCode(phone)`

Solicita um código de pareamento para vincular um número de telefone sem precisar escanear o QR code.

```typescript
const result = await device.pairingCode("+5511999999999")

if (result.err) {
    console.error(result.err)
} else {
    console.log("Código de pareamento:", result.pairingCode)
}
```

| Campo de retorno | Tipo              | Descrição                                       |
| ---------------- | ----------------- | ----------------------------------------------- |
| `pairingCode`    | `string \| null`  | O código a ser inserido no telefone.            |
| `err`            | `string \| null`  | Mensagem de erro se a solicitação falhou.        |

---

## Exemplo completo

```typescript
import { Wavoip } from "@wavoip/wavoip-api"

const wavoip = new Wavoip({ tokens: ["meu-token"] })

const [device] = wavoip.getDevices()

device.on("statusChanged", (status) => {
    console.log("Status do dispositivo:", status)
})

device.on("qrCodeChanged", (qrCode) => {
    if (qrCode) {
        // Renderize com qualquer biblioteca de QR, ex: node-qrcode
        renderQRCode(qrCode)
    }
})

device.on("contactChanged", (contact) => {
    if (contact) console.log("Pareado com:", contact.phone)
})
```
