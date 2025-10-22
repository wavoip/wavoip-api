type Listener<TEvents extends EventsDefaultMap, TEvent extends keyof TEvents> = (...args: TEvents[TEvent]) => void;

type EventsDefaultMap = {
    [k: string]: unknown[];
};

export class EventEmitter<TEvents extends EventsDefaultMap> {
    private listeners = new Map<keyof TEvents, Listener<TEvents, keyof TEvents>[]>();

    emit<T extends keyof TEvents>(event: T, ...args: TEvents[T]) {
        const listeners = this.listeners.get(event) || [];
        for (const fn of listeners) {
            fn(...args);
        }
    }

    on<T extends keyof TEvents>(event: T, callback: Listener<TEvents, T>) {
        const listeners = this.listeners.get(event) || [];

        listeners.push(callback as Listener<TEvents, keyof TEvents>);

        this.listeners.set(event, listeners);

        return () => this.off(event, callback);
    }

    off<T extends keyof TEvents>(event: T, callback: Listener<TEvents, T>) {
        const listeners = this.listeners.get(event);
        if (!listeners) return;

        this.listeners.set(
            event,
            listeners.filter((fn) => fn !== callback),
        );
    }

    removeAllListeners<T extends keyof TEvents>(event: T) {
        this.listeners.delete(event);
    }
}
