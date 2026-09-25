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

{% hint style="warning" %}
**O diagnóstico pede a permissão do microfone, e é de propósito.** Sem ela a plataforma não
conta o que está ligado: devolve entradas sem nome, e às vezes nem isso. Um diagnóstico que não
pede não consegue responder se a chamada vai sair.

Então rode-o de um botão, e não no carregamento da página — a pessoa precisa entender por que
o navegador está pedindo o microfone naquele instante.
{% endhint %}

{% hint style="info" %}
**Rodar durante uma chamada é seguro.** O microfone é o mesmo de todas as chamadas, e o
diagnóstico só fecha o que ele próprio abriu: se já havia uma chamada em curso, o áudio dela
não é tocado.
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
| `MICROPHONE_PERMISSION_DENIED` | a pessoa negou, ou a plataforma recusou — impede os dois tipos de chamada |
| `SPEAKER_MISSING` | não há saída de áudio: a chamada acontece, mas ninguém ouve o contato |
| `MICROPHONE_CLIPPING` | o microfone está estourando; `details.clipping` traz a fração |

`MICROPHONE_FOUND` traz `details.count` e `details.names`, que só existem porque a permissão
foi dada — antes dela a plataforma não diz o nome de nada.

Para checar o ganho, o diagnóstico **escuta o microfone por uns 300 ms**. Se o sinal já chega
ceifado no teto, a voz vai sair áspera na chamada e nada recupera isso depois — quem fala não
percebe, só quem ouve. É aviso e não reprovação: a chamada acontece, mal.

{% hint style="info" %}
`SPEAKER_MISSING` é aviso, e não impedimento: um processo sem tela não tem alto-falante e não
deve ser reprovado por isso.
{% endhint %}

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
