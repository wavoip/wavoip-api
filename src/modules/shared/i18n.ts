import a18nGlobal from "a18n";

export type Language = "en" | "pt-BR" | "es";

export type TranslationKey =
    | "Device error"
    | "A phone number must be linked to the device"
    | "Device is restarting"
    | "Device is restricted";

type LocaleResource = Record<TranslationKey, string>;

const a18n = a18nGlobal.getA18n("wavoip-api");

const ptBR: LocaleResource = {
    "Device error": "Erro no dispositivo",
    "A phone number must be linked to the device": "É preciso vincular um número ao dispositivo",
    "Device is restarting": "Dispositivo está sendo reiniciado",
    "Device is restricted": "Dispositivo está restrito",
};

const es: LocaleResource = {
    "Device error": "Error en el dispositivo",
    "A phone number must be linked to the device": "Es necesario vincular un número al dispositivo",
    "Device is restarting": "El dispositivo se está reiniciando",
    "Device is restricted": "El dispositivo está restringido",
};

a18n.addLocaleResource("pt-BR", ptBR);
a18n.addLocaleResource("es", es);

export const t = (key: TranslationKey): string => a18n(key);

export const setLanguage = (lang: Language): void => a18n.setLocale(lang);

export const getLanguage = (): string => a18n.getLocale();
