---
description: Chamadas de áudio num app React Native, pelo react-native-webrtc.
icon: mobile-screen
---

# React Native

**Os dois tipos de chamada funcionam.** A oficial pelo `react-native-webrtc`; a não oficial
convertendo o microfone do aparelho para os 16 kHz que o relay fala, em JavaScript puro.

## Instalar

```bash
npm install @wavoip/wavoip-api react-native-webrtc react-native-incall-manager react-native-audio-api
```

{% hint style="danger" %}
**O `react-native-incall-manager` não é opcional na prática.** Ele é quem configura a sessão
de áudio do sistema. Sem ele, no iOS o app fica na categoria `Ambient`, que obedece ao botão
de silencioso: a chamada conecta, os pacotes de áudio chegam, e o usuário **não ouve nada** —
um sintoma que parece problema de rede e não é. No Android, o áudio sai pela rota errada
porque ninguém pediu o foco de áudio.

A biblioteca cuida disso por você: ela chama o `InCallManager` no momento certo, quando o
áudio do contato chega. Você só precisa instalar o pacote.
{% endhint %}

```typescript
import { Wavoip, reactNativeRuntime } from "@wavoip/wavoip-api/react-native"

const wavoip = new Wavoip({ tokens: ["seu-token"], runtime: reactNativeRuntime() })
```

{% hint style="info" %}
As duas são dependências de par **opcionais** no `package.json`, o que significa apenas que
quem instala para navegador ou para Node não as baixa. Num app React Native, as duas são
necessárias.
{% endhint %}

### Você não precisa do `registerGlobals()`

É comum ver guias de `react-native-webrtc` mandando chamar `registerGlobals()`, que despeja
`RTCPeerConnection`, `MediaStream` e companhia no escopo global. Isso existe para bibliotecas
escritas contra as APIs do navegador, que precisam achar esses nomes soltos.

Esta biblioteca não é uma delas: o runtime recebe as implementações por injeção, e nenhum
global é lido. Chamar `registerGlobals()` não quebra nada, mas para nós não faz diferença.

## Requisitos do app

{% stepper %}
{% step %}
## Nova arquitetura

O `react-native-webrtc` exige a New Architecture (TurboModules / Fabric), padrão a partir do
React Native 0.76.
{% endstep %}

{% step %}
## Permissão de microfone

A permissão é pedida quando a chamada abre o microfone, mas o app tem de declará-la antes.

{% tabs %}
{% tab title="Android" %}
```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```
{% endtab %}

{% tab title="iOS" %}
```xml
<!-- ios/SeuApp/Info.plist -->
<key>NSMicrophoneUsageDescription</key>
<string>Para falar nas chamadas</string>
```
{% endtab %}
{% endtabs %}

Sem a declaração, o sistema recusa o microfone e a chamada devolve
`MICROPHONE_PERMISSION_DENIED`.
{% endstep %}

{% step %}
## Resolução de subcaminhos no Metro

O import `@wavoip/wavoip-api/react-native` depende do campo `exports` do `package.json`, que o
Metro lê a partir do React Native 0.79. Em versões anteriores, ligue à mão:

```javascript
// metro.config.js
module.exports = {
    resolver: { unstable_enablePackageExports: true },
}
```
{% endstep %}
{% endstepper %}

## O que este runtime faz

O trabalho pesado é do nativo, e é por isso que este adaptador é pequeno: o
`react-native-webrtc` toca o áudio que chega por conta própria, assim que a track entra na
conexão. Não há grafo de áudio a montar nem alto-falante a abrir.

| | Como |
| --- | --- |
| Microfone | `getUserMedia` do `react-native-webrtc` — a mesma chamada do navegador |
| Chamada oficial | `RTCPeerConnection` nativa |
| Áudio que chega | roteado pelo sistema, sem passar pela biblioteca |
| Mudo | desliga a track, como no navegador |
| Lista de aparelhos | `enumerateDevices`, conferido item a item antes de ser entregue |
| Sessão de áudio do sistema | `InCallManager`, iniciado quando o áudio do contato chega e encerrado no fim |
| Viva-voz | `wavoip.audio.selectOutput("speaker")` ou `"earpiece"` |
| Nível do áudio | `call.audio.in.level()` e `out.level()`, lidos das estatísticas da conexão |
| Chamada não oficial | `AudioRecorder` captura, `AudioBufferQueueSourceNode` toca, e a reamostragem é em JavaScript |

