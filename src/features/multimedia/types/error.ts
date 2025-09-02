import type { AudioError } from "@/features/multimedia/audio/types/error";
import type { MicError } from "@/features/multimedia/microphone/types/error";

export type MultimediaError = {
    type: "audio" | "microphone";
    reason: MicError | AudioError;
};
