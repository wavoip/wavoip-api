/**
 * O nível sai direto do PCM que cruza o transporte WS, e não de um AnalyserNode, que lê
 * zero quando o grafo não tem caminho até o `audioContext.destination`.
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
