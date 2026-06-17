import { type Call, toCallStats } from "@/modules/device/Call";
import type { DeviceSocket, ServerEvents } from "@/modules/device/WebSocket";
import type { Unsubscribe } from "@/modules/shared/EventEmitter";

// socket.io's typed Socket exposes a FallbackToUntypedListener that the
// compiler can't unify with our local generic E. Cast once via `unknown` to
// a narrowly-typed shape so the rest of `bind` stays fully typed.
type SocketLike = {
    on<E extends keyof ServerEvents>(event: E, handler: ServerEvents[E]): unknown;
    off<E extends keyof ServerEvents>(event: E, handler: ServerEvents[E]): unknown;
};

/**
 * Central dispatch for per-call socket events. Subscribes to each `call:*`
 * event once on the shared device socket and routes payloads to the matching
 * Call by id. Auto-unregisters Calls when terminal events arrive so abandoned
 * Calls do not leak.
 *
 * Replaces the per-Call `wireSocket` pattern that left N × 9 filtered
 * listeners on the shared socket.
 *
 * @example
 *   const router = new CallRouter(socket);
 *   router.start();
 *   const unregister = router.register(call);
 *   // ...later, on call disposal:
 *   unregister();
 */
export class CallRouter {
    private readonly calls = new Map<string, Call>();
    private readonly unsubs: Array<() => void> = [];
    private started = false;

    constructor(private readonly socket: DeviceSocket) {}

    start(): void {
        if (this.started) return;
        this.started = true;

        const s = this.socket as unknown as SocketLike;
        const bind = <E extends keyof ServerEvents>(event: E, handler: ServerEvents[E]) => {
            s.on(event, handler);
            this.unsubs.push(() => s.off(event, handler));
        };

        bind("call:ringing", (id) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.emit("ringing");
            call.emit("status", "RINGING");
        });
        bind("call:ended", (id) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.emit("ended");
            call.emit("status", "ENDED");
            this.calls.delete(id);
        });
        bind("call:accepted", (id) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.emit("accepted");
            call.emit("status", "ACTIVE");
        });
        bind("call:answered", (id, mediaPlan) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.emit("answered", mediaPlan);
            call.emit("status", "ACTIVE");
        });
        bind("call:unanswered", (id) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.emit("unanswered");
            call.emit("status", "NOT_ANSWERED");
            this.calls.delete(id);
        });
        bind("call:rejected", (id) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.emit("rejected");
            call.emit("status", "REJECTED");
            this.calls.delete(id);
        });
        bind("call:failed", (id, err) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.emit("failed", err);
            call.emit("status", "FAILED");
            this.calls.delete(id);
        });
        bind("call:stats", (id, stats) => {
            const call = this.calls.get(id);
            if (!call) return;
            call.emit("serverStats", stats);
            call.emit("stats", toCallStats(stats));
        });
        bind("call:peer:muted", (id, muted) => {
            this.calls.get(id)?.emit("peerMuted", muted);
        });
    }

    /**
     * Add a Call to dispatch routing. Returns an Unsubscribe that removes the
     * Call from the routing table. The router additionally auto-removes Calls
     * when their terminal `call:*` event fires, so callers only need to invoke
     * the returned Unsubscribe when disposing a Call mid-flight.
     */
    register(call: Call): Unsubscribe {
        this.calls.set(call.id, call);
        return () => this.calls.delete(call.id);
    }

    has(id: string): boolean {
        return this.calls.has(id);
    }

    stop(): void {
        for (const u of this.unsubs) u();
        this.unsubs.length = 0;
        this.calls.clear();
        this.started = false;
    }
}