{% hint style="info" %}
**Por que a sessão de áudio é configurada tão tarde.** O momento é o da track remota chegar, e
não o da conexão abrir. Configurar antes disso não adianta — o WebRTC nativo sobrescreve — e
configurar depois já é tarde, porque o áudio saiu pela rota errada. Foi o que a comunidade do
`react-native-webrtc` apurou depois de casos de chamada silenciosa no iOS.
{% endhint %}

## Escolher onde a chamada é ouvida

```typescript
const { error } = await wavoip.audio.selectOutput("speaker")   // viva-voz
if (error) console.error(error.code)

await wavoip.audio.selectOutput("earpiece")                    // volta ao fone
wavoip.audio.currentOutput.id                                  // "earpiece"
```

As duas saídas vêm de `listOutputDevices()` e são as que um telefone realmente oferece. Elas
são declaradas pela biblioteca, e não lidas do `enumerateDevices`: o `react-native-webrtc`
devolve `unknown` ali e não separa fone de alto-falante.

## Medir o nível do áudio

```typescript
call.audio.in.level()    // o contato falando, de 0 a 1
call.audio.out.level()   // o seu microfone
```

Funciona, e por um caminho diferente do navegador. No React Native o áudio não passa pela
biblioteca — quem toca e captura é o nativo —, então não há o que medir neste processo. O
número vem do `audioLevel` que o `getStats()` da própria conexão publica, que é o nível que o
WebRTC de fato vê. Para quem chama, é a mesma função.

## A conversão de taxa, e por que ela é em JavaScript

O `AudioRecorder` grava na taxa que o **aparelho** decidir: a taxa pedida é preferência, e a
documentação dele avisa que varia conforme o hardware. A biblioteca lê a taxa real de cada
bloco que chega e converte para os 16 kHz do relay; se o aparelho mudar de taxa no meio da
chamada, ela acompanha.

Essa conversão é JavaScript puro, sem WebAssembly, porque o **Hermes** — o motor JavaScript do
React Native — não implementa WebAssembly. Uma biblioteca compilada como o `libsamplerate`
serviria ao navegador e ao Node e deixaria o celular de fora.

{% hint style="info" %}
A FFT do espectro existe em JavaScript pelo mesmo motivo. Reparar que são coisas diferentes: o
Hermes explica por que a **implementação** é em JavaScript. O espectro vazio na chamada oficial
é outro assunto, logo abaixo.
{% endhint %}

## Por que o espectro vem vazio na chamada oficial

Não é falta de capacidade de calcular: é falta do áudio. Na chamada **oficial** o
`react-native-webrtc` toca em nativo e nunca entrega as amostras ao JavaScript, então não há o
que analisar deste lado. No navegador e no Node o áudio atravessa o processo, e por isso os
dois preenchem.

Na chamada **não oficial** o espectro funciona: ali o PCM atravessa o processo nas duas
direções, e é dele que saem nível e bandas. Vale para os três ambientes, porque o cálculo mora
no caminho do relay e não no motor de cada plataforma.

{% hint style="info" %}
**O microfone é aberto uma vez só.** Na chamada não oficial quem grava é o `AudioRecorder`, e o
`getUserMedia` do `react-native-webrtc` nem chega a ser chamado: dois acessos nativos ao mesmo
microfone é risco que não se corre de graça. Quem decide de onde tirar as amostras é o motor de
áudio da plataforma, e não o caminho do relay.
{% endhint %}

## O que ainda falta

| | Situação |
| --- | --- |
| `call.stats.latency.playout_ms` | `null` — o nativo não informa |
| Escolher o microfone | `selectInput` devolve `INPUT_SELECTION_UNSUPPORTED`: no Android e no iOS quem decide é o sistema, seguindo o que está conectado |
| `wavoip.audio.currentInput` | `null` — o sistema não informa qual microfone está usando |

{% hint style="danger" %}
**Este adaptador ainda não foi executado num aparelho.** Os tipos batem com os do
`react-native-webrtc` e a lógica é coberta por testes com dublês do módulo, mas nada
substitui rodar num Android e num iPhone de verdade. Trate-o como pronto para ser testado, e
não como pronto para produção.
{% endhint %}
