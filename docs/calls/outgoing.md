---
description: Inicie chamadas e trate respostas do destinatário.
icon: phone-outgoing
---

# Chamadas Realizadas

Use `wavoip.startCall()` para iniciar uma chamada. O método retorna um objeto `CallOutgoing` que emite eventos conforme o destinatário responde.

---

## Iniciando uma chamada

```typescript
const { call, err } = await wavoip.startCall({
    to: "+5511999999999",
})

if (err) {
    console.error("Não foi possível iniciar a chamada:", err.message)
    // err.devices lista quais dispositivos foram tentados e por que cada um falhou
    return
}

// call é um CallOutgoing
call.on("peerAccept", (active) => {
    console.log("Chamada conectada!")
    handleActiveCall(active)
})

call.on("peerReject", () => console.log("Destinatário rejeitou a chamada"))
call.on("unanswered", () => console.log("Sem resposta"))
```

---

## Parâmetros de `startCall`

| Parâmetro    | Tipo       | Obrigatório | Descrição                                                          |
| ------------ | ---------- | ----------- | ------------------------------------------------------------------ |
| `to`         | `string`   | Sim         | Número de telefone de destino (formato E.164 recomendado).         |
| `fromTokens` | `string[]` | Não         | Restringe quais dispositivos tentar. Padrão: todos os dispositivos.|

### Valor de retorno

**Sucesso** — `{ call: CallOutgoing; err: null }`

**Falha** — `{ call: null; err: { message: string; devices: { token: string; reason: string }[] } }`

{% hint style="info" %}
`startCall` tenta cada dispositivo elegível em sequência. O primeiro dispositivo que iniciar a chamada com sucesso é usado; os demais não são tentados. Use `fromTokens` para controlar quais dispositivos participam.
{% endhint %}

---

## Propriedades do CallOutgoing

| Propriedade    | Tipo            | Descrição                                                  |
| -------------- | --------------- | ---------------------------------------------------------- |
| `id`           | `string`        | Identificador único da chamada.                            |
| `type`         | `CallType`      | `"official"` ou `"unofficial"`.                            |
| `direction`    | `CallDirection` | Sempre `"OUTGOING"`.                                       |
| `peer`         | `CallPeer`      | Telefone, nome de exibição e foto de perfil do destinatário.|
| `device_token` | `string`        | Token do dispositivo que está realizando a chamada.        |
| `status`       | `CallStatus`    | Estado atual da chamada.                                   |

---

## Eventos

Assine com `call.on(evento, callback)`. Retorna uma função `Unsubscribe`.

| Evento       | Payload        | Descrição                                               |
| ------------ | -------------- | ------------------------------------------------------- |
| `peerAccept` | `CallActive`   | Destinatário atendeu — um `CallActive` é fornecido.     |
| `peerReject` | —              | Destinatário recusou a chamada.                         |
| `unanswered` | —              | Chamada expirou sem resposta.                           |
| `ended`      | —              | Chamada encerrada (ex: destinatário desligou antes de atender). |
| `status`     | `CallStatus`   | Status da chamada mudou.                                |

```typescript
call.on("peerAccept", (active) => {
    // Transicionar para interface de chamada ativa
    active.on("ended", () => showCallEndedScreen())
})

call.on("peerReject", () => showNotification("Chamada recusada"))
call.on("unanswered", () => showNotification("Sem resposta"))
```

---

## Métodos

### `mute()` / `unmute()`

Silencia ou ativa o microfone para esta chamada.

```typescript
await call.mute()    // { err: string | null }
await call.unmute()
```

---

### `end()`

Encerra a chamada realizada.

```typescript
await call.end()
```

---

## Exemplo com fallback entre dispositivos

Use `startCallIterator` para exibir feedback por dispositivo enquanto tenta em sequência:

```typescript
const iter = wavoip.startCallIterator({ to: "+5511999999999" })

// Yield para cada tentativa falha
for await (const attempt of iter) {
    console.warn(`Dispositivo ${attempt.token} indisponível: ${attempt.err}`)
    updateUI({ tryingNext: true })
}

// Resultado final
const final = await iter.return(undefined)
if (final.value?.call) {
    handleOutgoingCall(final.value.call)
} else {
    showError("Todos os dispositivos falharam")
}
```

Após o destinatário atender, veja [Chamada Ativa](active.md) para gerenciar a chamada em andamento.
