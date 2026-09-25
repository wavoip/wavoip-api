---
description: Um import por ambiente, e o que cada um suporta.
icon: layer-group
---

# Plataformas

O núcleo da biblioteca não depende de ambiente nenhum: toda chamada a `AudioContext`,
`getUserMedia`, `RTCPeerConnection` ou WebSocket mora atrás de uma porta, e quem as
implementa é o **runtime** que você entrega ao construtor.

```typescript
import { Wavoip } from "@wavoip/wavoip-api"

const wavoip = new Wavoip({ tokens, runtime })  // o runtime vem do seu ambiente
```

## O que cada ambiente suporta

| | Navegador | Node.js | React Native |
| --- | --- | --- | --- |
| Import | `@wavoip/wavoip-api/web` | `@wavoip/wavoip-api/node` | `@wavoip/wavoip-api/react-native` |
| Runtime | `webRuntime()` | `nodeRuntime({ source, sink })` | `reactNativeRuntime()` |
| Chamada oficial (WebRTC) | ✅ | ✅ | ✅ (sem teste em aparelho) |
| Chamada não oficial (relay) | ✅ | ✅ | — recusada com código |
| Microfone e alto-falante | do aparelho | seus `source`/`sink` | do aparelho |
| Nível do áudio (`level()`) | ✅ | ✅ | — devolve 0 |
| Sessão de áudio do sistema | do navegador | — (não há) | `InCallManager`, automático |
| Listar aparelhos de áudio | ✅ | — (não há) | ✅ |
| Tamanho do adaptador | ~2 MB | ~9 kB | ~3 kB |
| Reamostragem automática | do navegador | ✅, opcionalmente em outro thread | não precisa: a track vai direto |

{% hint style="info" %}
O núcleo tem 54 kB e é o mesmo nos três. O peso do navegador é quase todo AudioWorklet com
o reamostrador embutido — o Node não precisa de nenhum dos dois, porque o áudio já entra e
sai no formato da biblioteca.
{% endhint %}

## Um runtime que não faz os dois tipos de chamada

O `WavoipRuntime` declara `createPeer` e `openSocket` como opcionais. Faltando um deles, a
chamada daquele tipo falha na hora de abrir, com código próprio, em vez de morrer no meio da
ligação:

| Ausente | Consequência |
| --- | --- |
| `createPeer` | sem chamada `OFFICIAL` (WebRTC) |
| `openSocket` | sem chamada `UNOFFICIAL` (relay) |

<table data-view="cards">
<thead><tr><th data-card-target data-type="content-ref"></th><th></th></tr></thead>
<tbody>
<tr><td><a href="node.md">node.md</a></td><td>Chamadas sem cabeça: bot, URA, gravação</td></tr>
<tr><td><a href="react-native.md">react-native.md</a></td><td>Chamadas num app iOS e Android</td></tr>
<tr><td><a href="../getting-started/installation.md">installation.md</a></td><td>Instalação e caminhos de import</td></tr>
</tbody>
</table>
