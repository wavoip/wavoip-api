// `setTimeout` e `clearTimeout` existem em todo runtime de JavaScript — navegador, React
// Native, Node —, mas o tipo deles vem do `lib.dom` ou do `@types/node`, e o portão sem
// plataforma não carrega nenhum dos dois.
//
// Este arquivo mora fora de `src/` de propósito: o `tsconfig.json` inclui só `src`, então
// quem o enxerga é apenas o `tsconfig.core.json`, e não há declaração duplicada no build.

declare function setTimeout(handler: () => void, timeoutMs?: number): number;
declare function clearTimeout(handle: number): void;
