---
description: Referência completa de todos os tipos exportados.
icon: brackets-curly
---

# Tipos

Todos os tipos listados aqui são re-exportados da raiz do pacote e podem ser importados diretamente:

```typescript
import type {
    ActiveCall, ActiveCallEvents,
    OutgoingCall, OutgoingCallEvents,
    IncomingCall, IncomingCallEvents,
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
    | "CANCELLED"     // Alguém desistiu antes do atendimento (você ou o destinatário)
    | "REJECTED"      // Chamada foi rejeitada
    | "NOT_ANSWERED"  // Sem resposta antes do tempo limite
    | "FAILED"        // Falha no nível de transporte durante a chamada
    | "DISCONNECTED"  // Conexão perdida
```

{% hint style="info" %}
Numa chamada recebida, `CANCELLED` tem evento próprio: `cancelled`. Instâncias antigas não
informam o desfecho e reportam `ENDED`, que chega como `ended`.
{% endhint %}

### `CallType`

```typescript
type CallType = "OFFICIAL" | "UNOFFICIAL"
```

| Valor          | Transporte          | Descrição                                          |
| -------------- | ------------------- | -------------------------------------------------- |
| `"OFFICIAL"`   | WebRTC              | Chamada nativa do WhatsApp usando SRTP.            |
| `"UNOFFICIAL"` | Relay via WebSocket | Áudio retransmitido pelos servidores Wavoip.       |

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

