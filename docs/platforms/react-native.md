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

## Um app de exemplo

O código de uma tela que conecta o device, liga, atende, mede o nível nas duas direções e
mostra o log na própria tela está em
[`examples/react-native`](https://github.com/wavoip/wavoip-api/tree/main/examples/react-native),
com o passo a passo para colocá-lo num app novo.

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
| Chamada não oficial | `AudioRecorder` captura e `AudioBufferQueueSourceNode` toca, os dois na taxa do relay |
| Transporte da não oficial | o `WebSocket` do React Native, que é o `NativeWebSocketModule` — OkHttp no Android |

{% hint style="info" %}
**Por que a sessão de áudio é configurada tão tarde.** O momento é o da track remota chegar, e
não o da conexão abrir. Configurar antes disso não adianta — o WebRTC nativo sobrescreve — e
configurar depois já é tarde, porque o áudio saiu pela rota errada. Foi o que a comunidade do
`react-native-webrtc` apurou depois de casos de chamada silenciosa no iOS.
{% endhint %}

### O socket é o da plataforma, e o que ele cobra

A chamada não oficial usa o `WebSocket` global do React Native, que não é uma implementação em
JavaScript: por baixo é o `NativeWebSocketModule`, um TurboModule — OkHttp no Android. O núcleo
não constrói socket nenhum; ele recebe um `openSocket` do runtime, e cada plataforma entrega o
seu. O navegador entrega o mesmo global porque a API tem a mesma forma; o Node traz o `ws`.

O que o React Native cobra a mais é a travessia até esse módulo: `WebSocket.send` de um
`ArrayBuffer` chama `sendBinary(binaryToBase64(data))`, ou seja, **cada frame binário é
codificado em base64 em JavaScript** antes de chegar ao nativo, que o decodifica de volta.
Medido num Galaxy A55, para um bloco de 20 ms (640 bytes, que viram 856 de base64):

| | |
| --- | --- |
| Codificar em base64, p50 | 0,082 ms |
| p95 | 0,261 ms |

São 0,4% do orçamento de tempo real, e não custam banda: quem fala com a rede é o módulo
nativo, já com os bytes de volta. Não vale otimizar.

{% hint style="info" %}
O áudio passa pela thread de JavaScript porque é lá que esse socket vive: um runtime de worklet
recebe exatamente cinco globais — `__DEV__`, `global`, `performance`, `_WORKLET` e
`__workletsModuleProxy` —, sem `__turboModuleProxy`, então nenhum módulo nativo do React Native
é alcançável de lá.

Um HybridObject do Nitro, porém, é JSI puro e não depende dessa ponte: o
`react-native-nitro-websockets` tem `sendBinary(ArrayBuffer)` síncrono e **funciona de dentro
do runtime de áudio** — verificado num aparelho. Não usamos porque a entrega pelo grafo tem
cauda pior, e não por falta de caminho; os números estão acima. Se um dia a conta virar, é
exatamente isso que o `openSocket` do runtime existe para permitir, sem tocar no núcleo.
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

## A taxa do áudio: quem converte é o sistema

**A biblioteca não reamostra nada no React Native.** Dos dois lados, a taxa é pedida à
plataforma e a plataforma a entrega:

- **Na captura**, o `AudioRecorder` recebe o pedido de 16 kHz e grava em 16 kHz. Num Galaxy
  A55 5G ele entrega blocos de 320 frames em um canal, a 15.995 Hz contados no relógio, com
  cadência de 20 ms (p95 de 23,7 ms) — e honra 48 kHz com a mesma fidelidade, quando é isso
  que se pede.
- **Na reprodução**, o `AudioContext` é aberto na taxa do relay, e converter para os 48 kHz do
  alto-falante é trabalho da camada de áudio do sistema.

{% hint style="warning" %}
Se algum aparelho gravar numa taxa diferente da pedida, a chamada não oficial **falha ao
abrir o microfone**, dizendo qual foi a taxa. Não há conversão de reserva: entregar o áudio
assim mesmo daria voz acelerada ou arrastada, e uma chamada que não conecta é melhor que uma
incompreensível. Se você encontrar um aparelho assim, ele é a notícia — abra uma issue.
{% endhint %}

<details>

<summary>E se um aparelho não honrar a taxa? O caminho pelo grafo, medido e descartado</summary>

Existe uma saída nativa para esse caso, e ela foi testada num aparelho, não imaginada: o
`AudioRecorder` entra no grafo por um `RecorderAdapterNode`, o `AudioContext` roda na taxa da
chamada, e um `WorkletNode` devolve o PCM já convertido, numa thread de áudio dedicada.
Funciona — grafo a 16 kHz, saída medida a 15.994 Hz, blocos de 320 frames com sinal de verdade.

Dá até para fechar o caminho inteiro sem nunca tocar a thread de JavaScript: o
`react-native-nitro-websockets` é um HybridObject do Nitro em C++, com `sendBinary(ArrayBuffer)`
síncrono, e **ele roda de dentro do runtime de áudio** — testado, com os frames chegando a um
servidor de verdade.

O que derruba a ideia é a regularidade da entrega. Medindo no servidor, com blocos de 20 ms:

| Caminho | p50 | p95 | Cauda (p95 − p50) |
| --- | --- | --- | --- |
| `onAudioReady` → thread de JS → `WebSocket` do RN | 20,0 ms | **26,0 ms** | **6,0 ms** |
| `WorkletNode` → `sendBinary` do Nitro, sem passar por JS | 19,4 ms | **30,2 ms** | **10,8 ms** |

E não é desalinhamento com o quantum de 128 frames do grafo: com 384 frames (3 quanta exatos) a
cauda foi de 12,2 ms, e com 256 (2 quanta) de 12,0 ms. A dispersão acompanha o caminho pelo
grafo, seja qual for o tamanho do bloco.

O que se ganharia do outro lado é pequeno: sai da thread de JavaScript a conversão para Int16 e
o base64 do socket, cerca de 0,12 ms por bloco de 20 ms. Trocar 0,12 ms de trabalho por 5 ms de
cauda não fecha, e ainda custaria três módulos nativos a quem integra —
`react-native-worklets`, `react-native-nitro-modules` e `react-native-nitro-websockets`.

Fica registrado porque a conclusão pode virar: se um aparelho não honrar a taxa pedida, este é
o caminho, e ele está provado ponta a ponta.

</details>

### Por que não converter aqui, medido

O **Hermes**, o motor JavaScript do React Native, interpreta em vez de compilar, e não
implementa WebAssembly. O mesmo reamostrador sinc leva **0,2 ms por bloco de 20 ms no V8 e
11,8 ms no Hermes** — 60 vezes mais. No Node isso é 1% do orçamento de tempo real; aqui seriam
60%, só para tocar.

Na reprodução, o alto-falante do aparelho roda a 48 kHz. Quem faz essa conversão é a camada de
áudio do sistema, e não a biblioteca: o `AudioContext` do caminho do relay é aberto **na taxa
do relay**, e os blocos entram como vieram da rede.

Vale pelo que se economiza. Reamostrando em JavaScript, um bloco de 20 ms custava 11,9 ms no
Hermes — 60% do orçamento de tempo real só para tocar:

| Trecho de um bloco de 20 ms | Reamostrando no Hermes | Com o grafo na taxa do relay |
| --- | --- | --- |
| `createBuffer` + `copyToChannel` + `enqueueBuffer` | 0,065 ms | 0,047 ms |
| Converter Int16 para Float32 | incluído abaixo | 0,035 ms |
| Reamostrar de 16 para 48 kHz | ~11,8 ms | — |
| **Total por bloco** | **~11,9 ms** | **0,082 ms** |

São 33 taps por amostra **produzida**, e subir de 16 para 48 kHz produz o triplo do que entra.
O Hermes interpreta isso; o sistema faz o mesmo em C++, de graça para nós.

{% hint style="danger" %}
**Não tente declarar a taxa no buffer em vez de no contexto.** Enfileirar um `AudioBuffer` de
16 kHz num grafo de 48 kHz não faz o nativo reamostrar: ele toca as amostras na taxa do grafo
e a voz sai três vezes mais rápida e aguda. Medido — meio segundo de áudio tocou em 190 ms. A
taxa tem de ser pedida ao `AudioContext`.
{% endhint %}

{% hint style="info" %}
A FFT do espectro existe em JavaScript pelo mesmo motivo. Reparar que são coisas diferentes: o
Hermes explica por que a **implementação** é em JavaScript. O espectro vazio na chamada oficial
é outro assunto, logo abaixo.
{% endhint %}

## O que o React Native consegue medir, e o que não

| Leitura | Chamada oficial | Chamada não oficial |
| --- | --- | --- |
| `call.audio.out.*` (seu microfone) | nível ✅, espectro e estouro ❌ | tudo ✅ |
| `call.audio.in.*` (o contato) | nível ✅, espectro e estouro ❌ | tudo ✅ |
| Estouro do microfone no diagnóstico | ✅ | ✅ |

O nível vem das estatísticas da conexão, que o WebRTC publica em qualquer plataforma. Espectro
e estouro precisam das amostras, e é aí que a chamada oficial esbarra.

{% hint style="info" %}
**O diagnóstico mede o estouro do microfone mesmo assim.** Ele não usa o áudio da chamada: usa
o mesmo caminho de gravação da chamada não oficial, que passa pelo `AudioRecorder`. Como o
diagnóstico roda antes da chamada, não há dois acessos ao microfone ao mesmo tempo.
{% endhint %}

## Por que o espectro vem vazio na chamada oficial

Não é falta de capacidade de calcular: é falta do áudio. Na chamada **oficial** o
`react-native-webrtc` toca em nativo e nunca entrega as amostras ao JavaScript, então não há o
que analisar deste lado. No navegador e no Node o áudio atravessa o processo, e por isso os
dois preenchem.

A comunidade já pediu acesso ao áudio cru das tracks, e a
[issue foi fechada como "not planned"](https://github.com/react-native-webrtc/react-native-webrtc/issues/1552):
não há `addSink` para áudio como existe para vídeo, e o `getStats()` publica `audioLevel`, mas
nada que revele estouro. Sem alterar o módulo nativo, não há como chegar às amostras.

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

{% hint style="warning" %}
**Rodou num Android; num iPhone, ainda não.** As medições desta página vêm de um Galaxy A55 5G
(Android 16, `arm64-v8a`). O iOS continua sem execução em aparelho — em especial a sessão de
áudio com a chamada chegando em segundo plano, que é o risco próprio da plataforma.
{% endhint %}
