// Os globais que o portão sem plataforma declara, e por que cada um está aqui.
//
// A régua é uma só: entra o que existe **nos três ambientes** — navegador, React Native e
// Node —, porque aí o núcleo pode usá-lo sem escolher plataforma. `AudioContext`,
// `MessageEvent` ou `navigator` nunca entram: quem precisa deles mora em `src/platform/`.
//
// O tipo deles vem do `lib.dom` ou do `@types/node`, e o portão não carrega nenhum dos dois.
// Este arquivo mora fora de `src/` de propósito: o `tsconfig.json` inclui só `src`, então
// quem o enxerga é apenas o `tsconfig.core.json`, e não há declaração duplicada no build.

declare function setTimeout(handler: () => void, timeoutMs?: number): number;
declare function clearTimeout(handle: number): void;
declare function setInterval(handler: () => void, intervalMs?: number): number;
declare function clearInterval(handle: number): void;

/** `performance.now()` é padrão nos três; só o `now` é usado. */
declare const performance: { now(): number };

// `fetch` é nativo no navegador, no React Native e no Node desde a 18. Declarado só na
// fatia que a biblioteca usa — o que ela não chama não precisa de tipo, e assim uma
// dependência nova aparece como erro em vez de passar de graça.
declare function fetch(url: string, init?: { method?: string; headers?: Record<string, string> }): Promise<Response>;

declare interface Response {
    readonly ok: boolean;
    readonly status: number;
    json(): Promise<unknown>;
    text(): Promise<string>;
}

// O Vite troca `import.meta.env.X` por literal na build, então no `dist` isto não existe
// mais. O tipo é declarado aqui porque `src/config/config.ts` o lê, e o portão compila a
// `src` — é também o aviso de que consumir a `src` direto (Metro, `tsx`) não funciona sem
// alguém fazer essa troca.
interface ImportMeta {
    readonly env: Record<string, string>;
}
