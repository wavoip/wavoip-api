/**
 * De onde a biblioteca fala com a Wavoip. Vêm de env do Vite, com o padrão de produção
 * embutido: o integrador que constrói a própria cópia aponta para outro ambiente sem
 * tocar no código, e quem instala do npm não precisa configurar nada.
 *
 * `devices` é a API e o socket de cada device; `api` é a API central da conta, que resolve
 * o que o device sozinho não resolve — acordar um hibernado, por exemplo.
 */
const DEFAULT_DEVICES_URL = "https://devices.wavoip.com";
const DEFAULT_API_URL = "https://api.wavoip.com";

export const Endpoints = {
    devices: import.meta.env?.VITE_WAVOIP_DEVICES_URL ?? DEFAULT_DEVICES_URL,
    api: import.meta.env?.VITE_WAVOIP_API_URL ?? DEFAULT_API_URL,
};
