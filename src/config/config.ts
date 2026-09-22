/**
 * Toda env que a biblioteca lê passa por aqui, e o `scripts/check-env.mjs` quebra o build
 * se faltar alguma — sem valor embutido, para um build apontar para o ambiente errado ser
 * impossível em vez de silencioso.
 *
 * `devicesUrl` é a API e o socket de cada device; `apiUrl` é a API central da conta, que
 * resolve o que o device sozinho não resolve — acordar um hibernado, por exemplo.
 */
export const Config = {
    devicesUrl: import.meta.env.VITE_WAVOIP_DEVICES_URL,
    apiUrl: import.meta.env.VITE_WAVOIP_API_URL,
};
