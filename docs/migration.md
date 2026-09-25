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
| `call.connection_status` | `call.connection` (ver a seção das duas pernas) |
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

---

## 4. Todo método devolve `Result`

Os cinco formatos de retorno viraram um:

```typescript
type Result<T, E> = { data: T; error: null } | { data: null; error: E }
```

```typescript
// v2
const { call, err } = await offer.accept()
if (err) return showError(err)

// v3
const { data: call, error } = await offer.accept()
if (error) return showError(messages[error.code])
```

| v2 | v3 |
| --- | --- |
| `offer.accept()` → `{ call, err }` | `Result<ActiveCall, AcceptFailure>` |
| `offer.reject()` → `{ err }` | `Result<void, CommandFailure>` |
| `call.mute()` / `unmute()` / `end()` → `{ err }` | `Result<void, CommandFailure>` |
| `outgoing.mute()` / `unmute()` / `cancel()` → `{ err }` | `Result<void, CommandFailure>` |

**Desestruturar continua sendo o jeito curto**, só mudam os nomes: `data` no lugar de `call` /
`pairingCode`, e `error` (um objeto) no lugar de `err` (uma string). Se você só quer saber se
deu certo, `if (error)` responde igual ao `if (err)` de antes.

O tipo do erro é o subconjunto que aquele método pode devolver, então o autocomplete não
oferece código que não pode acontecer ali. `CommandFailure` são os códigos de comando; o
`AcceptFailure` soma a eles o `MEDIA_NEGOTIATION_FAILED`, porque atender sobe a mídia local
antes de o comando sair.

### No device e no `Wavoip`

| v2 | v3 |
| --- | --- |
| `device.restart()` / `logout()` → `Promise<void>` que engolia a falha | `Result<void, DeviceApiFailure>` |
| `device.wakeUp()` → `boolean` | `Result<void, DeviceApiFailure>` |
| `device.pairingCode(phone)` → `{ pairingCode, err }` | `Result<string, CommandFailure>` |
| `wavoip.startCall()` → `{ call, err: { message, devices } }` | `Result<OutgoingCall, StartCallFailure>` |
| `wavoip.startCallIterator()` → yield `{ call, token, err }` | yield `DeviceAttempt` (`{ token, error }`) |
| `wavoip.wakeUpDevices()` → `Promise<{ token, waken }>[]` | `Promise<DeviceWakeUp>[]`, com `{ token, result }` |

O `restart()` e o `logout()` da v2 devolviam `Promise<void>`: se a rota respondesse 500, o seu
código não tinha como saber. Agora a falha aparece.

A mensagem em português que vinha no `err.message` do `startCall` (`"Não foi possível realizar
a chamada"`) não tem substituto — ela era texto de interface dentro da biblioteca. No lugar
dela vem o `code` do primeiro dispositivo que falhou, e a lista `devices` com todos.

---

## 5. Os três objetos de chamada: nomes e eventos

| v2 | v3 |
| --- | --- |
| `Offer` | `IncomingCall` |
| `CallOutgoing` | `OutgoingCall` |
| `CallActive` | `ActiveCall` |
| `OfferEvents`, `CallOutgoingEvents`, `CallActiveEvents` | `IncomingCallEvents`, `OutgoingCallEvents`, `ActiveCallEvents` |

O evento `wavoip.on("offer")` **não** mudou de nome — só o tipo que ele entrega.

### Os eventos

| v2 | v3 |
| --- | --- |
| `outgoing.on("peerAccept")` | `on("accepted")` |
| `outgoing.on("peerReject")` | `on("rejected")` |
| `active.on("error")` | `on("failed")` |
| `active.on("peerMute")` + `on("peerUnmute")` | `on("peerMuteChanged", (muted) => …)` |
| `active.on("connectionStatus")` | `on("connectionChanged")` (ver abaixo) |
| `offer.on("unanswered")` | `on("ended")` |
| `offer.on("ended")` com `status === "CANCELLED"` | `on("cancelled")` |
| `on("status")` nos três | removido — o **getter** `status` continua |

O prefixo `peer` saiu de `peerAccept` e `peerReject` porque ele não distinguia nada: numa
chamada que sai, quem aceita ou recusa é sempre o outro lado.

