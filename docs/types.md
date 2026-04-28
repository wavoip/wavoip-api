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
    CallPeer, CallStats, CallStatus, CallType, CallDirection,
    DeviceStatus, Contact,
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
```

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
}
```

### `CallOutgoingEvents`

```typescript
type CallOutgoingEvents = {
    peerAccept: [call: CallActive]
    peerReject: []
    unanswered: []
    ended:      []
    status:     [status: CallStatus]
}
```

### `CallActiveEvents`

```typescript
type CallActiveEvents = {
    error:            [err: string]
    peerMute:         []
    peerUnmute:       []
    ended:            []
    stats:            [stats: CallStats]
    connectionStatus: [status: TransportStatus]
    status:           [status: CallStatus]
}
```

### `DeviceEvents`

```typescript
type DeviceEvents = {
    statusChanged:  [status: DeviceStatus]
    qrCodeChanged:  [qrCode?: string]
    contactChanged: [contact?: Contact]
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
