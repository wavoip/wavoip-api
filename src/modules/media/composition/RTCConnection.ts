import {
    type ConnectivityIssue,
    DEFAULT_ICE_GATHERING_TIMEOUT_MS,
    DEFAULT_ICE_SERVERS,
    type IceCandidateKind,
    type IceConfig,
    type IceDiagnostics,
} from "@/modules/media/ICEDiagnostics";
import type { TransportStatus } from "@/modules/media/ITransport";
import { EventEmitter } from "@/modules/shared/EventEmitter";
import type { IRTCConnection, RTCConnectionEvents } from "./Connection";

const SYMMETRIC_NAT_DETECTION_WINDOW_MS = 10_000;

/**
 * WebRTC connection role — owns the RTCPeerConnection, the SDP handshake, the
 * ICE gathering loop, and the connection-state → TransportStatus mapping. Has
 * no concept of mic tracks, speakers, or stats absorption: callers attach
 * senders via `pc.addTrack` before `start()`; stats are observed by a separate
 * `RTCStatsAdapter`; the remote track lands in an `IAudioPipe`.
 *
 * Lifecycle:
 *   - `createOffer()` is for the OUTGOING (no-remote-offer) flow.
 *   - `start()` is for the INCOMING (remote-offer pre-supplied) flow — it
 *     drives setRemoteDescription / createAnswer / ICE gather / answer resolve.
 *   - `setAnswer(sdp)` completes the OUTGOING flow once the peer responds.
 *   - `stop()` closes pc and cancels the symmetric-NAT detection timer.
 *
 * ICE diagnostics fire after the first ICE gathering pass (whichever of
 * `start` / `createOffer` runs first). `connectivityIssue` is deduplicated per
 * issue kind via `_emittedConnectivityIssues`.
 */
export class RTCConnection extends EventEmitter<RTCConnectionEvents> implements IRTCConnection {
    readonly kind = "webrtc" as const;
    status: TransportStatus = "disconnected";
    readonly pc: RTCPeerConnection;
    readonly answer: Promise<RTCSessionDescriptionInit>;
    lastDiagnostics: IceDiagnostics | null = null;

    private readonly answerResolver: PromiseWithResolvers<RTCSessionDescriptionInit>;
    private readonly remoteOffer?: RTCSessionDescriptionInit;
    private started = false;
    private offerCreated = false;
    private stopped = false;

    private readonly gatheringTimeoutMs: number;
    private gatheringStartedAt = 0;
    private candidatesByType: Record<IceCandidateKind, number> = {
        host: 0,
        srflx: 0,
        prflx: 0,
        relay: 0,
    };
    private symmetricNatTimer: ReturnType<typeof setTimeout> | null = null;
    private _emittedConnectivityIssues = new Set<ConnectivityIssue>();

    get emittedConnectivityIssues(): ReadonlySet<ConnectivityIssue> {
        return this._emittedConnectivityIssues;
    }

    constructor(offer?: string, iceConfig?: IceConfig) {
        super();

        this.gatheringTimeoutMs = iceConfig?.gatheringTimeoutMs ?? DEFAULT_ICE_GATHERING_TIMEOUT_MS;
        const iceServers = iceConfig?.iceServers ?? DEFAULT_ICE_SERVERS;

        this.pc = new RTCPeerConnection({ iceServers });
        if (offer) this.remoteOffer = { type: "offer", sdp: offer };

        this.answerResolver = Promise.withResolvers<RTCSessionDescriptionInit>();
        this.answer = this.answerResolver.promise;

        this.pc.onicecandidate = (event) => {
            const candidate = event.candidate;
            if (!candidate) return;
            const kind = candidate.type as IceCandidateKind | undefined;
            if (kind && kind in this.candidatesByType) this.candidatesByType[kind] += 1;
        };

        this.pc.oniceconnectionstatechange = () => {
            if (this.pc.iceConnectionState === "failed") {
                this.emitIssue("ICE_CONNECTION_FAILED");
            }
            if (this.pc.iceConnectionState === "connected" || this.pc.iceConnectionState === "completed") {
                if (this.symmetricNatTimer) clearTimeout(this.symmetricNatTimer);
            }
        };

        this.pc.onconnectionstatechange = () => {
            if (this.pc.connectionState === "connecting") this.setStatus("connecting");
            if (this.pc.connectionState === "disconnected" || this.pc.connectionState === "closed") {
                this.setStatus("disconnected");
            }
            if (this.pc.connectionState === "connected") this.setStatus("connected");
        };
    }

