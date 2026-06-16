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

`CallStats` é medido pelo navegador (lado do cliente). `ServerCallStats` é o agregado periódico enviado pelos servidores Wavoip, com RTT separado entre o cliente e o WhatsApp.

```typescript
type CallStats = {
    rtt: {
        min: number   // Tempo mínimo de ida e volta (ms)
        max: number   // Tempo máximo de ida e volta (ms)
        avg: number   // Tempo médio de ida e volta (ms)
    }
    tx: {
        total:       number  // Pacotes enviados
        total_bytes: number  // Bytes enviados
        loss:        number  // Perda de pacotes (0–1)
    }
    rx: {
        total:       number  // Pacotes recebidos
        total_bytes: number  // Bytes recebidos
        loss:        number  // Perda de pacotes (0–1)
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
    error:             [err: string]
    peerMute:          []
    peerUnmute:        []
    ended:             []
    stats:             [stats: CallStats]
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
