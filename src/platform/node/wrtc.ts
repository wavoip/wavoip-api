import wrtc from "@roamhq/wrtc";

/**
 * O `@roamhq/wrtc` é CommonJS, e o `nonstandard` não aparece como named export para o
 * detector do Node: `import { nonstandard } from "@roamhq/wrtc"` compila e quebra na hora
 * de importar, com `SyntaxError: Named export 'nonstandard' not found`.
 *
 * Então o pacote é lido pelo default, que é o `module.exports` inteiro, e desmontado aqui —
 * num lugar só, para os outros arquivos importarem como se fosse normal.
 */
export const { MediaStream, RTCPeerConnection, nonstandard } = wrtc;
export type RTCAudioData = wrtc.nonstandard.RTCAudioData;
export type RTCAudioSource = wrtc.nonstandard.RTCAudioSource;
