---
description: Chamadas de áudio num app React Native, pelo react-native-webrtc.
icon: mobile-screen
---

# React Native

{% hint style="warning" %}
**Só chamada oficial, por enquanto.** Um device configurado como `UNOFFICIAL` não funciona
aqui: a chamada não oficial carrega PCM cru, que este runtime ainda não sabe tratar. Em vez de
quebrar no meio da ligação, `startCall` recusa de cara com o código
`CALL_TYPE_UNSUPPORTED` — veja [O que ainda falta](#o-que-ainda-falta).
{% endhint %}

## Instalar

```bash
npm install @wavoip/wavoip-api react-native-webrtc
```

```typescript
import { Wavoip, reactNativeRuntime } from "@wavoip/wavoip-api/react-native"

const wavoip = new Wavoip({ tokens: ["seu-token"], runtime: reactNativeRuntime() })
```

{% hint style="info" %}
`react-native-webrtc` é dependência de par **opcional**: quem instala a biblioteca para
navegador ou para Node não baixa nada dela.
{% endhint %}

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

## O que ainda falta

| | Situação |
| --- | --- |
| Chamada não oficial (relay) | recusada com `CALL_TYPE_UNSUPPORTED`; depende de um motor de áudio que trate PCM |
| `call.audio.in.level()` / `out.level()` | devolve `0`: o `react-native-webrtc` não expõe o nível, e o campo não está no contrato do `getStats()` dele |
| `call.stats.latency.playout_ms` | `null` — o nativo não informa |
| `wavoip.audio.currentInput` / `currentOutput` | `null` — no React Native quem escolhe a saída é o sistema |

As duas primeiras linhas dependem do mesmo pacote, o `react-native-audio-api`, que tem
gravação a partir do microfone com taxa configurável e worklets em JavaScript na thread de
áudio. O reamostrador de que elas precisam **já existe e é compartilhado**: ele é JavaScript
puro justamente porque o Hermes não tem WebAssembly.

{% hint style="danger" %}
**Este adaptador ainda não foi executado num aparelho.** Os tipos batem com os do
`react-native-webrtc` e a lógica é coberta por testes com dublês do módulo, mas nada
substitui rodar num Android e num iPhone de verdade. Trate-o como pronto para ser testado, e
não como pronto para produção.
{% endhint %}
