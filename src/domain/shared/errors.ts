/**
 * Every error the library reports, grouped by where it comes from. The `code` is the
 * contract: it is stable, it is what you branch on, and it is what you translate.
 *
 * Protocol codes — from the device, from WhatsApp, from the Wavoip API — are translated at
 * the library's edge and never reach you. Anything without a translation arrives as
 * `UNKNOWN`, carrying the raw value in `cause`.
 */

/** The device cannot take the request, or was not found. */
export type DeviceErrorCode =
    /** No phone number is linked to the device yet. */
    | "DEVICE_NOT_LINKED"
    /** The device is restarting. */
    | "DEVICE_RESTARTING"
    /** The device is in an error state, or disabled. */
    | "DEVICE_ERROR"
    /** No device matches the token. */
    | "DEVICE_NOT_FOUND"
    /** Too many wake-up requests in a row. */
    | "WAKE_UP_RATE_LIMITED"
    /** No device is available for the operation. */
    | "NO_DEVICES";

/** The command went out, but the server did not take it — or never answered. */
export type CommandErrorCode =
    /** The server did not confirm the command within ten seconds. */
    | "ACK_TIMEOUT"
    /** The peer answered between the click and the confirmation. */
    | "CALL_ALREADY_ANSWERED"
    /** The server does not know this call. */
    | "CALL_NOT_FOUND"
    /** The device is already on another call. */
    | "DEVICE_BUSY"
    /** The request never reached the server: network, DNS or TLS. */
    | "NETWORK_ERROR";

/** Local audio: permission, devices and media negotiation. */
export type MediaErrorCode =
    /** The user denied the microphone. */
    | "MICROPHONE_PERMISSION_DENIED"
    /** The requested audio device does not exist. */
    | "AUDIO_DEVICE_NOT_FOUND"
    /** This platform cannot choose where audio plays. */
    | "OUTPUT_SELECTION_UNSUPPORTED"
    /** This platform cannot choose which microphone is used: the system decides. */
    | "INPUT_SELECTION_UNSUPPORTED"
    /** Volume outside the accepted range; `details` carries it. */
    | "VOLUME_OUT_OF_RANGE"
    /** Media negotiation failed; the original exception is in `cause`. */
    | "MEDIA_NEGOTIATION_FAILED"
    /** The server offered a transport this library does not speak. */
    | "UNSUPPORTED_MEDIA_PLAN"
    /** This platform cannot carry a call of that type: the runtime says so up front. */
    | "CALL_TYPE_UNSUPPORTED";

/** Why a call that was up came down. */
export type CallFailureCode =
    /** Your microphone stopped sending audio. */
    | "LOCAL_AUDIO_TIMEOUT"
    /** The contact stopped sending audio. */
    | "REMOTE_AUDIO_TIMEOUT"
    /** The call lost contact with the server. */
    | "CONNECTION_TIMEOUT"
    /** The call could not be secured. */
    | "ENCRYPTION_FAILED"
    /** The WhatsApp account is restricted and cannot place calls. */
    | "ACCOUNT_RESTRICTED"
    /** The account is not allowed to place calls. */
    | "NO_CALL_PERMISSION"
    /** Something went wrong on the server side. */
    | "SERVER_ERROR";

/**
 * `UNKNOWN` is a reason this version of the library does not know yet. Use it for logs and
 * for filing an issue, never to branch on: whatever shows up often becomes a code here.
 */
export type ErrorCode = DeviceErrorCode | CommandErrorCode | MediaErrorCode | CallFailureCode | "UNKNOWN";

export type WavoipError<C extends ErrorCode = ErrorCode> = {
    readonly code: C;
    /** Values your message needs, such as `{ min, max }`. */
    readonly details?: Record<string, unknown>;
    /** The raw protocol or platform value, for diagnostics only. */
    readonly cause?: unknown;
};

/** A command that waits for an ack either times out or is refused. */
export type CommandFailure = WavoipError<CommandErrorCode | "UNKNOWN">;

/** Answering adds local media to that, which comes up before the command goes out. */
export type AcceptFailure = WavoipError<
    CommandErrorCode | "MEDIA_NEGOTIATION_FAILED" | "CALL_TYPE_UNSUPPORTED" | "UNKNOWN"
>;

/** A failure from one of the device's HTTP routes. */
export type DeviceApiFailure = WavoipError<DeviceErrorCode | "NETWORK_ERROR" | "UNKNOWN">;

/** Placing a call goes through the device, through local media and through the command. */
export type StartCallErrorCode =
    | DeviceErrorCode
    | CommandErrorCode
    | "MEDIA_NEGOTIATION_FAILED"
    | "CALL_TYPE_UNSUPPORTED"
    | "UNKNOWN";

/** Why one device could not place the call. */
export type DeviceAttempt = { readonly token: string; readonly error: WavoipError<StartCallErrorCode> };

/**
 * The failure of `wavoip.startCall`, which tries one device at a time. The `code` is the
 * first device that failed — with a single device, that device's own code — and `devices`
 * lists every attempt, in the order they were made.
 */
export type StartCallFailure = WavoipError<StartCallErrorCode> & { readonly devices: readonly DeviceAttempt[] };
