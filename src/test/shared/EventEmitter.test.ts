import { EventEmitter } from "@/modules/shared/EventEmitter";
import { describe, expect, it, vi } from "vitest";

type TestEvents = {
    data: [value: number];
    message: [text: string];
    empty: [];
};

describe("EventEmitter", () => {
    it("on + emit: fires callback with correct args", () => {
        const emitter = new EventEmitter<TestEvents>();
        const cb = vi.fn();
        emitter.on("data", cb);
        emitter.emit("data", 42);
        expect(cb).toHaveBeenCalledOnce();
        expect(cb).toHaveBeenCalledWith(42);
    });

    it("multiple listeners on same event all fire", () => {
        const emitter = new EventEmitter<TestEvents>();
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        emitter.on("data", cb1);
        emitter.on("data", cb2);
        emitter.emit("data", 1);
        expect(cb1).toHaveBeenCalledOnce();
        expect(cb2).toHaveBeenCalledOnce();
    });

    it("on returns unsubscribe function that stops further delivery", () => {
        const emitter = new EventEmitter<TestEvents>();
        const cb = vi.fn();
        const unsub = emitter.on("data", cb);
        emitter.emit("data", 1);
        unsub();
        emitter.emit("data", 2);
        expect(cb).toHaveBeenCalledOnce();
    });

    it("off removes a specific listener", () => {
        const emitter = new EventEmitter<TestEvents>();
        const cb = vi.fn();
        emitter.on("data", cb);
        emitter.off("data", cb);
        emitter.emit("data", 1);
        expect(cb).not.toHaveBeenCalled();
    });

    it("off leaves other listeners intact", () => {
        const emitter = new EventEmitter<TestEvents>();
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        emitter.on("data", cb1);
        emitter.on("data", cb2);
        emitter.off("data", cb1);
        emitter.emit("data", 1);
        expect(cb1).not.toHaveBeenCalled();
        expect(cb2).toHaveBeenCalledOnce();
    });

    it("removeAllListeners() clears all events", () => {
        const emitter = new EventEmitter<TestEvents>();
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        emitter.on("data", cb1);
        emitter.on("message", cb2);
        emitter.removeAllListeners();
        emitter.emit("data", 1);
        emitter.emit("message", "hi");
        expect(cb1).not.toHaveBeenCalled();
        expect(cb2).not.toHaveBeenCalled();
    });

    it("removeAllListeners(event) clears only that event", () => {
        const emitter = new EventEmitter<TestEvents>();
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        emitter.on("data", cb1);
        emitter.on("message", cb2);
        emitter.removeAllListeners("data");
        emitter.emit("data", 1);
        emitter.emit("message", "hi");
        expect(cb1).not.toHaveBeenCalled();
        expect(cb2).toHaveBeenCalledOnce();
    });

    it("emitting with no listeners is a no-op", () => {
        const emitter = new EventEmitter<TestEvents>();
        expect(() => emitter.emit("data", 1)).not.toThrow();
    });

    it("empty event fires callback with no args", () => {
        const emitter = new EventEmitter<TestEvents>();
        const cb = vi.fn();
        emitter.on("empty", cb);
        emitter.emit("empty");
        expect(cb).toHaveBeenCalledOnce();
        expect(cb).toHaveBeenCalledWith();
    });
});
