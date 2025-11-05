import { EventEmitter } from "@/features/EventEmitter";
import { CallManager } from "@/features/call/call-manager";
import type { CallOffer, CallOutgoing } from "@/features/call/types/call";
import { PublicDeviceBuilder } from "@/features/device/PublicDeviceBuilder";
import { DeviceManager } from "@/features/device/device-manager";
import type { Device } from "@/features/device/types/device";
import { Multimedia } from "@/features/multimedia/multimedia";
import type { MultimediaError } from "@/features/multimedia/types/error";

type Events = {
    offer: [callOffer: CallOffer];
};

export class Wavoip extends EventEmitter<Events> {
    private call_manager: CallManager;
    private _devices: DeviceManager[];
    private _multimedia: Multimedia;

    constructor(params: {
        tokens: string[];
    }) {
        super();

        this._devices = [...new Set(params.tokens)].map((token) => new DeviceManager(token));
        this._multimedia = new Multimedia();
        this.call_manager = new CallManager(this._multimedia);

        for (const device of this._devices) {
            this.bindDeviceEvents(device);
        }
    }

    onOffer(cb: (callOffer: CallOffer) => void) {
        this.removeAllListeners("offer");
        this.on("offer", cb);
    }

    get multimedia() {
        return {
            microphone: this._multimedia.microphone,
            speaker: this._multimedia.speaker,
            on: this._multimedia.on,
        };
    }

    getMultimediaDevices() {
        const microphones = this.multimedia.microphone.devices;
        const speakers = this.multimedia.speaker.devices;

        return { microphones, speakers };
    }

    onMultimediaError(cb: (err: MultimediaError, retry?: () => void) => void) {
        this._multimedia.removeAllListeners("error");
        this._multimedia.on("error", cb);
    }

    /**
     * Attempts to start an outgoing call using one or more available devices.
     *
     * The method tries each device in sequence until one successfully initiates a call.
     * If all devices fail, it returns a detailed error report listing the reasons per device.
     *
     * @async
     * @param {Object} params - Parameters for starting the call.
     * @param {string[]} [params.fromTokens] - Specific device tokens to use.
     *   If omitted, all registered devices will be tried.
     * @param {string} params.to - The peer number (target) to call.
     *
     * @returns {Promise<
     *   | { call: CallOutgoing; err: null }
     *   | { call: null; err: { message: string; devices: { token: string; reason: string }[] } }
     * >}
     * A promise that resolves with either:
     * - A successful outgoing call and `err: null`, or
     * - An error containing a message and a list of failed devices with reasons.
     *
     * @example
     * const result = await instance.startCall({ to: "5511999999999" });
     *
     * if (result.err) {
     *   console.error(result.err.message);
     *   result.err.devices.forEach(d => console.warn(`${d.token}: ${d.reason}`));
     * } else {
     *   console.log("Call started successfully:", result.call);
     * }
     */
    async startCall(params: {
        fromTokens?: string[];
        to: string;
    }): Promise<
        | { call: CallOutgoing; err: null }
        | { call: null; err: { message: string; devices: { token: string; reason: string }[] } }
    > {
        const devices = params.fromTokens
            ? this._devices.filter((device) => params.fromTokens?.includes(device.token))
            : this._devices;

        if (!devices.length) {
            return { call: null, err: { devices: [], message: "Não existe nenhum dispositivo" } };
        }

        const device_errors: { token: string; reason: string }[] = [];

        for (const device of devices) {
            const canCall = device.canCall();

            if (canCall.err) {
                device_errors.push({ token: device.token, reason: canCall.err });
                continue;
            }

            const { call, err } = await device.startCall(params.to);

            if (!call) {
                device_errors.push({ token: device.token, reason: err as string });
                continue;
            }

            const outgoing = await this.call_manager.buildOutgoing(call.id, call.peer, call.transport, device);

            return { call: outgoing, err: null };
        }

        return { call: null, err: { message: "Não foi possível realizar a chamada", devices: device_errors } };
    }