    /**
     * INCOMING flow: complete the SDP handshake using the offer supplied to the
     * constructor. No-op for OUTGOING calls (where `createOffer` drives the
     * handshake instead).
     */
    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;

        if (!this.remoteOffer) return;

        await this.pc.setRemoteDescription(this.remoteOffer);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        await this.waitForIceGathering();

        this.answerResolver.resolve(this.pc.localDescription as RTCSessionDescription);
    }

    async createOffer(): Promise<string> {
        if (this.offerCreated) return this.pc.localDescription?.sdp as string;
        this.offerCreated = true;

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);

        await this.waitForIceGathering();

        return this.pc.localDescription?.sdp as string;
    }

    async setAnswer(sdp: string): Promise<void> {
        await this.pc.setRemoteDescription({ type: "answer", sdp });
    }

    async stop(): Promise<void> {
        if (this.stopped) return;
        this.stopped = true;

        if (this.symmetricNatTimer) clearTimeout(this.symmetricNatTimer);
        this.pc.close();
    }

    private async waitForIceGathering(): Promise<void> {
        this.gatheringStartedAt = Date.now();

        const timedOut = await this.raceGatheringWithTimeout();

        const duration = Date.now() - this.gatheringStartedAt;
        const stunReached = this.candidatesByType.srflx > 0;
        const turnReached = this.candidatesByType.relay > 0;

        const diag: IceDiagnostics = {
            gatheringDurationMs: duration,
            gatheringTimedOut: timedOut,
            candidatesByType: { ...this.candidatesByType },
            stunReached,
            turnReached,
        };
        this.lastDiagnostics = diag;
        this.emit("iceDiagnostics", diag);

        if (timedOut) this.emitIssue("ICE_GATHERING_TIMEOUT");
        if (timedOut && !stunReached) this.emitIssue("STUN_UNREACHABLE");
        if (this.candidatesByType.host === 0) this.emitIssue("NO_HOST_CANDIDATES");

        this.scheduleSymmetricNatCheck(stunReached);
    }

    private raceGatheringWithTimeout(): Promise<boolean> {
        if (this.pc.iceGatheringState === "complete") return Promise.resolve(false);

        return new Promise<boolean>((resolve) => {
            const handler = () => {
                if (this.pc.iceGatheringState !== "complete") return;
                this.pc.removeEventListener("icegatheringstatechange", handler);
                clearTimeout(timer);
                resolve(false);
            };

            const timer = setTimeout(() => {
                this.pc.removeEventListener("icegatheringstatechange", handler);
                resolve(true);
            }, this.gatheringTimeoutMs);

            this.pc.addEventListener("icegatheringstatechange", handler);
        });
    }

    private scheduleSymmetricNatCheck(stunReached: boolean): void {
        if (!stunReached) return;
        if (this.symmetricNatTimer) return;
        this.symmetricNatTimer = setTimeout(() => {
            const noConnection =
                this.pc.iceConnectionState !== "connected" && this.pc.iceConnectionState !== "completed";
            if (noConnection) this.emitIssue("SYMMETRIC_NAT_SUSPECTED");
        }, SYMMETRIC_NAT_DETECTION_WINDOW_MS);
    }

    private emitIssue(issue: ConnectivityIssue): void {
        if (this._emittedConnectivityIssues.has(issue)) return;
        this._emittedConnectivityIssues.add(issue);
        this.emit("connectivityIssue", issue);
    }

    private setStatus(status: TransportStatus): void {
        this.status = status;
        this.emit("statusChanged", status);
    }
}
