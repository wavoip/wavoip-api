declare module "*?worklet" {
    /** O código do worklet, não a URL: quem carrega decide quando criar a Blob URL. */
    const source: string;
    export default source;
}
