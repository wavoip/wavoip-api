export type { AudioDevice } from "@/domain/audio/device";
export type { AudioAnalyser, CallAudio } from "@/domain/call/audio";
export type { AudioControl } from "@/domain/audio/control";
export type { CallConnection } from "@/domain/call/connection";
export type { CallDirection, CallStatus, CallType } from "@/domain/call/types";
export { Result } from "@/domain/shared/Result";
export type { DeviceWakeUp } from "@/Wavoip";
export type {
    AcceptFailure,
    CallFailureCode,
    CommandFailure,
    CommandErrorCode,
    DeviceApiFailure,
    DeviceAttempt,
    DeviceErrorCode,
    ErrorCode,
    MediaErrorCode,
    StartCallErrorCode,
    StartCallFailure,
    WavoipError,
} from "@/domain/shared/errors";
export type { CallStats, ServerCallStats } from "@/domain/call/stats";
export type { ActiveCall, ActiveCallEvents } from "@/modules/call/ActiveCall";
export type { OutgoingCall, OutgoingCallEvents, OutgoingCallFailure } from "@/modules/call/OutgoingCall";
export type { IncomingCall, IncomingCallEvents } from "@/modules/call/IncomingCall";
export type { CallPeer } from "@/modules/call/Peer";

export type {
    ConnectionStatus,
    Contact,
    Device,
    DeviceEvents,
    DeviceRestriction,
    DeviceStatus,
} from "@/domain/device/Device";

export type { TransportStatus } from "@/modules/media/ITransport";
export type { IceServer } from "@/ports/runtime/PeerConnectionPort";
export type {
    ConnectivityIssue,
    IceCandidateKind,
    IceConfig,
    IceDiagnostics,
} from "@/modules/media/ICEDiagnostics";
export type { Unsubscribe } from "@/modules/shared/EventEmitter";

export { runDiagnostics, type DiagnosticsOptions } from "@/application/diagnostics/runDiagnostics";
export type { Readiness } from "@/domain/diagnostics/readiness";
export type {
    DiagnosticCheck,
    DiagnosticCode,
    DiagnosticSeverity,
    DiagnosticsReport,
} from "@/domain/diagnostics/types";
export { Wavoip } from "@/Wavoip";
export type { WavoipRuntime } from "@/ports/WavoipRuntime";
