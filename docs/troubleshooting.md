---
description: Diagnostique e resolva problemas de conectividade em chamadas WebRTC.
icon: stethoscope
---

# Solução de Problemas

Esta página documenta os eventos de diagnóstico emitidos pela biblioteca durante chamadas WebRTC oficiais e como interpretá-los. Use-os para detectar problemas de rede no cliente e orientar o usuário ou o suporte.

## Eventos de diagnóstico

Todas as facades de chamada (`Offer`, `CallOutgoing`, `CallActive`) expõem dois eventos relacionados a diagnóstico:

### `iceDiagnostics`

Disparado uma vez ao fim do gathering ICE (sucesso ou timeout). Contém um snapshot do que foi coletado.

```typescript
call.on("iceDiagnostics", (diag) => {
    console.log("gatheringDurationMs", diag.gatheringDurationMs)
    console.log("gatheringTimedOut", diag.gatheringTimedOut)
    console.log("candidates", diag.candidatesByType)
    console.log("stunReached", diag.stunReached)
    console.log("turnReached", diag.turnReached)
})
```

| Campo                  | Tipo                          | Descrição                                                                                                          |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `gatheringDurationMs`  | `number`                      | Tempo total gasto reunindo candidatos ICE.                                                                         |
| `gatheringTimedOut`    | `boolean`                     | `true` quando o gathering foi interrompido pelo `gatheringTimeoutMs` (não atingiu `iceGatheringState === "complete"`). |
| `candidatesByType`     | `Record<IceCandidateKind, n>` | Contagem por tipo (`host`, `srflx`, `prflx`, `relay`).                                                             |
| `stunReached`          | `boolean`                     | `true` quando ao menos um candidato `srflx` foi reunido (STUN respondeu).                                          |
| `turnReached`          | `boolean`                     | `true` quando ao menos um candidato `relay` foi reunido (TURN respondeu).                                          |

### `connectivityIssue`

Disparado uma vez por tipo de problema detectado durante a chamada.

```typescript
call.on("connectivityIssue", (issue) => {
    switch (issue) {
        case "STUN_UNREACHABLE":          /* ... */ break
        case "ICE_GATHERING_TIMEOUT":     /* ... */ break
        case "ICE_CONNECTION_FAILED":     /* ... */ break
        case "NO_HOST_CANDIDATES":        /* ... */ break
        case "SYMMETRIC_NAT_SUSPECTED":   /* ... */ break
    }
})
```

## Catálogo de problemas

### `STUN_UNREACHABLE`

**O que é:** Nenhum candidato `srflx` foi reunido antes do timeout. Indica que os servidores STUN configurados não responderam.

**Causas comuns:**

* Firewall corporativo bloqueando UDP (porta 3478 ou 19302).
* DNS lento ou bloqueio do hostname do servidor STUN.
* ISP filtrando tráfego UDP.

**Como agir:**

* Use a função [`runStunProbe`](#runstunprobe) para verificar quais servidores estão acessíveis.
* Configure `iceConfig.iceServers` com servidores próprios.
* Se mesmo assim falhar, considere TURN.

### `ICE_GATHERING_TIMEOUT`

**O que é:** O gathering atingiu o `gatheringTimeoutMs` antes de `iceGatheringState === "complete"`. A chamada prossegue com os candidatos já reunidos.

**Causas comuns:** As mesmas de `STUN_UNREACHABLE`, ou um servidor STUN/TURN lento.

**Como agir:** Verifique a rede do usuário. Se `stunReached` for `true` no `iceDiagnostics`, a chamada provavelmente conecta mesmo assim.

### `ICE_CONNECTION_FAILED`

**O que é:** Após o gathering, o `RTCPeerConnection` falhou em estabelecer transporte de mídia (`iceConnectionState === "failed"`).

**Causas comuns:**

* NAT simétrico em ambos os lados sem TURN disponível.
* Firewall bloqueando tráfego de mídia (UDP).
* Falha no relay do servidor.

**Como agir:** Confirme se há rota UDP livre entre cliente e servidor. Encaminhe para o suporte com o relatório de diagnóstico.

### `NO_HOST_CANDIDATES`

**O que é:** O navegador não emitiu candidatos do tipo `host` (IP local). Raro.

**Causas comuns:**

* mDNS desabilitado em ambientes restritos.
* Configuração de privacidade do navegador que oculta interfaces locais.
* VPN bloqueando interfaces.

**Como agir:** Verifique configurações do navegador e VPN.

### `SYMMETRIC_NAT_SUSPECTED`

**O que é:** O STUN respondeu, mas após 10 segundos a conexão ICE ainda não foi estabelecida. Sugere NAT simétrico bloqueando o pareamento de candidatos sem um relay TURN.

**Causas comuns:** NAT simétrico do lado do cliente (comum em redes móveis, alguns roteadores domésticos).

**Como agir:** Hoje a biblioteca não traz TURN embutido. Em breve documentaremos como apontar para um servidor TURN próprio via `iceConfig.iceServers`.

## `runStunProbe`

Utilitário para verificar reachability de servidores STUN diretamente do navegador. Útil em telas de diagnóstico/suporte.

```typescript
import { runStunProbe } from "@wavoip/wavoip-api"

const results = await runStunProbe([
    "stun:stun.l.google.com:19302",
    "stun:stun.cloudflare.com:3478",
])
// [{ server, reachable, latencyMs? }, ...]
```

| Parâmetro    | Tipo       | Padrão | Descrição                              |
| ------------ | ---------- | ------ | -------------------------------------- |
| `servers`    | `string[]` | —      | URLs `stun:` para testar em paralelo.  |
| `timeoutMs?` | `number`   | `3000` | Limite para considerar inacessível.    |

Cada resultado é `{ server, reachable: boolean, latencyMs?: number }`. `latencyMs` só vem preenchido quando o servidor respondeu com um candidato `srflx`.

{% hint style="info" %}
A função cria `RTCPeerConnection`s descartáveis — não requer nenhuma chamada ativa.
{% endhint %}
