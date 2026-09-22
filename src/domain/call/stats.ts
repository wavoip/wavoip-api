export type CallStats = {
    rtt: {
        min: number;
        max: number;
        avg: number;
    };
    tx: {
        total: number;
        total_bytes: number;
        loss: number;
        bitrate_kbps: number;
        audio_level: number;
    };
    rx: {
        total: number;
        total_bytes: number;
        loss: number;
        bitrate_kbps: number;
        audio_level: number;
        jitter_ms: number;
    };
    audio_context: {
        output_latency_ms: number;
    };
};

function empty(): CallStats {
    return {
        rtt: { min: 0, max: 0, avg: 0 },
        tx: { total: 0, total_bytes: 0, loss: 0, bitrate_kbps: 0, audio_level: 0 },
        rx: { total: 0, total_bytes: 0, loss: 0, bitrate_kbps: 0, audio_level: 0, jitter_ms: 0 },
        audio_context: { output_latency_ms: 0 },
    };
}

export type ServerCallStats = {
    rtt: {
        client: { min: number; max: number; avg: number };
        whatsapp: { min: number; max: number; avg: number };
    };
    tx: {
        total: number;
        total_bytes: number;
        loss: number;
    };
    rx: {
        total: number;
        total_bytes: number;
        loss: number;
    };
};

/**
 * RTT da perna do cliente (device ↔ servidor), o mesmo que o indicador de ping da barra
 * de status mostra. O da perna do WhatsApp continua no `serverStats`.
 */
function fromServer(s: ServerCallStats): CallStats {
    return {
        rtt: { ...s.rtt.client },
        tx: { ...s.tx, bitrate_kbps: 0, audio_level: 0 },
        rx: { ...s.rx, bitrate_kbps: 0, audio_level: 0, jitter_ms: 0 },
        audio_context: { output_latency_ms: 0 },
    };
}

/**
 * Chamada OFFICIAL usa só as stats do WebRTC. Na UNOFFICIAL nenhum dos lados tem o
 * quadro inteiro: RTT, perda e totais vêm do `call:stats` do servidor, e bitrate,
 * nível de áudio, jitter e latência de saída só o cliente mede.
 */
function mergeUnofficial(server: CallStats | null, transport: CallStats | null): CallStats {
    const base = server ?? empty();
    if (!transport) return base;
    return {
        rtt: base.rtt,
        tx: { ...base.tx, bitrate_kbps: transport.tx.bitrate_kbps, audio_level: transport.tx.audio_level },
        rx: {
            ...base.rx,
            bitrate_kbps: transport.rx.bitrate_kbps,
            audio_level: transport.rx.audio_level,
            jitter_ms: transport.rx.jitter_ms,
        },
        audio_context: { ...transport.audio_context },
    };
}

export const Stats = { empty, fromServer, mergeUnofficial };