**O evento `status` saiu, o getter fica.** Evento se perde — assinatura tardia, listener
removido, aba suspensa —, e o getter sempre responde certo, inclusive dentro de qualquer
handler. Onde você lia `on("status", …)` para saber o desfecho, hoje lê o evento específico
(`rejected`, `cancelled`, `unanswered`, `failed`, `ended`) e, se precisar, o `status` dentro dele.

### O que você causou não vira evento

```typescript
// v2 — end() disparava ended, e o seu handler rodava para o seu próprio desligar
call.on("ended", showEndScreen)
await call.end()      // showEndScreen roda aqui

// v3 — a resposta é o Result; o ended é só quando o OUTRO lado desliga
const { error } = await call.end()
if (!error) showEndScreen()
```

Vale para `end()`, `cancel()` e `reject()`. Se a sua interface reage no evento, mova a reação
para depois do `await`: ela passa a rodar uma vez só, em vez de depender de o servidor ecoar.

### As duas pernas viraram uma

A v2 tinha `connectionStatus` (o transporte local) e o evento `status` com
`DISCONNECTED`/`ACTIVE` (a perna entre o servidor e o WhatsApp). Ninguém tinha as duas na mão,
e dava para mostrar "conectado" com a perna do WhatsApp caída.

```typescript
// v3
call.connection   // "connected" | "reconnecting" | "disconnected"
call.on("connectionChanged", (connection) => { … })
```

Qualquer perna caindo de forma recuperável deixa a chamada em `"reconnecting"`, e o evento sai
só quando o estado somado muda — não repete.

---

## 6. `CallStats` tem a latência decomposta

```typescript
// v2
const { rtt, rx, audio_context } = await call.getStats()
render(rtt.avg, rx.audio_level, audio_context.output_latency_ms)

// v3
const { rtt, audio, latency } = await call.getStats()
render(rtt.avg, audio.rx.level, latency.total_ms)
```

| v2 | v3 |
| --- | --- |
| `tx.audio_level` / `rx.audio_level` | `audio.tx.level` / `audio.rx.level` |
| `tx.bitrate_kbps` / `rx.bitrate_kbps` | `audio.tx.bitrate_kbps` / `audio.rx.bitrate_kbps` |
| `rx.jitter_ms` | `audio.rx.jitter_ms` |
| `tx.total` / `rx.total` | `packets.tx.sent` / `packets.rx.received` |
| `tx.loss` / `rx.loss` | `packets.tx.lost` / `packets.rx.lost` |
| `tx.total_bytes` / `rx.total_bytes` | `packets.tx.bytes` / `packets.rx.bytes` |
| `audio_context.output_latency_ms` | `latency.playout_ms` |
| — | `latency.network_ms`, `whatsapp_ms`, `jitter_buffer_ms`, `total_ms` |

### Três correções que vêm junto

**O RTT de chamada oficial estava em segundos.** O `getStats()` do WebRTC devolve
`roundTripTime` em segundos, e a biblioteca publicava o valor cru num campo documentado como
milissegundos: um RTT de 40ms aparecia como `0.04`. Se a sua interface multiplicava por 1000
para compensar, **tire a multiplicação**.

**A latência de saída era só metade da história — e nem sempre existia.** O `output_latency_ms`
vinha do `AudioContext.outputLatency`, que conta do grafo de áudio até o alto-falante e mais
nada. O que espera na fila de reprodução não entrava, e numa chamada por relay essa fila é o
maior termo: ela segura até cerca de 780ms antes de descartar. Agora ela é medida
(`jitter_buffer_ms`), e o `playout_ms` passou a somar o `baseLatency`. No Safari, que não
implementa `outputLatency`, o campo agora é `null` em vez de `NaN`.

**`null` no lugar de zero.** Todo campo de `latency` é `number | null`, e `null` quer dizer "não
medido aqui". Um zero afirmava latência nula, o que é bem diferente de não ter medida.

{% hint style="info" %}
O `whatsapp_ms` é informação que a v2 recebia e jogava fora: o `call:stats` sempre trouxe o RTT
da perna servidor ⇔ WhatsApp, e a projeção interna só aproveitava a perna do cliente.
{% endhint %}

---

## 7. `call.audio` no lugar dos `AnalyserNode`

