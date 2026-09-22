/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** API e socket de cada device. Padrão: https://devices.wavoip.com */
    readonly VITE_WAVOIP_DEVICES_URL?: string;
    /** API central da conta. Padrão: https://api.wavoip.com */
    readonly VITE_WAVOIP_API_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
