---
description: Referência completa de todos os tipos exportados.
icon: brackets-curly
---

# Tipos

Todos os tipos listados aqui são re-exportados da raiz do pacote e podem ser importados diretamente:

```typescript
import type {
    CallActive, CallActiveEvents,
    CallOutgoing, CallOutgoingEvents,
    Offer, OfferEvents,
    Device, DeviceEvents,
    CallPeer, CallStats, ServerCallStats, CallStatus, CallType, CallDirection,
    DeviceStatus, Contact,
    IceDiagnostics, IceCandidateKind, ConnectivityIssue,
    StunProbeResult,
    TransportStatus,
    Unsubscribe,
} from "@wavoip/wavoip-api"
```

---

## Tipos de chamada

### `CallStatus`

Todos os estados possíveis de uma chamada.

```typescript
type CallStatus =
    | "CALLING"       // Oferta recebida, ainda não atendida
    | "RINGING"       // Chamada realizada tocando no destinatário
    | "ACTIVE"        // Chamada conectada com áudio fluindo
    | "ENDED"         // Chamada encerrada normalmente
    | "REJECTED"      // Chamada foi rejeitada
    | "NOT_ANSWERED"  // Sem resposta antes do tempo limite
    | "FAILED"        // Falha no nível de transporte durante a chamada
    | "DISCONNECTED"  // Conexão perdida
```

### `CallType`

```typescript
type CallType = "official" | "unofficial"
```

| Valor          | Transporte          | Descrição                                          |
| -------------- | ------------------- | -------------------------------------------------- |
| `"official"`   | WebRTC              | Chamada nativa do WhatsApp usando SRTP.            |
| `"unofficial"` | Relay via WebSocket | Áudio retransmitido pelos servidores Wavoip.       |

### `CallDirection`

```typescript
type CallDirection = "INCOMING" | "OUTGOING"
```

---

## Par

```typescript
type CallPeer = {
    phone: string               // Número no formato E.164
    displayName: string | null  // Nome de exibição do WhatsApp
    profilePicture: string | null  // URL da foto de perfil
    muted: boolean              // Se o par está silenciado no momento
}
```

---

## Estatísticas de chamada

