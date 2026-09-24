---
description: Trate ofertas de chamadas recebidas — aceite ou rejeite e transicione para uma chamada ativa.
icon: phone-incoming
---

# Chamadas Recebidas

Quando uma chamada chega em qualquer dispositivo conectado, a instância `Wavoip` emite um evento `"offer"` com um objeto `IncomingCall`. Você tem uma janela limitada para aceitar ou rejeitar antes que a oferta expire.

---

## Recebendo uma oferta

```typescript
wavoip.on("offer", async (offer) => {
    console.log("Chamada recebida de", offer.peer.phone)

    const { data: call, error } = await offer.accept()
    if (error) {
        console.error("Falha ao aceitar:", error.code)
        return
    }

    // call agora é um ActiveCall
    call.on("ended", () => console.log("Chamada encerrada"))
})
```

---

## Propriedades do IncomingCall

| Propriedade                       | Tipo            | Descrição                                               |
| --------------------------------- | --------------- | ------------------------------------------------------- |
| `id`                              | `string`        | Identificador único da chamada.                         |
| `type`                            | `CallType`      | `"OFFICIAL"` (WebRTC) ou `"UNOFFICIAL"` (relay).        |
| `direction`                       | `CallDirection` | Sempre `"INCOMING"` para ofertas.                       |
| `peer`                            | `CallPeer`      | Telefone, nome de exibição e foto de perfil do chamador.|
| `deviceToken`                     | `string`        | Token do dispositivo que recebeu a chamada.             |
| `status`                          | `CallStatus`    | Estado atual da chamada (ex: `"CALLING"`). Acompanha os eventos do servidor: dentro de qualquer handler já traz o valor novo. |

---

## Métodos

### `accept()`

Aceita a chamada. Inicia a captura de áudio e retorna um objeto de chamada ativa.

```typescript
const { data, error } = await offer.accept()
// data:  ActiveCall | null
// error: AcceptFailure | null
```

O `AcceptFailure` são os códigos de comando (`ACK_TIMEOUT`, `CALL_ALREADY_ANSWERED`,
`CALL_NOT_FOUND`, `DEVICE_BUSY`, `NETWORK_ERROR`, `UNKNOWN`) mais `MEDIA_NEGOTIATION_FAILED`,
que é a mídia local falhando antes de o aceite sair — a exceção original vem em `error.cause`.

{% hint style="warning" %}
`accept()` solicita permissão de microfone se ainda não concedida. Certifique-se de chamá-la a partir de um contexto de gesto do usuário (clique em botão, etc.) para evitar restrições de política de autoplay do navegador.
{% endhint %}

---

### `reject()`

Rejeita a chamada.

```typescript
const { error } = await offer.reject()
```

---

## Eventos

Assine com `offer.on(evento, callback)`. Retorna uma função `Unsubscribe`.

| Evento               | Payload             | Descrição                                                                                                       |
| -------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `acceptedElsewhere`  | —                   | Outro cliente (aba/dispositivo) atendeu a chamada.                                                              |
| `rejectedElsewhere`  | —                   | Outro cliente recusou a chamada.                                                                                |
| `cancelled`          | —                   | **Quem ligou desistiu** antes de alguém atender.                                                                |
| `ended`              | —                   | A oferta acabou: ou tocou até o fim sem resposta, ou o servidor a encerrou.                                     |
| `iceDiagnostics`     | `IceDiagnostics`    | Diagnóstico da coleta ICE relativa à oferta (quando houver gathering antes do `accept`).                        |
| `connectivityIssue`  | `ConnectivityIssue` | Problema de conectividade detectado durante a oferta. Veja [Tipos → Diagnóstico ICE](../types.md#diagnostico-ice).|

{% hint style="info" %}
**Cada desfecho emite um evento, e só um.** Depois dele a oferta fica muda: pare o toque e
limpe a interface em qualquer um dos quatro. O `status` já está atualizado dentro do handler,
se você quiser distinguir o caso:

```typescript
offer.on("cancelled", () => hideIncomingCall())   // offer.status === "CANCELLED"
```

`reject()` **não** dispara `rejectedElsewhere`: recusar daqui responde no `Result` do próprio
método. O `rejectedElsewhere` é sempre outro cliente.
{% endhint %}

```typescript
offer.on("acceptedElsewhere", () => {
    console.log("Chamada atendida em outro lugar")
})

offer.on("cancelled", () => {
    console.log("Quem ligou desistiu")
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
            const { data: call, error } = await offer.accept()
            if (error) return showError(messages[error.code])

            handleActiveCall(call)
        },
        onReject: () => offer.reject(),
    })

    offer.on("acceptedElsewhere", hideIncomingCallUI)
    offer.on("rejectedElsewhere", hideIncomingCallUI)
    offer.on("cancelled", hideIncomingCallUI)
    offer.on("ended", hideIncomingCallUI)
})
```

Após `accept()` resolver, veja [Chamada Ativa](active.md) para gerenciar a chamada em andamento.
