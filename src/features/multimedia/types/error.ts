import type { AudioError } from "@/features/multimedia/speaker/types/error";
import type { MicError } from "@/features/multimedia/microphone/types/error";

export type MultimediaError =
    | {
          type: "audio";
          reason: AudioError;
      }
    | {
          type: "microphone";
          reason: MicError;
      };
