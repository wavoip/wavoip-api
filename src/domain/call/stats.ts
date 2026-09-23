/**
 * `null` quer dizer "não medido nesta plataforma ou neste tipo de chamada", e não zero:
 * um zero mentiria dizendo que a latência é nula.
 */
export type CallStats = {
    /** RTT da perna cliente ⇔ servidor, acumulado ao longo da chamada. */
    rtt: {
        min: number;
        max: number;
        avg: number;
    };
    latency: {
        /** A soma do que foi medido; é uma estimativa de ponta a ponta, não uma medida. */
        total_ms: number | null;
        /** Metade do RTT mais recente da perna cliente ⇔ servidor. */
        network_ms: number | null;
        /** Metade do RTT da perna servidor ⇔ WhatsApp, que só o servidor mede. */
        whatsapp_ms: number | null;
        /** O áudio que já chegou e espera a vez de tocar. */
        jitter_buffer_ms: number | null;
        /** Do motor de áudio até sair no aparelho. */
        playout_ms: number | null;
    };
    audio: {
        tx: { level: number; bitrate_kbps: number };
        rx: { level: number; bitrate_kbps: number; jitter_ms: number };
    };
    packets: {
        tx: { sent: number; lost: number; bytes: number };
        rx: { received: number; lost: number; bytes: number };
    };
};

function empty(): CallStats {
    return {
        rtt: { min: 0, max: 0, avg: 0 },
        latency: { total_ms: null, network_ms: null, whatsapp_ms: null, jitter_buffer_ms: null, playout_ms: null },
        audio: { tx: { level: 0, bitrate_kbps: 0 }, rx: { level: 0, bitrate_kbps: 0, jitter_ms: 0 } },
        packets: { tx: { sent: 0, lost: 0, bytes: 0 }, rx: { received: 0, lost: 0, bytes: 0 } },
    };
}

/** A soma das partes medidas; `null` quando nenhuma delas foi. */
function totalOf(latency: CallStats["latency"]): number | null {
    const parts = [latency.network_ms, latency.whatsapp_ms, latency.jitter_buffer_ms, latency.playout_ms];
    const measured = parts.filter((part): part is number => part !== null);
    if (!measured.length) return null;
    return measured.reduce((sum, part) => sum + part, 0);
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
 * O que o servidor conta da chamada UNOFFICIAL. O RTT da perna do cliente é o mesmo que o
 * indicador de ping da barra de status mostra; o da perna do WhatsApp só existe aqui.
 */
function fromServer(s: ServerCallStats): CallStats {
    const stats = empty();
    stats.rtt = { ...s.rtt.client };
    stats.latency.network_ms = s.rtt.client.avg / 2;
    stats.latency.whatsapp_ms = s.rtt.whatsapp.avg / 2;
    stats.packets = {
        tx: { sent: s.tx.total, lost: s.tx.loss, bytes: s.tx.total_bytes },
        rx: { received: s.rx.total, lost: s.rx.loss, bytes: s.rx.total_bytes },
    };
    stats.latency.total_ms = totalOf(stats.latency);
    return stats;
}

/**
 * Chamada OFFICIAL usa só as stats do WebRTC. Na UNOFFICIAL nenhum dos lados tem o
 * quadro inteiro: RTT, perda e totais vêm do `call:stats` do servidor, e bitrate, nível de
 * áudio, jitter e as latências locais só o cliente mede.
 */
function mergeUnofficial(server: CallStats | null, transport: CallStats | null): CallStats {
    const base = server ?? empty();
    if (!transport) return base;

    const latency = {
        ...base.latency,
        jitter_buffer_ms: transport.latency.jitter_buffer_ms,
        playout_ms: transport.latency.playout_ms,
    };
    return {
        rtt: base.rtt,
        latency: { ...latency, total_ms: totalOf(latency) },
        audio: transport.audio,
        packets: base.packets,
    };
}

export const Stats = { empty, fromServer, mergeUnofficial, totalOf };
