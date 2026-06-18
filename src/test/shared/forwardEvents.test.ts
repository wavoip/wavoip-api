import { EventEmitter } from "@/modules/shared/EventEmitter";
import { forwardEvents } from "@/modules/shared/forwardEvents";
import { describe, expect, it, vi } from "vitest";

type SourceEvents = {
    ping: [n: number];
    note: [text: string];
    muted: [m: boolean];
    unused: [];
};

type DestEvents = {
    pong: [n: number];
    label: [text: string];
    peerMute: [state: "on" | "off"];
};

describe("forwardEvents", () => {
    it("forwards a source event 1:1 to a destination event with same payload", () => {
        const src = new EventEmitter<SourceEvents>();
        const dst = new EventEmitter<DestEvents>();
        const cb = vi.fn();
        dst.on("pong", cb);

        forwardEvents(src, dst, { ping: "pong" });
        src.emit("ping", 7);

        expect(cb).toHaveBeenCalledWith(7);
    });

    it("supports a map function that rewrites payload shape", () => {
        const src = new EventEmitter<SourceEvents>();
        const dst = new EventEmitter<DestEvents>();
        const cb = vi.fn();
        dst.on("peerMute", cb);

        forwardEvents(src, dst, {
            muted: { to: "peerMute", map: (m): ["on" | "off"] => [m ? "on" : "off"] },
        });
        src.emit("muted", true);
        src.emit("muted", false);

        expect(cb).toHaveBeenNthCalledWith(1, "on");
        expect(cb).toHaveBeenNthCalledWith(2, "off");
    });

    it("does not subscribe to source events absent from the mapping", () => {
        const src = new EventEmitter<SourceEvents>();
        const dst = new EventEmitter<DestEvents>();
        const cb = vi.fn();
        dst.on("label", cb);

        forwardEvents(src, dst, { ping: "pong" });
        src.emit("note", "hello");

        expect(cb).not.toHaveBeenCalled();
    });

    it("returned Unsubscribe detaches every forwarded listener", () => {
        const src = new EventEmitter<SourceEvents>();
        const dst = new EventEmitter<DestEvents>();
        const cb = vi.fn();
        dst.on("pong", cb);

        const unsub = forwardEvents(src, dst, { ping: "pong" });
        unsub();
        src.emit("ping", 1);

        expect(cb).not.toHaveBeenCalled();
    });

    it("multiple mappings forward independently", () => {
        const src = new EventEmitter<SourceEvents>();
        const dst = new EventEmitter<DestEvents>();
        const pongCb = vi.fn();
        const labelCb = vi.fn();
        dst.on("pong", pongCb);
        dst.on("label", labelCb);

        forwardEvents(src, dst, { ping: "pong", note: "label" });
        src.emit("ping", 9);
        src.emit("note", "hi");

        expect(pongCb).toHaveBeenCalledWith(9);
        expect(labelCb).toHaveBeenCalledWith("hi");
    });
});
