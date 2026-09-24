/**
 * Um aparelho de áudio como a biblioteca o entrega, sem os campos que só o navegador tem.
 * O `MediaDeviceInfo` do DOM não serve: ele não existe no React Native, e um `.d.ts` que
 * o cite não compila lá (DEV-277).
 */
export type AudioDevice = {
    readonly id: string;
    readonly label: string;
    readonly kind: "input" | "output";
};
