---
description: O que muda da v2 para a v3, item a item, com o antes e o depois.
icon: arrow-right-arrow-left
---

# Migrando da v2 para a v3

A v3 é uma versão que quebra compatibilidade. Ela existe para resolver quatro coisas que a
v2 não tinha como resolver sem quebrar:

1. **Cinco formatos de retorno diferentes** (`{ err }`, `{ call, err }`, `{ pairingCode, err }`,
   `boolean` e `Promise<void>` que lança) viram um só, o `Result`.
2. **Erro sem vocabulário próprio**: o código vinha cru do protocolo, e às vezes era uma frase
   traduzida. Agora existe um catálogo estável.
3. **Eventos que exigiam `if` no callback** e desfechos que disparavam mais de um evento.
4. **Tipos do navegador na API**, que impediam usar a biblioteca fora dele.

Cada seção abaixo tem o **antes**, o **depois** e o porquê quando ele não é óbvio.

{% hint style="info" %}
Não existe uma 2.8 de transição: os membros depreciados da v2 saem direto na v3. Se o seu
código ainda usa algum deles, comece pela primeira seção.
{% endhint %}

---

## 1. A superfície depreciada saiu

Tudo que a v2 marcava como `@deprecated` foi removido. O substituto de cada um já existia na
v2, então dá para fazer esta parte **antes** de subir para a v3.

| v2 (removido) | v3 |
| --- | --- |
| `wavoip.onOffer(cb)` | `wavoip.on("offer", cb)` |
| `call.onError(cb)`, `onPeerMute`, `onPeerUnmute`, `onEnd`, `onStats`, `onConnectionStatus`, `onStatus` | `call.on("<evento>", cb)` |
| `offer.onAcceptedElsewhere(cb)`, `onRejectedElsewhere`, `onUnanswered`, `onEnd`, `onStatus` | `offer.on("<evento>", cb)` |
| `outgoing.onPeerAccept(cb)`, `onPeerReject`, `onUnanswered`, `onEnd`, `onStatus` | `outgoing.on("<evento>", cb)` |
| `device.onStatus(cb)`, `onQRCode`, `onContact` | `device.on("statusChanged" \| "qrCodeChanged" \| "contactChanged", cb)` |
| `call.device_token`, `offer.device_token`, `outgoing.device_token` | `deviceToken` |
| `call.connection_status` | `call.connectionStatus` |
| `call.audio_analyser` | `call.audio.in` (ver a seção de áudio) |
| `outgoing.end()` | `outgoing.cancel()` |
| `CallFailReason` com `"AUDIO_TIMEOUT"` | `ErrorCode` com `"LOCAL_AUDIO_TIMEOUT"` |

Os `onX(cb)` tinham uma armadilha: cada um guardava **uma** assinatura, então chamar o mesmo
`onX` duas vezes substituía o listener anterior em vez de somar. O `on()` acumula, como se
espera, e devolve o `Unsubscribe`.

---

## 2. Os eventos `stats` e `serverStats` saíram

```typescript
// v2
call.on("stats", (stats) => render(stats))

// v3
const timer = setInterval(async () => render(await call.getStats()), 1000)
```

**Por quê.** Os dois eventos disparavam numa cadência fixa de 200ms decidida pela biblioteca —
cinco leituras por segundo, por chamada, quisesse você ou não. O `getStats()` já existia na v2
e deixa a cadência com quem desenha a tela. Com os eventos saiu também a opção `statsTickMs`
do construtor, que só servia para configurá-los.

O `serverStats` não tem substituto separado: o que ele trazia já entra no `getStats()` das
chamadas `unofficial`, mesclado com o que o cliente mede.

---

## 3. Os erros têm um catálogo

```typescript
// v2 — o código vinha cru do protocolo, e às vezes era uma frase traduzida
const { err } = await call.cancel()
if (err === "IS_NOT_OFFER") { … }

// v3
const { error } = await call.cancel()
if (error?.code === "CALL_ALREADY_ANSWERED") { … }
```

O `code` agora é da biblioteca, não do protocolo, e é estável. Veja o catálogo em
[`ErrorCode`](types.md#errorcode).

| v2 | v3 |
| --- | --- |
| `"IS_NOT_OFFER"` | `"CALL_ALREADY_ANSWERED"` |
| `"PEER_TX_TIMEOUT"` | `"LOCAL_AUDIO_TIMEOUT"` |
| `"PEER_RX_TIMEOUT"` | `"REMOTE_AUDIO_TIMEOUT"` |
| `"AUDIO_TIMEOUT"` | `"LOCAL_AUDIO_TIMEOUT"` |
| `"CORRUPTED_KEYS"` | `"ENCRYPTION_FAILED"` |
| `"INTERNAL_ERROR"` | `"SERVER_ERROR"` |
| `"MEDIA_OFFER_FAILED"` / `"MEDIA_START_FAILED"` (chegavam como a mensagem da exceção) | `"MEDIA_NEGOTIATION_FAILED"`, com a exceção original em `error.cause` |
| `"HTTP_502"`, `"NETWORK_ERROR"` e códigos da API central | `"NETWORK_ERROR"`, `"DEVICE_NOT_FOUND"`, `"WAKE_UP_RATE_LIMITED"`, `"DEVICE_ERROR"` ou `"UNKNOWN"` com o valor bruto em `cause` |

{% hint style="warning" %}
`LOCAL_` e `REMOTE_` **não** são uma tradução direta de `TX` e `RX`. Os nomes antigos eram do
ponto de vista do motor de VoIP do servidor, e a documentação da v2 descrevia os dois
invertidos: `PEER_TX_TIMEOUT` sempre foi "o **seu** microfone parou de enviar". Se o seu código
trata os dois de formas diferentes, confira o lado.
{% endhint %}

### O idioma agora é seu

```typescript
// v2
const wavoip = new Wavoip({ tokens, language: "es" })
wavoip.setLanguage("pt-BR")

// v3 — a biblioteca devolve código; a mensagem é da sua aplicação
const messages: Record<ErrorCode, string> = { DEVICE_NOT_LINKED: "Conecte um número…", … }
toast(messages[error.code])
```

`language`, `setLanguage` e a dependência `a18n` saíram. A biblioteca não é interface: ela
não tem como saber o tom, o idioma nem o contexto da sua aplicação, e uma frase pronta em
três idiomas atendia mal os três.