```typescript
// v2 — dois AnalyserNode do Web Audio, atrás de Promises
const [analyserIn, analyserOut] = await Promise.all([call.audioAnalyserIn, call.audioAnalyserOut])
const buf = new Uint8Array(analyserIn.frequencyBinCount)
analyserIn.getByteFrequencyData(buf)

// v3 — um objeto por direção, leitura síncrona
call.audio.in.level()     // 0 a 1
call.audio.out.level()
```

| v2 | v3 |
| --- | --- |
| `call.audioAnalyserIn` | `call.audio.in` |
| `call.audioAnalyserOut` | `call.audio.out` |
| `call.audio_analyser` (deprecated) | `call.audio.in` |

**Por que trocar.** O `AnalyserNode` é um tipo do navegador: enquanto ele estava na assinatura,
um projeto React Native não conseguia nem compilar o `.d.ts` da biblioteca. O `level()` é
neutro, e é o que a maior parte dos integradores extraía do analisador de qualquer forma.

**Se você desenhava espectro ou forma de onda**, o `level()` não cobre — abra uma issue
dizendo o que você desenha. O objeto existe para isso crescer: `waveform()` e `spectrum()`
entram nele sem quebrar de novo, e valem para as duas direções.

Duas coisas ficaram melhores de quebra: as leituras são síncronas (davam `await` antes, o que
não combina com `requestAnimationFrame`) e respondem `0` antes de a mídia subir, em vez de
deixar a Promise pendente.

---

## 8. `wavoip.audio` no lugar de `multimedia`

```typescript
// v2
const devices = wavoip.getMultimediaDevices()           // MediaDeviceInfo[]
const mics = devices.filter((d) => d.kind === "audioinput")
const { microphone } = wavoip.multimedia

// v3
const mics = wavoip.audio.listInputDevices()            // AudioDevice[]
const current = wavoip.audio.currentInput
```

| v2 | v3 |
| --- | --- |
| `wavoip.getMultimediaDevices()` | `wavoip.audio.listInputDevices()` + `listOutputDevices()` |
| `wavoip.multimedia.microphone` | `wavoip.audio.currentInput` |
| `wavoip.multimedia.speaker` | `wavoip.audio.currentOutput` |
| `MediaManagerState` | removido — não havia como chegar nele pela API pública |

O tipo mudou de `MediaDeviceInfo` (do navegador) para `AudioDevice`, que é da biblioteca:

```typescript
type AudioDevice = { id: string; label: string; kind: "input" | "output" }
```

O `deviceId` virou `id`, e o `kind` deixou de ser `"audioinput"`/`"audiooutput"` — a lista já
vem separada por método, então o filtro que você fazia some junto. **Entrada e saída são listas
separadas** porque o nome no plural era a única coisa distinguindo as duas na v2, e filtrar por
string é fácil de errar.

{% hint style="info" %}
Escolher o aparelho, testar o microfone e controlar o volume entram numa versão seguinte. O
`setMicrophone`/`setSpeaker` que a documentação da v2 descrevia **nunca** esteve na API
pública: era código interno sem chamador, e o texto estava errado.
{% endhint %}

---

## 9. Nenhum tipo do navegador na superfície

Esta é a mudança que sustenta todas as outras: **o `dist/index.d.ts` da v3 não cita nenhum tipo
do DOM**. Na v2 ele citava quatro — `AnalyserNode`, `MediaDeviceInfo`, `MediaStream` e
`RTCIceServer` —, e isso bastava para um projeto React Native não conseguir nem compilar a
biblioteca, mesmo sem chamar nada de áudio.

| v2 | v3 |
| --- | --- |
| `AnalyserNode` em `audioAnalyserIn`/`Out` | `AudioAnalyser` com `level()` |
| `MediaDeviceInfo` em `multimedia` / `getMultimediaDevices` | `AudioDevice` |
| `MediaStream` em `MediaManagerState` | tipo removido da superfície |
| `RTCIceServer` em `iceConfig.iceServers` | `IceServer`, com os mesmos campos |

O `IceServer` tem a **mesma forma** do `RTCIceServer`, então a sua configuração de STUN/TURN
continua válida como está — muda só o nome do tipo, se você o anotava explicitamente.

O `pnpm build` da biblioteca agora quebra se algum tipo do DOM voltar para a superfície, então
isso não regride em silêncio.

