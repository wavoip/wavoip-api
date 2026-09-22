export type CallStatus =
    | "RINGING"
    | "CALLING"
    | "NOT_ANSWERED"
    | "ACTIVE"
    // Alguém desistiu antes do atendimento, nós ou o outro lado. Distinto de "ENDED", que
    // é desligar depois de atender.
    | "CANCELLED"
    | "ENDED"
    | "REJECTED"
    | "FAILED"
    | "DISCONNECTED";

export type CallType = "OFFICIAL" | "UNOFFICIAL";

export type CallDirection = "INCOMING" | "OUTGOING";

export type Peer = {
    phone: string;
    displayName: string | null;
    profilePicture: string | null;
};

export type MediaPlanRelay = { type: "relay"; host: string; port: string };
export type MediaPlanWebRTC = { type: "webRTC"; sdp: string };
export type MediaPlanNull = { type: "none" };
export type MediaPlan = MediaPlanRelay | MediaPlanWebRTC | MediaPlanNull;

/**
 * Which ending closed the call, and why. Rides along `call:ended`.
 *
 * `reason` carries the instance's own vocabulary (`client:canceled`,
 * `sip:session-terminated`, …). It is passed through untouched and is not part of
 * any closed set — treat it as a diagnostic string, not a value to branch on.
 */
export type CallEndOutcome = {
    status: CallStatus;
    reason?: string;
};

export type TransportStatus = "disconnected" | "connected" | "connecting" | "reconnecting";
