---
description: Checar se o ambiente aguenta uma chamada, antes de tentar uma.
icon: stethoscope
---

# Diagnóstico de ambiente

```typescript
import { runDiagnostics } from "@wavoip/wavoip-api"
import { webRuntime } from "@wavoip/wavoip-api/web"

const report = await runDiagnostics({ runtime: webRuntime() })

if (!report.readiness.OFFICIAL.ready) {
    console.error("não dá para ligar:", report.readiness.OFFICIAL.blockedBy)
}
```

Responde a uma pergunta só: **este ambiente consegue fazer uma chamada agora?** E, quando não
consegue, diz o que falta em código, para você escrever o texto.

{% hint style="success" %}
**Rodar não mexe com ninguém.** Nenhuma chamada é aberta e nenhuma permissão é pedida — dá
para chamar no carregamento da página, numa tela de configurações ou num botão de suporte.
{% endhint %}

## O relatório

```typescript
type DiagnosticsReport = {
    checks: DiagnosticCheck[]
    readiness: {
        OFFICIAL:   { ready: boolean, blockedBy: DiagnosticCode[] }
        UNOFFICIAL: { ready: boolean, blockedBy: DiagnosticCode[] }
    }
}

type DiagnosticCheck = {
    code: DiagnosticCode
    severity: "ok" | "warning" | "failure"
    details?: Record<string, unknown>
}
```

A prontidão é **por tipo de chamada**, porque um ambiente pode fazer um e não o outro: um
runtime sem WebRTC não faz a oficial, um sem socket binário não faz a não oficial.

## Os códigos

### Áudio

| Código | O que significa |
| --- | --- |
| `AUDIO_RUNNING` | o motor subiu e está tocando |
| `USER_GESTURE_REQUIRED` | subiu, mas a plataforma segura o som até a pessoa tocar na tela |
| `AUDIO_ENGINE_FAILED` | não subiu; `details.cause` traz o que a plataforma disse |

{% hint style="warning" %}
**`USER_GESTURE_REQUIRED` não é defeito, e é a checagem que mais economiza suporte.** O
navegador não deixa tocar som antes de um clique ou toque na página. Se ninguém avisar, a
chamada conecta e sai muda — e parece problema de rede. Mostre um aviso pedindo um toque, em
vez de esconder o caso.
{% endhint %}

### Microfone

| Código | O que significa |
| --- | --- |
| `MICROPHONE_FOUND` | há ao menos um; `details.count` diz quantos |
| `MICROPHONE_MISSING` | não há nenhum — impede os dois tipos de chamada |
| `MICROPHONE_PERMISSION_PENDING` | os aparelhos aparecem sem nome, o que só acontece antes da permissão |

O diagnóstico **não pede a permissão**: ele lê a lista, e nome vazio já conta a história. Quem
pede é a chamada, quando abrir.

### Transporte

| Código | O que significa |
| --- | --- |
| `WEBRTC_AVAILABLE` / `WEBRTC_MISSING` | se a chamada `OFFICIAL` é possível |
| `BINARY_SOCKET_AVAILABLE` / `BINARY_SOCKET_MISSING` | se a chamada `UNOFFICIAL` é possível |

### Rede

| Código | O que significa |
| --- | --- |
| `STUN_REACHABLE` | ao menos um servidor respondeu; `details.servers` traz cada um |
| `STUN_UNREACHABLE` | nenhum respondeu — em geral firewall ou proxy bloqueando UDP |

{% hint style="info" %}
**Nenhum STUN responder é aviso, e não reprovação.** A chamada ainda pode sair por candidato
local, numa rede interna, ou por TURN. Por isso o STUN não entra no `blockedBy`.
{% endhint %}

## Sondar os seus próprios servidores

```typescript
const report = await runDiagnostics({
    runtime: webRuntime(),
    stunServers: ["stun:stun.suaempresa.com:3478"],
})
```

Passe `stunServers: []` para pular a sonda — ela é a única parte que fala com a rede, e leva
alguns segundos quando um servidor não responde.

## Montando uma tela de suporte

```typescript
const report = await runDiagnostics({ runtime })

const relatorio = {
    geradoEm: new Date().toISOString(),
    prontidao: report.readiness,
    verificacoes: report.checks,
}

await navigator.clipboard.writeText(JSON.stringify(relatorio, null, 2))
```

Os códigos são estáveis: o JSON copiado por quem está com problema continua legível meses
depois, e não depende do idioma da interface.