---

## 10. Miudezas que também saíram

| v2 | v3 |
| --- | --- |
| `wavoip.emit(...)`, `once`, `off`, `removeAllListeners` | só `wavoip.on(...)` |
| `CallEndOutcome` | removido — era o payload cru do `call:ended`, não API |
| `DeviceStatus` com `"UP"` | removido — não era usado em lugar nenhum do sistema |
| `MediaManagerState` | removido |
| `runStunProbe`, `StunProbeResult` | saíram da superfície pública |

O `runStunProbe` sondava servidores STUN e continua existindo por dentro, mas ele presumia o
navegador: criava a conexão de teste com a implementação web, e era isso que prendia o pacote
inteiro ao DOM. Sondar a rede volta como parte do diagnóstico de ambiente, que cobre mais que
STUN e funciona em qualquer plataforma.

O `Wavoip` herdava de um `EventEmitter` interno, e com isso o `emit` e o `removeAllListeners`
ficavam na mão de quem consome: dava para forjar um `offer` ou desligar os listeners da própria
biblioteca. Agora ele tem o emissor por dentro e expõe só o `on`.

---

## 11. A plataforma passa a ser escolhida por você

```typescript
// v2
const wavoip = new Wavoip({ tokens })

// v3
import { Wavoip, webRuntime } from "@wavoip/wavoip-api/web"

const wavoip = new Wavoip({ tokens, runtime: webRuntime() })
```

Uma linha, e ela é o que permite a biblioteca sair do navegador: o núcleo deixou de construir
`AudioContext`, `getUserMedia`, `RTCPeerConnection` e `WebSocket` por conta própria — quem os
traz é o runtime. O `webRuntime()` faz exatamente o que a v2 fazia escondido.

Um runtime sem WebRTC (`createPeer` ausente) ou sem socket binário (`openSocket` ausente) diz
isso na hora de abrir a chamada daquele tipo, em vez de falhar no meio da ligação.

### O pacote agora tem um caminho por ambiente

| Import | O que vem | Para quem |
| --- | --- | --- |
| `@wavoip/wavoip-api/web` | o núcleo **e** o `webRuntime()` | navegador |
| `@wavoip/wavoip-api/node` | o núcleo **e** o `nodeRuntime()` | processo sem cabeça: bot, URA, gravação |
| `@wavoip/wavoip-api` | só o núcleo, sem plataforma nenhuma | quem traz o próprio runtime |

Quem está no navegador troca o import por `/web` e segue; o resto da API é idêntico, porque o
`/web` reexporta tudo o que o núcleo exporta.

A separação é o que faz o núcleo caber fora do navegador: ele tem 54 kB e não cita um tipo do
DOM sequer, enquanto a implementação web passa de 2 MB — quase tudo worklet de áudio com o
reamostrador embutido. O adaptador de Node, que não precisa de nenhum dos dois, tem 5 kB.

Ver [Plataformas](platforms/README.md) para o que cada ambiente suporta.

{% hint style="warning" %}
**Quem carrega por `<script>`**: o arquivo mudou de `dist/index.umd.js` para
`dist/web.umd.js`. O global continua `WavoipAPI`.
{% endhint %}

---

## 12. A restrição do device virou um valor só

```typescript
// v2 — dois campos que só fazem sentido juntos
if (device.restricted) showBanner(device.restrictedUntil)
device.on("restrictedChanged", (restricted, until) => …)

// v3
if (device.restriction) showBanner(device.restriction.until)
device.on("restrictionChanged", (restriction) => …)
```

| v2 | v3 |
| --- | --- |
| `device.restricted` + `device.restrictedUntil` | `device.restriction` (`{ until } \| null`) |
| `restrictedChanged(restricted, until)` | `restrictionChanged(restriction)` |
| `qrCode?: string`, `contact?: Contact` | `qrCode: string \| null`, `contact: Contact \| null` |

Dois campos que só fazem sentido juntos abrem estado impossível — `restricted: false` com uma
data, ou `true` sem ela — e obrigam quem lê a checar os dois. Um valor que existe ou não fecha
essa porta, e o prazo mora dentro dele.

O vocabulário do servidor (`restricted` + `restrictedUntil`) continua igual no fio; a tradução
acontece no adaptador, como já vale para os códigos de erro.
