// Dois portões sobre o `.d.ts` publicado, que é o que o integrador realmente lê.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DTS = "dist/index.d.ts";

// 1. Sem DOM. Quem instala a biblioteca no React Native não tem `lib: dom` no tsconfig,
//    então um `AnalyserNode` ou um `MediaDeviceInfo` na superfície quebra o build dele, e
//    não o nosso (DEV-277).
try {
    execFileSync(
        "node_modules/.bin/tsc",
        ["--noEmit", "--strict", "--lib", "ES2022", "--typeRoots", "/dev/null", DTS],
        {
            stdio: "pipe",
        },
    );
} catch (error) {
    console.error(`A superfície pública cita tipo que só existe no navegador (${DTS}):\n`);
    console.error(error.stdout?.toString() ?? error.message);
    process.exit(1);
}

// 2. Em inglês. O JSDoc daqui aparece no autocomplete de quem instala o pacote, e a língua
//    dele é decisão de produto (DEV-453) — comentário interno em português fica no `.ts`.
const ACCENTS = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/;
const STOPWORDS =
    /\b(que|não|para|com|uma|pelo|pela|só|mas|dos|das|quando|porque|sem|entre|cada|já|aqui|vem|vai|fica|onde|quem|ele|ela|isso|mora|sai)\b/gi;

const offenders = readFileSync(DTS, "utf8")
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => /^\s*(\/\*|\*|\/\/)/.test(line))
    .filter(({ line }) => ACCENTS.test(line) || new Set(line.match(STOPWORDS) ?? []).size >= 2);

if (offenders.length) {
    console.error(`Comentário em português na superfície pública (${DTS}):\n`);
    for (const { line, number } of offenders) console.error(`  ${number}: ${line.trim()}`);
    console.error("\nJSDoc que sai no .d.ts é documentação de produto e fica em inglês; o porquê vai num // no .ts.");
    process.exit(1);
}
