// Minimal AudioWorklet global scope type declarations for TypeScript versions
// that do not include a built-in audioworklet lib.

declare const sampleRate: number;
declare const currentTime: number;
declare const currentFrame: number;

declare function registerProcessor(
    name: string,
    processorCtor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;

declare interface AudioWorkletProcessor {
    readonly port: MessagePort;
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

declare const AudioWorkletProcessor: {
    prototype: AudioWorkletProcessor;
    new (options?: AudioWorkletNodeOptions): AudioWorkletProcessor;
};

declare interface AudioWorkletNodeOptions {
    numberOfInputs?: number;
    numberOfOutputs?: number;
    outputChannelCount?: number[];
    parameterData?: Record<string, number>;
    processorOptions?: unknown;
    channelCount?: number;
    channelCountMode?: ChannelCountMode;
    channelInterpretation?: ChannelInterpretation;
}