    /**
     * Attempts to start an outgoing call using one or more available devices.
     *
     * This async generator yields the result of each device's call attempt,
     * and returns the first successful call, if any.
     *
     * @async
     * @generator
     * @param {Object} params - Parameters for starting the call.
     * @param {string[]} [params.fromTokens] - Specific device tokens to use.
     *   If omitted, all registered devices will be tried.
     * @param {string} params.to - The peer number (target) to call.
     *
     * @yields {{ call: null, token: string, err: string }} -
     *   Emitted when a device fails to start a call, including its token and error message.
     *
     * @returns {{ call: CallOutgoing, token: string, err: null } | { call: null, err: string }} -
     *   The first successful call, or a final error if no call succeeded.
     *
     * @example
     * for await (const result of instance.startCallIterator({ to: "5511999999999" })) {
     *   if (result.err) {
     *     console.warn(`Device ${result.token} failed: ${result.err}`);
     *   } else {
     *     console.log(`Call started via ${result.token}:`, result.call);
     *   }
     * }
     */
    async *startCallIterator(params: {
        fromTokens?: string[];
        to: string;
    }): AsyncGenerator<{ call: CallOutgoing; token: string; err: null } | { call: null; token?: string; err: string }> {
        const devices = params.fromTokens
            ? this._devices.filter((device) => params.fromTokens?.includes(device.token))
            : this._devices;

        if (!devices.length) {
            return { call: null, err: "Nenhum dispositivo" };
        }

        for (const device of devices) {
            const canCall = device.canCall();

            if (canCall.err) {
                yield {
                    call: null,
                    token: device.token,
                    err: canCall.err,
                };
                continue;
            }

            const { call, err } = await device.startCall(params.to);

            if (!call) {
                yield { call: null, token: device.token, err };
                continue;
            }

            const outgoing = await this.call_manager.buildOutgoing(call.id, call.peer, call.transport, device);
            return { call: outgoing, token: device.token };
        }

        return { call: null, err: "Não foi possível realizar a chamada" };
    }

    get devices() {
        return this._devices.map((device) => PublicDeviceBuilder(device, this));
    }

    getDevices(): Device[] {
        return this.devices;
    }

    /**
     * Add devices to instance
     * @param {string[]} tokens - Device tokens.
     * @returns {Device[]} Array containing the added devices
     */
    addDevices(tokens: string[] = []): Device[] {
        const devices = [];
        for (const token of tokens) {
            if (this.devices.find((device) => tokens.includes(device.token))) continue;

            const device = new DeviceManager(token);
            this._devices.push(device);
            devices.push(device);
        }

        return devices.map((device) => PublicDeviceBuilder(device, this));
    }

    /**
     * Remove devices to instance
     * @param {string[]} tokens - Device tokens.
     * @returns {Device[]} Array containing the rest of the devices
     */
    removeDevices(tokens: string[]): Device[] {
        if (!tokens.length) {
            return this.devices;
        }

        const devicesLeft = [];

        for (const device of this._devices) {
            if (tokens.includes(device.token)) {
                device.socket.close();
                continue;
            }
            devicesLeft.push(device);
        }

        this._devices = devicesLeft;

        return this.devices;
    }

    /**
     * Iteratively wakes up devices that are in hibernation.
     *
     * This async generator attempts to wake each specified device (or all devices if none are specified)
     * and yields the result for each one.
     *
     * @async
     * @generator
     * @param {string[]} [tokens=[]] - Specific device tokens to wake up.
     *   If omitted, all registered devices will be checked.
     *
     * @yields {{ token: string, waken: boolean }} -
     *   The result for each device, indicating whether it was successfully awakened.
     *
     * @returns {void}
     *   When all devices have been processed.
     *
     * @example
     * for await (const result of instance.wakeUpDevicesIterator(["abc123", "xyz789"])) {
     *   console.log(`${result.token}: ${result.waken ? "awake" : "still asleep"}`);
     * }
     */
    async *wakeUpDevicesIterator(tokens: string[] = []) {
        const devices = tokens.length ? this._devices.filter((device) => tokens.includes(device.token)) : this._devices;

        for (const device of devices) {
            const infos = await device.getInfos();
            yield { token: device.token, waken: !!infos };
        }
    }

    /**
     * Wakes up devices that are in hibernation.
     *
     * This method attempts to wake each specified device (or all devices if none are specified)
     * and returns an array of Promises, each resolving to that device's wake-up result.
     *
     * @param {string[]} [tokens=[]] - Specific device tokens to wake up.
     *   If an empty array is passed, all registered devices will be targeted.
     *
     * @returns {Promise<{ token: string, waken: boolean }>[]}
     * An array of Promises, each resolving to an object containing:
     * - `token`: The device token.
     * - `waken`: Whether the device was successfully awakened.
     *
     * @example
     * const results = await Promise.all(instance.wakeUpDevices(["abc123", "xyz789"]));
     * results.forEach(r => {
     *   console.log(`${r.token}: ${r.waken ? "awake" : "still asleep"}`);
     * });
     */
    wakeUpDevices(tokens: string[] = []): Promise<{ token: string; waken: boolean }>[] {
        const devices = tokens.length ? this._devices.filter((device) => tokens.includes(device.token)) : this._devices;

        return devices.map((device) => device.getInfos().then((infos) => ({ token: device.token, waken: !!infos })));
    }

    private bindDeviceEvents(device: DeviceManager) {
        device.socket.on("call:offer", (call) => {
            const offer = this.call_manager.onOffer(call.id, call.peer, device);
            this.emit("offer", offer);
        });

        this.call_manager.bindDeviceEvents(device);
    }
}
