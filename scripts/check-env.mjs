// As env que o bundle inlina. Faltando uma, o build para aqui: uma cópia publicada
// apontando para o ambiente errado só se descobre em produção.
import { loadEnv } from "vite";

const REQUIRED = ["VITE_WAVOIP_DEVICES_URL", "VITE_WAVOIP_API_URL"];

const mode = process.env.NODE_ENV ?? "production";
const env = loadEnv(mode, process.cwd(), "VITE_");

const missing = REQUIRED.filter((name) => !env[name]);
if (missing.length) {
    const hint = "Copie o .env.example para .env.local e preencha, ou exporte-as no ambiente.";
    console.error(`Faltam variáveis de ambiente para o build (${mode}): ${missing.join(", ")}.\n${hint}`);
    process.exit(1);
}
