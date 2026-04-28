---
description: Trate ofertas de chamadas recebidas — aceite ou rejeite e transicione para uma chamada ativa.
icon: phone-incoming
---

# Chamadas Recebidas

Quando uma chamada chega em qualquer dispositivo conectado, a instância `Wavoip` emite um evento `"offer"` com um objeto `Offer`. Você tem uma janela limitada para aceitar ou rejeitar antes que a oferta expire.

---

## Recebendo uma oferta

```typescript
wavoip.on("offer", async (offer) => {
    console.log("Chamada recebida de", offer.peer.phone)

    const { call, err } = await offer.accept()
    if (err) {
        console.error("Falha ao aceitar:", err)
        return
    }

    // call agora é um CallActive
    call.on("ended", () => console.log("Chamada encerrada"))
})
```

---

## Propriedades do Offer

| Propriedade    | Tipo            | Descrição                                               |
| -------------- | --------------- | ------------------------------------------------------- |
| `id`           | `string`        | Identificador único da chamada.                         |
| `type`         | `CallType`      | `"official"` (WebRTC) ou `"unofficial"` (relay).        |
| `direction`    | `CallDirection` | Sempre `"INCOMING"` para ofertas.                       |
| `peer`         | `CallPeer`      | Telefone, nome de exibição e foto de perfil do chamador.|
| `device_token` | `string`        | Token do dispositivo que recebeu a chamada.             |
| `status`       | `CallStatus`    | Estado atual da chamada (ex: `"CALLING"`).              |

---

## Métodos

### `accept()`

Aceita a chamada. Inicia a captura de áudio e retorna um objeto de chamada ativa.

```typescript
const { call, err } = await offer.accept()
// call: CallActive | null
// err:  string | null
```

{% hint style="warning" %}
`accept()` solicita permissão de microfone se ainda não concedida. Certifique-se de chamá-la a partir de um contexto de gesto do usuário (clique em botão, etc.) para evitar restrições de política de autoplay do navegador.
{% endhint %}

---

### `reject()`

Rejeita a chamada.

```typescript
const { err } = await offer.reject()
```

---

## Eventos

Assine com `offer.on(evento, callback)`. Retorna uma função `Unsubscribe`.

| Evento               | Payload      | Descrição                                                     |
| -------------------- | ------------ | ------------------------------------------------------------- |
| `acceptedElsewhere`  | —            | Outro cliente (aba/dispositivo) aceitou a chamada.            |
| `rejectedElsewhere`  | —            | Outro cliente rejeitou a chamada.                             |
| `unanswered`         | —            | Oferta expirou sem resposta.                                  |
| `ended`              | —            | Chamada encerrada antes de ser atendida.                      |
| `status`             | `CallStatus` | Status da chamada mudou.                                      |

```typescript
offer.on("acceptedElsewhere", () => {
    console.log("Chamada atendida em outro lugar")
})

offer.on("unanswered", () => {
    console.log("Ninguém atendeu")
})
```

---

## Exemplo completo

```typescript
wavoip.on("offer", async (offer) => {
    const { peer } = offer

    // Exibir interface de chamada recebida
    showIncomingCallUI({
        name: peer.displayName ?? peer.phone,
        avatar: peer.profilePicture ?? undefined,
        onAccept: async () => {
            const { call, err } = await offer.accept()
            if (err) return showError(err)

            handleActiveCall(call)
        },
        onReject: () => offer.reject(),
    })

    offer.on("acceptedElsewhere", hideIncomingCallUI)
    offer.on("unanswered", hideIncomingCallUI)
    offer.on("ended", hideIncomingCallUI)
})
```

Após `accept()` resolver, veja [Chamada Ativa](active.md) para gerenciar a chamada em andamento.