`CallStats` é o snapshot devolvido por [`ActiveCall.getStats()`](calls/active.md#getstats). Em chamadas `official` tudo vem do `RTCPeerConnection.getStats()`. Em chamadas `unofficial`, RTT, perda e totais vêm do push `call:stats` do servidor, e bitrate, níveis, jitter de chegada e as latências locais vêm do transporte WebSocket — `getStats()` devolve os dois mesclados.

```typescript
type CallStats = {
    // RTT da perna cliente ⇔ servidor, acumulado ao longo da chamada, em ms
    rtt: { min: number; max: number; avg: number }

    // `null` = não medido nesta plataforma ou neste tipo de chamada (não é zero)
    latency: {
        total_ms:         number | null  // a soma do que foi medido; é estimativa
        network_ms:       number | null  // metade do RTT mais recente, cliente ⇔ servidor
        whatsapp_ms:      number | null  // metade do RTT servidor ⇔ WhatsApp
        jitter_buffer_ms: number | null  // áudio que chegou e ainda não tocou
        playout_ms:       number | null  // do motor de áudio até sair no aparelho
    }

    audio: {
        tx: { level: number; bitrate_kbps: number }
        rx: { level: number; bitrate_kbps: number; jitter_ms: number }
    }

    packets: {
        tx: { sent: number; lost: number; bytes: number }
        rx: { received: number; lost: number; bytes: number }
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

O que o construtor do `Wavoip` aceita:

```typescript
type IceConfig = {
    gatheringTimeoutMs?: number      // teto da coleta de candidatos; padrão 2500
    iceServers?: IceServer[]         // padrão: STUN do Google e da Cloudflare
}

type IceServer = {
    urls: string | string[]
    username?: string
    credential?: string
}
```

Mesma forma do `RTCIceServer` do navegador, mas declarado pela biblioteca — assim o `.d.ts`
não depende dos tipos do DOM.

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
`iceDiagnostics` e `connectivityIssue` são emitidos por `IncomingCall`, `OutgoingCall` e `ActiveCall`. Em `ActiveCall`, o último `iceDiagnostics` e todos os `connectivityIssue` recebidos até o momento são re-emitidos para listeners tardios, garantindo que consumidores que assinam após o início da chamada não percam o estado inicial.
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
    | "close"                     // Conectado, sem WhatsApp vinculado
    | "connecting"                // QR code pronto, aguardando leitura
    | "open"                      // Vinculado e pronto para chamadas
    | "restarting"                // Reiniciando; sem novas chamadas
    | "hibernating"               // Inativo; chame wakeUp()
    | "BUILDING"                  // Inicializando
    | "WAITING_PAYMENT"           // Pagamento da conta necessário
    | "EXTERNAL_INTEGRATION_ERROR"// Falha na integração externa
```

### `ConnectionStatus`

Estado do WebSocket entre SDK e backend. Independente do `DeviceStatus` (nível de conta).

```typescript
type ConnectionStatus =
    | "connected"     // WebSocket aberto e recebendo eventos
    | "disconnected"  // WebSocket fechado; sem tentativa de reconexão em andamento
    | "reconnecting"  // Tentando reabrir o WebSocket após queda
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

### `CallConnection`

O estado de uma chamada ativa com as duas pernas somadas — a mídia local e a perna entre o
servidor e o WhatsApp. Qualquer uma caindo de forma recuperável deixa a chamada em
`"reconnecting"`; `"disconnected"` quer dizer chamada perdida.

```typescript
type CallConnection = "connected" | "reconnecting" | "disconnected"
```

---

## Mapas de eventos

### `IncomingCallEvents`

```typescript
type IncomingCallEvents = {
    acceptedElsewhere: []
    rejectedElsewhere: []
    cancelled:         []
    ended:             []
    iceDiagnostics:    [diag: IceDiagnostics]
    connectivityIssue: [issue: ConnectivityIssue]
}
```

### `OutgoingCallEvents`

```typescript
type OutgoingCallEvents = {
    accepted:          [call: ActiveCall]
    rejected:          []
    unanswered:        []
    failed:            [error: OutgoingCallFailure]
    ended:             []
    iceDiagnostics:    [diag: IceDiagnostics]
    connectivityIssue: [issue: ConnectivityIssue]
}
```

### `ActiveCallEvents`

```typescript
type ActiveCallEvents = {
    ended:             []
    failed:            [error: WavoipError<CallFailureCode | "UNKNOWN">]
    peerMuteChanged:   [muted: boolean]
    connectionChanged: [connection: CallConnection]
    iceDiagnostics:    [diag: IceDiagnostics]
    connectivityIssue: [issue: ConnectivityIssue]
}
```

### `DeviceEvents`

```typescript
type DeviceEvents = {
    statusChanged:           [status: DeviceStatus]
    connectionStatusChanged: [status: ConnectionStatus]
    qrCodeChanged:           [qrCode?: string]
    contactChanged:          [contact?: Contact]
    restrictedChanged:       [restricted: boolean, restrictedUntil: Date | null]
    activeCallsChanged:      [count: number]
}
```

## Result e erros

### `Result`

O retorno de todo método que pode falhar.

```typescript
type Result<T, E extends WavoipError = WavoipError> =
    | { data: T;    error: null }
    | { data: null; error: E }
```

Cada método declara o subconjunto de códigos que **ele** pode devolver, então o autocomplete
não oferece código impossível naquele ponto:

| Alias | Onde aparece | Códigos |
| --- | --- | --- |
| `CommandFailure` | `mute`, `unmute`, `cancel`, `end`, `reject`, `pairingCode` | `CommandErrorCode \| "UNKNOWN"` |
| `AcceptFailure` | `offer.accept()` | os de comando mais `MEDIA_NEGOTIATION_FAILED` |
| `DeviceApiFailure` | `restart`, `logout`, `wakeUp` | `DeviceErrorCode \| "NETWORK_ERROR" \| "UNKNOWN"` |
| `OutgoingCallFailure` | evento `failed` da chamada que sai | `CallFailureCode \| "MEDIA_NEGOTIATION_FAILED" \| "UNKNOWN"` |
| `StartCallFailure` | `wavoip.startCall()` | `StartCallErrorCode`, mais a lista `devices` |

```typescript
type StartCallFailure = WavoipError<StartCallErrorCode> & {
    devices: DeviceAttempt[]      // o motivo de cada dispositivo, na ordem tentada
}

type DeviceAttempt = { token: string; error: WavoipError<StartCallErrorCode> }

type DeviceWakeUp = { token: string; result: Result<void, DeviceApiFailure> }
```

### `WavoipError`

O erro que todo método e todo evento de falha carrega. O `code` é o contrato: é estável, é nele que você decide o fluxo e é ele que você traduz. Código de protocolo (da instance, do UWP, da API central) é traduzido na borda da biblioteca e **nunca** chega até você.

```typescript
type WavoipError<C extends ErrorCode = ErrorCode> = {
    code: C
    details?: Record<string, unknown>   // valores para a sua mensagem, ex.: { min, max }
    cause?: unknown                     // valor bruto, só para log e diagnóstico
}
```

{% hint style="warning" %}
Não escreva lógica em cima do `cause` — ele é diagnóstico, não contrato. Quando um valor aparece com frequência, ele vira um `code` novo numa versão seguinte.
{% endhint %}

### `ErrorCode`

Um catálogo só, agrupado por origem. Cada método declara o subconjunto que ele pode devolver, então o autocomplete mostra só os códigos possíveis naquele ponto.

```typescript
type ErrorCode = DeviceErrorCode | CommandErrorCode | MediaErrorCode | CallFailureCode | "UNKNOWN"
```

| Grupo | Código | Significado |
| ----- | ------ | ----------- |
| `DeviceErrorCode` | `DEVICE_NOT_LINKED` | É preciso vincular um número ao dispositivo. |
| | `DEVICE_RESTARTING` | O dispositivo está reiniciando. |
| | `DEVICE_ERROR` | O dispositivo está em estado de erro ou desabilitado. |
| | `DEVICE_NOT_FOUND` | O token não corresponde a nenhum dispositivo. |
| | `WAKE_UP_RATE_LIMITED` | Pedidos de wake-up demais em sequência. |
| | `NO_DEVICES` | Nenhum dispositivo disponível para a operação. |
| `CommandErrorCode` | `ACK_TIMEOUT` | O servidor não confirmou o comando em 10s. |
| | `CALL_ALREADY_ANSWERED` | O outro lado atendeu entre o clique e a confirmação. |
| | `CALL_NOT_FOUND` | O servidor não conhece essa chamada. |
| | `DEVICE_BUSY` | O dispositivo já está em outra chamada. |
| | `NETWORK_ERROR` | O pedido não chegou ao servidor: rede, DNS ou TLS. |
| `MediaErrorCode` | `MICROPHONE_PERMISSION_DENIED` | O usuário negou o microfone. |
| | `AUDIO_DEVICE_NOT_FOUND` | O aparelho de áudio pedido não existe. |
| | `OUTPUT_SELECTION_UNSUPPORTED` | O navegador não permite escolher a saída. |
| | `VOLUME_OUT_OF_RANGE` | Volume fora da faixa; a faixa vem em `details`. |
| | `MEDIA_NEGOTIATION_FAILED` | A negociação de mídia falhou; a exceção original vem em `cause`. |
| | `UNSUPPORTED_MEDIA_PLAN` | O servidor propôs um transporte que a biblioteca não fala. |
| `CallFailureCode` | `LOCAL_AUDIO_TIMEOUT` | O seu microfone parou de enviar áudio. |
| | `REMOTE_AUDIO_TIMEOUT` | O contato parou de enviar áudio. |
| | `CONNECTION_TIMEOUT` | A chamada perdeu contato com o servidor. |
| | `ENCRYPTION_FAILED` | Não foi possível estabelecer a chamada com segurança. |
| | `ACCOUNT_RESTRICTED` | A conta do WhatsApp está restrita e não pode chamar. |
| | `NO_CALL_PERMISSION` | A conta não tem permissão para chamar. |
| | `SERVER_ERROR` | Algo deu errado do lado do servidor. |
| — | `UNKNOWN` | Motivo que esta versão da biblioteca ainda não conhece. O valor bruto vai no `cause`. |

{% hint style="info" %}
`LOCAL_AUDIO_TIMEOUT` e `REMOTE_AUDIO_TIMEOUT` substituem os antigos `PEER_TX_TIMEOUT` e `PEER_RX_TIMEOUT`. Os nomes `TX` e `RX` eram do ponto de vista do motor de VoIP do servidor, e a v2 os documentava invertidos.
{% endhint %}

---

## Aparelhos de áudio

```typescript
type AudioDevice = {
    id: string                       // identificador da plataforma
    label: string                    // vazio antes da permissão de microfone
    kind: "input" | "output"
}

interface AudioControl {
    listInputDevices(): AudioDevice[]
    listOutputDevices(): AudioDevice[]
    readonly currentInput: AudioDevice | null
    readonly currentOutput: AudioDevice | null
}
```

Veja [Mídia](media.md) para o uso.

---

## Áudio da chamada

`call.audio` entrega um analisador por direção. Hoje eles medem o nível; a análise que vier
depois (forma de onda, espectro) entra no mesmo objeto e vale para as duas direções.

```typescript
type AudioAnalyser = {
    level(): number    // 0 a 1, síncrono
}

type CallAudio = {
    in:  AudioAnalyser    // o que chega do outro lado
    out: AudioAnalyser    // o que sai do microfone
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
