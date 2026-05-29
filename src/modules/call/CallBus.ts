import type { CallStats, ServerCallStats } from "@/modules/call/Stats";
import type { Call, CallStatus } from "@/modules/device/Call";
import type { DeviceSocket, MediaPlan } from "@/modules/device/WebSocket";
import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import type { ITransport, TransportStatus } from "@/modules/media/ITransport";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";

type CallBusEvents = {
    status: [status: CallStatus];
    ringing: [];
    ended: [];
    accepted: [];
    answered: [mediaPlan: MediaPlan];
    rejected: [];
    unanswered: [];
    failed: [error: string];
    connectionStatus: [status: TransportStatus];
    peerMuted: [muted: boolean];
    stats: [stats: CallStats];
    serverStats: [stats: ServerCallStats];
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

/**
 * Internal normalized event bus for a single call.
 * Aggregates raw events from DeviceSocket and ITransport into a single
 * typed stream so facades (Offer, CallOutgoing, CallActive) only depend
 * on this one class instead of wiring socket/transport listeners themselves.
 */
export class CallBus extends EventEmitter<CallBusEvents> {
    private lastIceDiagnostics: IceDiagnostics | null = null;
    private emittedIssues = new Set<ConnectivityIssue>();

    constructor(call: Call, socket: DeviceSocket, transport?: ITransport) {
        super();

        socket.on("call:ringing", (id) => {
            if (id !== call.id) return;
            this.emit("ringing");
            this.emit("status", "RINGING");
        });
        socket.on("call:ended", (id) => {
            if (id !== call.id) return;
            this.emit("ended");
            this.emit("status", "ENDED");
        });
        socket.on("call:accepted", (id) => {
            if (id !== call.id) return;
            this.emit("accepted");
            this.emit("status", "ACTIVE");
        });
        socket.on("call:answered", (id, mediaPlan) => {
            if (id !== call.id) return;
            this.emit("answered", mediaPlan);
            this.emit("status", "ACTIVE");
        });
        socket.on("call:unanswered", (id) => {
            if (id !== call.id) return;
            this.emit("unanswered");
            this.emit("status", "NOT_ANSWERED");
        });
        socket.on("call:rejected", (id) => {
            if (id !== call.id) return;
            this.emit("rejected");
            this.emit("status", "REJECTED");
        });
        socket.on("call:failed", (id, err) => {
            if (id !== call.id) return;
            this.emit("failed", err);
            this.emit("status", "FAILED");
        });
        socket.on("call:stats", (id, stats) => {
            if (id !== call.id) return;
            this.emit("serverStats", stats);
        });

        if (transport) this.wireTransport(transport);
    }

    /**
     * Subscribe to bus events. For `iceDiagnostics` and `connectivityIssue`,
     * the latest cached value(s) are immediately replayed so listeners that
     * attach after the event already fired still receive it. This matters
     * because facades (Offer/Active/Outgoing) are sometimes constructed
     * after the transport has already gathered ICE.
     */
    on<T extends keyof CallBusEvents>(event: T, callback: (...args: CallBusEvents[T]) => void): Unsubscribe {
        const unsub = super.on(event, callback);
        if (event === "iceDiagnostics" && this.lastIceDiagnostics) {
            (callback as (d: IceDiagnostics) => void)(this.lastIceDiagnostics);
        }
        if (event === "connectivityIssue") {
            for (const issue of this.emittedIssues) {
                (callback as (i: ConnectivityIssue) => void)(issue);
            }
        }
        return unsub;
    }

    emit<T extends keyof CallBusEvents>(event: T, ...args: CallBusEvents[T]) {
        if (event === "iceDiagnostics") this.lastIceDiagnostics = args[0] as IceDiagnostics;
        if (event === "connectivityIssue") this.emittedIssues.add(args[0] as ConnectivityIssue);
        super.emit(event, ...args);
    }

    /**
     * Attach a transport after construction (e.g. once a call is accepted
     * and the WebRTC/WebSocket transport is ready). Replays any state the
     * transport gathered before being wired so late listeners catch up.
     */
    wireTransport(transport: ITransport): void {
        transport.on("statusChanged", (s) => {
            this.emit("connectionStatus", s);
            if (s === "disconnected") this.emit("ended");
        });
        transport.on("peerMuted", (m) => this.emit("peerMuted", m));
        transport.on("statsChanged", (s) => this.emit("stats", s));
        transport.on("iceDiagnostics", (d) => this.emit("iceDiagnostics", d));
        transport.on("connectivityIssue", (i) => this.emit("connectivityIssue", i));

        if (transport.lastDiagnostics) this.emit("iceDiagnostics", transport.lastDiagnostics);
        if (transport.emittedIssues) {
            for (const issue of transport.emittedIssues) this.emit("connectivityIssue", issue);
        }
    }
}
