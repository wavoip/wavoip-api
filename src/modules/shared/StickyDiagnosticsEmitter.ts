import type { ConnectivityIssue, IceDiagnostics } from "@/modules/media/ICEDiagnostics";
import { EventEmitter, type Unsubscribe } from "@/modules/shared/EventEmitter";

type DiagnosticsEvents = {
    iceDiagnostics: [diag: IceDiagnostics];
    connectivityIssue: [issue: ConnectivityIssue];
};

/**
 * EventEmitter that replays cached `iceDiagnostics` (latest) and
 * `connectivityIssue` (every unique) values to late subscribers, so listeners
 * attached after the events fired still see them. Used by CallBus and every
 * call facade because ICE gathering can complete before a facade exists.
 */
export class StickyDiagnosticsEmitter<
    T extends DiagnosticsEvents & Record<string, unknown[]>,
> extends EventEmitter<T> {
    private lastIceDiagnostics: IceDiagnostics | null = null;
    private emittedIssues = new Set<ConnectivityIssue>();

    emit<K extends keyof T>(event: K, ...args: T[K]): void {
        if (event === "iceDiagnostics") this.lastIceDiagnostics = args[0] as IceDiagnostics;
        if (event === "connectivityIssue") this.emittedIssues.add(args[0] as ConnectivityIssue);
        super.emit(event, ...args);
    }

    on<K extends keyof T>(event: K, callback: (...args: T[K]) => void): Unsubscribe {
        const unsub = super.on(event, callback);
        if (event === "iceDiagnostics" && this.lastIceDiagnostics) {
            (callback as unknown as (d: IceDiagnostics) => void)(this.lastIceDiagnostics);
        }
        if (event === "connectivityIssue") {
            for (const issue of this.emittedIssues) {
                (callback as unknown as (i: ConnectivityIssue) => void)(issue);
            }
        }
        return unsub;
    }
}
