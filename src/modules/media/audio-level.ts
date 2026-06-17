/**
 * RMS amplitude (0..1) of an Int16 PCM frame. Used by `WebsocketTransport` to
 * expose `stats.tx.audio_level` / `stats.rx.audio_level` straight from the PCM
 * buffers crossing the transport — avoids the AnalyserNode path that reads
 * zero when the input graph has no connection to `audioContext.destination`.
 *
 * Example:
 *   const lvl = rmsInt16(int16Pcm160ByteFrame); // 0..1
 */
export function rmsInt16(buf: ArrayBuffer): number {
    const samples = new Int16Array(buf);
    if (samples.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
        const s = samples[i] / 32768;
        sum += s * s;
    }
    return Math.sqrt(sum / samples.length);
}
