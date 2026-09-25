---
description: Inicie chamadas e trate respostas do destinatário.
icon: phone-outgoing
---

# Chamadas Realizadas

Use `wavoip.startCall()` para iniciar uma chamada. O método retorna um objeto `OutgoingCall` que emite eventos conforme o destinatário responde.

---

## Iniciando uma chamada

```typescript
const { data: call, error } = await wavoip.startCall({
    to: "+5511999999999",
})

if (error) {
    console.error("Não foi possível iniciar a chamada:", error.code)
    // error.devices lista quais dispositivos foram tentados e por que cada um falhou
    return
}

// call é um OutgoingCall
call.on("accepted", (active) => {
    console.log("Chamada conectada!")
    handleActiveCall(active)
})

call.on("rejected", () => console.log("Destinatário rejeitou a chamada"))
call.on("unanswered", () => console.log("Sem resposta"))
```

---

## Parâmetros de `startCall`

| Parâmetro    | Tipo       | Obrigatório | Descrição                                                          |
| ------------ | ---------- | ----------- | ------------------------------------------------------------------ |
| `to`         | `string`   | Sim         | Número de telefone de destino (formato E.164 recomendado).         |
| `fromTokens` | `string[]` | Não         | Restringe quais dispositivos tentar. Padrão: todos os dispositivos.|

### Valor de retorno

**Sucesso** — `{ data: OutgoingCall; error: null }`

**Falha** — `{ data: null; error: StartCallFailure }`, onde `StartCallFailure` é um `WavoipError` com `devices: { token, error }[]`

{% hint style="warning" %}
**Espere o dispositivo se apresentar antes de ligar.** Logo depois do `new Wavoip(...)` ele está em `BUILDING`, e o servidor ainda não disse se as chamadas dele são oficiais ou não oficiais — sem isso a biblioteca não escolhe o transporte do áudio e recusa a chamada com `DEVICE_NOT_READY`.

```typescript
const device = wavoip.devices[0]

device.on("statusChanged", (status) => {
    if (status === "open") enableCallButton()
})
```
{% endhint %}

{% hint style="info" %}
`startCall` tenta cada dispositivo elegível em sequência. O primeiro dispositivo que iniciar a chamada com sucesso é usado; os demais não são tentados. Use `fromTokens` para controlar quais dispositivos participam.
{% endhint %}

---

## Propriedades do OutgoingCall

| Propriedade                       | Tipo            | Descrição                                                  |
| --------------------------------- | --------------- | ---------------------------------------------------------- |
| `id`                              | `string`        | Identificador único da chamada.                            |
| `type`                            | `CallType`      | `"OFFICIAL"` ou `"UNOFFICIAL"`.                            |
| `direction`                       | `CallDirection` | Sempre `"OUTGOING"`.                                       |
| `peer`                            | `CallPeer`      | Telefone, nome de exibição e foto de perfil do destinatário.|
| `deviceToken`                     | `string`        | Token do dispositivo que está realizando a chamada.        |
| `status`                          | `CallStatus`    | Estado atual da chamada. Acompanha os eventos do servidor: dentro de qualquer handler já traz o valor novo. |

---

## Eventos

Assine com `call.on(evento, callback)`. Retorna uma função `Unsubscribe`.

| Evento              | Payload             | Descrição                                                                                                       |
| ------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `accepted`          | `ActiveCall`        | Destinatário atendeu — a chamada continua no `ActiveCall` que vem no payload.                                   |
| `rejected`          | —                   | Destinatário recusou a chamada.                                                                                 |
| `unanswered`        | —                   | Tocou até o fim sem ninguém atender.                                                                            |
| `failed`            | `OutgoingCallFailure` | A chamada não subiu: falha de mídia local ou do servidor.                                                     |
| `ended`             | —                   | O servidor encerrou a oferta — um reinício ou uma hibernação do dispositivo, por exemplo.                       |
| `iceDiagnostics`    | `IceDiagnostics`    | Diagnóstico da coleta ICE, que acontece antes de a chamada existir. Replay em listeners tardios.                 |
| `connectivityIssue` | `ConnectivityIssue` | Problema de conectividade detectado, inclusive enquanto a chamada ainda toca. Replay em listeners tardios. Veja [Tipos → Diagnóstico ICE](../types.md#diagnostico-ice).|

#### Cancelar não dispara evento

`cancel()` responde no próprio `Result`: se ele voltar sem erro, a chamada foi cancelada, e
nenhum evento é emitido por isso. Cada desfecho tem o seu evento, e o `ended` aqui significa
uma coisa só — **o servidor** encerrou a oferta sem que ninguém tenha atendido, recusado ou
desistido daqui. Acontece quando o dispositivo reinicia ou entra em hibernação no meio.

O `status` está sempre atualizado dentro de qualquer handler, se você quiser lê-lo:

```typescript
call.on("rejected", () => showEndScreen(call.status))   // "REJECTED"
```

```typescript
call.on("accepted", (active) => {
    // Transicionar para interface de chamada ativa
    active.on("ended", () => showCallEndedScreen())
})

call.on("rejected", () => showNotification("Chamada recusada"))
call.on("unanswered", () => showNotification("Sem resposta"))
call.on("failed", (error) => showNotification(messages[error.code]))
```

---

## Métodos

### `mute()` / `unmute()`

Silencia ou ativa o microfone para esta chamada.

```typescript
await call.mute()    // Result<void, CommandFailure>
await call.unmute()
```

---

### `cancel()`

Desiste da chamada antes de o destinatário atender — é o equivalente ao CANCEL do SIP.

```typescript
const { error } = await call.cancel()
if (error) console.error("Não foi possível cancelar:", error.code)
```

Só encerra a chamada e libera o microfone **quando o servidor confirma**. Se o
destinatário atender no exato instante do clique, o servidor recusa com `CALL_ALREADY_ANSWERED`
e a chamada continua viva e com áudio — cabe à sua interface reabilitar o botão.

Se o ack não chegar em 10s, resolve com `error.code === "ACK_TIMEOUT"` em vez de ficar pendente
para sempre.

{% hint style="warning" %}
`ACK_TIMEOUT` significa **"não sabemos"**, não "não cancelou". O pacote é descartado
quando o prazo estoura, então o servidor pode nunca tê-lo recebido e o destinatário
pode continuar tocando — e atender. Por isso o áudio **não** é liberado nesse caminho:
trate como chamada possivelmente viva, e continue ouvindo `accepted` e `ended`.
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

## Exemplo com fallback entre dispositivos

Use `startCallIterator` para exibir feedback por dispositivo enquanto tenta em sequência:

```typescript
const attempts = wavoip.startCallIterator({ to: "+5511999999999" })

// Cada yield é um dispositivo que não pôde chamar.
let step = await attempts.next()
while (!step.done) {
    console.warn(`Dispositivo ${step.value.token} indisponível:`, step.value.error.code)
    updateUI({ tryingNext: true })
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

Após o destinatário atender, veja [Chamada Ativa](active.md) para gerenciar a chamada em andamento.
