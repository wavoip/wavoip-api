import { FetchDeviceApi } from "@/adapters/http/FetchDeviceApi";
import { afterEach, describe, expect, it, vi } from "vitest";

function answerWith(response: Partial<Response> & { json?: () => Promise<unknown> }) {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}), ...response });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("FetchDeviceApi", () => {
    it("wakes the device up through the central API, by token", async () => {
        const fetchMock = answerWith({});

        expect((await new FetchDeviceApi("device-token").wakeUp()).error).toBeNull();
        expect(fetchMock).toHaveBeenCalledWith("https://api.wavoip.com/v2/devices/device-token/wakeup");
    });

    it.each([
        ["restart", "https://devices.wavoip.com/device-token/device/restart"],
        ["logout", "https://devices.wavoip.com/device-token/whatsapp/logout"],
    ] as const)("%s still talks to the device's own API", async (command, url) => {
        const fetchMock = answerWith({});

        await new FetchDeviceApi("device-token")[command]();

        expect(fetchMock).toHaveBeenCalledWith(url);
    });

    it("reports the code the central API sends with a refusal", async () => {
        answerWith({ ok: false, status: 429, json: async () => ({ code: "WAKE_UP_RATE_LIMITED" }) });

        expect((await new FetchDeviceApi("device-token").wakeUp()).error?.code).toBe("WAKE_UP_RATE_LIMITED");
    });

    it("reports an unmapped failure as UNKNOWN, keeping the status in the cause", async () => {
        answerWith({ ok: false, status: 502, json: async () => ({}) });

        const failure = (await new FetchDeviceApi("device-token").restart()).error;

        expect(failure?.code).toBe("UNKNOWN");
        expect(failure?.cause).toBe("HTTP_502");
    });

    it("reports a network failure instead of throwing", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

        expect((await new FetchDeviceApi("device-token").logout()).error?.code).toBe("NETWORK_ERROR");
    });
});
