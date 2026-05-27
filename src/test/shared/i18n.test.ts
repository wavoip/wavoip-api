import { setLanguage, t } from "@/modules/shared/i18n";
import { afterEach, describe, expect, it } from "vitest";

describe("i18n", () => {
    afterEach(() => setLanguage("en"));

    it("returns source key when locale is en", () => {
        setLanguage("en");
        expect(t("Device is restricted")).toBe("Device is restricted");
    });

    it("returns pt-BR translation when locale is pt-BR", () => {
        setLanguage("pt-BR");
        expect(t("Device is restricted")).toBe("Dispositivo está restrito");
        expect(t("Device error")).toBe("Erro no dispositivo");
    });

    it("returns es translation when locale is es", () => {
        setLanguage("es");
        expect(t("Device is restricted")).toBe("El dispositivo está restringido");
        expect(t("Device error")).toBe("Error en el dispositivo");
    });

    it("setLanguage switches between locales", () => {
        setLanguage("pt-BR");
        expect(t("Device is restarting")).toBe("Dispositivo está sendo reiniciado");
        setLanguage("es");
        expect(t("Device is restarting")).toBe("El dispositivo se está reiniciando");
        setLanguage("en");
        expect(t("Device is restarting")).toBe("Device is restarting");
    });
});
