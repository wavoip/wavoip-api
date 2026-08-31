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

| Propriedade                       | Tipo            | Descrição                                                  |
| --------------------------------- | --------------- | ---------------------------------------------------------- |
| `id`                              | `string`        | Identificador único da chamada.                            |
| `type`                            | `CallType`      | `"official"` ou `"unofficial"`.                            |
| `direction`                       | `CallDirection` | Sempre `"OUTGOING"`.                                       |
| `peer`                            | `CallPeer`      | Telefone, nome de exibição e foto de perfil do destinatário.|
| `deviceToken`                     | `string`        | Token do dispositivo que está realizando a chamada.        |
| `status`                          | `CallStatus`    | Estado atual da chamada.                                   |
| ~~`device_token`~~ **(deprecated)** | `string`      | **Use `deviceToken` no lugar.** Acesso emite `console.warn` único. |

---

## Eventos

Assine com `call.on(evento, callback)`. Retorna uma função `Unsubscribe`.

| Evento              | Payload             | Descrição                                                                                                       |
| ------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `peerAccept`        | `CallActive`        | Destinatário atendeu — um `CallActive` é fornecido.                                                             |
| `peerReject`        | —                   | Destinatário recusou a chamada.                                                                                 |
| `unanswered`        | —                   | Chamada expirou sem resposta.                                                                                   |
| `ended`             | —                   | Chamada encerrada — inclusive por cancelamento. Consulte `status` para saber qual fim foi (ver abaixo).           |
| `status`            | `CallStatus`        | Status da chamada mudou.                                                                                        |
| `iceDiagnostics`    | `IceDiagnostics`    | Diagnóstico da coleta ICE realizada antes do par atender.                                                       |
| `connectivityIssue` | `ConnectivityIssue` | Problema de conectividade detectado durante a chamada. Veja [Tipos → Diagnóstico ICE](../types.md#diagnostico-ice).|

#### Cancelada ou encerrada?

`ended` é o único evento terminal, e é ele que desfaz a chamada. Para saber **qual**
fim foi, olhe o `status` que vem junto:

```typescript
let outcome: CallStatus = "ENDED"
call.on("status", (s) => { outcome = s })
call.on("ended", () => {
    // "CANCELLED" quando alguém desistiu antes do atendimento
    showEndScreen(outcome)
})
```

O `status` do desfecho é sempre emitido **antes** do `ended`, justamente para que o
handler acima já o veja.

{% hint style="info" %}
`CANCELLED` **não** quer dizer "você cancelou": quer dizer que alguém desistiu antes do
atendimento — pode ter sido o destinatário. Uma instância antiga não informa o desfecho
e tudo continua chegando como `ENDED`.
{% endhint %}

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

### `cancel()`

Desiste da chamada antes de o destinatário atender — é o equivalente ao CANCEL do SIP.

```typescript
const { err } = await call.cancel()
if (err) console.error("Não foi possível cancelar:", err)
```

Só encerra a chamada e libera o microfone **quando o servidor confirma**. Se o
destinatário atender no exato instante do clique, o servidor recusa com `IS_NOT_OFFER`
e a chamada continua viva e com áudio — cabe à sua interface reabilitar o botão.

Se o ack não chegar em 10s, resolve com `err: "ACK_TIMEOUT"` em vez de ficar pendente
para sempre.

{% hint style="warning" %}
`ACK_TIMEOUT` significa **"não sabemos"**, não "não cancelou". O pacote é descartado
quando o prazo estoura, então o servidor pode nunca tê-lo recebido e o destinatário
pode continuar tocando — e atender. Por isso o áudio **não** é liberado nesse caminho:
trate como chamada possivelmente viva, e continue ouvindo `peerAccept` e `ended`.
{% endhint %}

Em qualquer outra recusa (id desconhecido, erro interno) a chamada já morreu no
servidor e o microfone é liberado.

{% hint style="info" %}
**Instâncias antigas.** Um dispositivo só recebe a versão nova da instância quando
reinicia, então esta SDK convive com instâncias antigas por tempo indeterminado. Contra
elas, `cancel()` funciona — o evento no fio é o mesmo de sempre —, mas o desfecho não é
informado: o fim chega como `ENDED`, não `CANCELLED`, e a recusa por corrida com o
atendimento pode voltar como sucesso. Trate `ENDED` como o desfecho padrão e não dependa
de `CANCELLED` para encerrar a interface.
{% endhint %}

---

### `end()`

{% hint style="warning" %}
**Depreciado.** Use `cancel()` — mesmo comportamento, nome que corresponde ao que
sempre foi enviado no fio. O acesso emite um `console.warn` único.
{% endhint %}

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