`CallStats` é o snapshot retornado por [`CallActive.getStats()`](calls/active.md#getstats). Em chamadas `official` todos os campos vêm de `RTCPeerConnection.getStats()`. Em chamadas `unofficial` os campos de RTT, perda e totais vêm do push `serverStats` do servidor, enquanto bitrate, audio levels, jitter RX e latência de saída vêm das medições do transporte WebSocket — `getStats()` retorna os dois mesclados.

```typescript
type CallStats = {
    rtt: {
        min: number   // Tempo mínimo de ida e volta (ms)
        max: number   // Tempo máximo de ida e volta (ms)
        avg: number   // Tempo médio de ida e volta (ms)
    }
    tx: {
        total:        number  // Pacotes enviados
        total_bytes:  number  // Bytes enviados
        loss:         number  // Perda de pacotes
        bitrate_kbps: number  // Bitrate de envio na última janela de tick
        audio_level:  number  // RMS do microfone (0–1)
    }
    rx: {
        total:        number  // Pacotes recebidos
        total_bytes:  number  // Bytes recebidos
        loss:         number  // Perda de pacotes
        bitrate_kbps: number  // Bitrate de recepção na última janela de tick
        audio_level:  number  // RMS do alto-falante (0–1)
        jitter_ms:    number  // Jitter estimado (RFC 3550)
    }
    audio_context: {
        output_latency_ms: number  // AudioContext.outputLatency × 1000
    }
}

type ServerCallStats = {
    rtt: {
        client:   { min: number; max: number; avg: number }  // ms — servidor ↔ cliente
        whatsapp: { min: number; max: number; avg: number }  // ms — servidor ↔ WhatsApp
    }
    tx: { total: number; total_bytes: number; loss: number }
    rx: { total: number; total_bytes: number; loss: number }
}
```

---

## Diagnóstico ICE

Emitido como parte do ciclo de vida da chamada para ajudar a investigar problemas de conexão de mídia.

```typescript
type IceCandidateKind = "host" | "srflx" | "prflx" | "relay"

type IceDiagnostics = {
    gatheringDurationMs: number                          // Tempo total de coleta de candidatos ICE
    gatheringTimedOut:   boolean                         // true se a coleta excedeu o timeout
    candidatesByType:    Record<IceCandidateKind, number>// Contagem por tipo de candidato
    stunReached:         boolean                         // STUN respondeu durante a coleta
    turnReached:         boolean                         // TURN respondeu durante a coleta
    selectedCandidatePair?: {
        local:  IceCandidateKind
        remote: IceCandidateKind
        rtt?:   number                                   // RTT do par selecionado (ms)
    }
}

type ConnectivityIssue =
    | "STUN_UNREACHABLE"
    | "ICE_GATHERING_TIMEOUT"
    | "ICE_CONNECTION_FAILED"
    | "NO_HOST_CANDIDATES"
    | "SYMMETRIC_NAT_SUSPECTED"
```

{% hint style="info" %}
`iceDiagnostics` e `connectivityIssue` são emitidos por `Offer`, `CallOutgoing` e `CallActive`. Em `CallActive`, o último `iceDiagnostics` e todos os `connectivityIssue` recebidos até o momento são re-emitidos para listeners tardios, garantindo que consumidores que assinam após o início da chamada não percam o estado inicial.
{% endhint %}

---

## STUN

```typescript
type StunProbeResult = {
    server:    string
    reachable: boolean
    latencyMs?: number
}
```

Use `runStunProbe(servers, timeoutMs?)` para testar a alcançabilidade de servidores STUN em paralelo.

---

## Tipos de dispositivo

### `DeviceStatus`

```typescript
type DeviceStatus =
    | "UP"                        // (legado) Dispositivo em execução
    | "disconnected"              // WebSocket não conectado
    | "close"                     // Conectado, sem WhatsApp vinculado
    | "connecting"                // QR code pronto, aguardando leitura
    | "open"                      // Vinculado e pronto para chamadas
    | "restarting"                // Reiniciando; sem novas chamadas
    | "hibernating"               // Inativo; chame wakeUp()
    | "BUILDING"                  // Inicializando
    | "WAITING_PAYMENT"           // Pagamento da conta necessário
    | "EXTERNAL_INTEGRATION_ERROR"// Falha na integração externa
```

### `Contact`

```typescript
type Contact = {
    phone: string  // Número WhatsApp vinculado
}
```

---

## Transporte

### `TransportStatus`

```typescript
type TransportStatus = "disconnected" | "connecting" | "connected" | "reconnecting"
```

---

## Mapas de eventos

### `OfferEvents`

```typescript
type OfferEvents = {
    acceptedElsewhere: []
    rejectedElsewhere: []
    unanswered:        []
    ended:             []
    status:            [status: CallStatus]
    iceDiagnostics:    [diag: IceDiagnostics]
    connectivityIssue: [issue: ConnectivityIssue]
}
```

### `CallOutgoingEvents`

```typescript
type CallOutgoingEvents = {
    peerAccept:        [call: CallActive]
    peerReject:        []
    unanswered:        []
    ended:             []
    status:            [status: CallStatus]
    iceDiagnostics:    [diag: IceDiagnostics]
    connectivityIssue: [issue: ConnectivityIssue]
}
```

### `CallActiveEvents`

```typescript
type CallActiveEvents = {
    error:             [err: CallFailReason]
    peerMute:          []
    peerUnmute:        []
    ended:             []
    /** @deprecated Use `CallActive.getStats()` — você controla a cadência. */
    stats:             [stats: CallStats]
    /** @deprecated Use `CallActive.getStats()` — já mescla servidor + cliente. */
    serverStats:       [stats: ServerCallStats]
    connectionStatus:  [status: TransportStatus]
    status:            [status: CallStatus]
    iceDiagnostics:    [diag: IceDiagnostics]
    connectivityIssue: [issue: ConnectivityIssue]
}
```

### `DeviceEvents`

```typescript
type DeviceEvents = {
    statusChanged:     [status: DeviceStatus]
    qrCodeChanged:     [qrCode?: string]
    contactChanged:    [contact?: Contact]
    restrictedChanged: [restricted: boolean]
}
```

### `CallFailReason`

Motivo de falha emitido no evento `error` de [`CallActive`](calls/active.md). É uma união aberta: os literais conhecidos abaixo dão autocomplete, mas qualquer string vinda do servidor é aceita — assim novos motivos podem surgir sem quebrar consumidores tipados.

```typescript
type CallFailReason =
    | "AUDIO_TIMEOUT"        // @deprecated — use "PEER_RX_TIMEOUT"
    | "CORRUPTED_KEYS"
    | "CONNECTION_TIMEOUT"
    | "PEER_TX_TIMEOUT"
    | "PEER_RX_TIMEOUT"
    | "ACCOUNT_RESTRICTED"
    | "NO_CALL_PERMISSION"
    | "INTERNAL_ERROR"
    | (string & {})
```

| Motivo                | Significado                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `AUDIO_TIMEOUT`       | **Obsoleto.** Substituído por `PEER_RX_TIMEOUT`. Mantido para retrocompatibilidade.                    |
| `CORRUPTED_KEYS`      | Não foi possível estabelecer a chamada com segurança.                                                  |
| `CONNECTION_TIMEOUT`  | A chamada perdeu contato com o servidor.                                                               |
| `PEER_TX_TIMEOUT`     | O contato parou de enviar áudio.                                                                       |
| `PEER_RX_TIMEOUT`     | O usuário parou de enviar áudio. Substitui `AUDIO_TIMEOUT`.                                            |
| `ACCOUNT_RESTRICTED`  | A conta do WhatsApp está restrita e não pode realizar chamadas.                                        |
| `NO_CALL_PERMISSION`  | A conta não tem permissão para realizar chamadas.                                                      |
| `INTERNAL_ERROR`      | Algo deu errado do lado do servidor.                                                                   |

---

## Utilitários

### `Unsubscribe`

O tipo de retorno de cada chamada `on()`. Invoque-o para remover o listener.

```typescript
type Unsubscribe = () => void

const unsub = wavoip.on("offer", handler)
// Depois:
unsub()
```
