import { CallRegistry } from "@/application/call/CallRegistry";
import { CallSession, type CallSessionDeps, type TransportFactory } from "@/application/call/CallSession";
import type { Device } from "@/domain/device/contract";
import { ReconnectPolicy } from "@/domain/device/reconnectPolicy";
import { CallPolicy } from "@/domain/call/policy";
import type { CommandFailure, DeviceApiFailure, StartCallErrorCode, WavoipError } from "@/domain/shared/errors";
import { Result } from "@/domain/shared/Result";
import type { ConnectionStatus, Contact, DeviceStatus } from "@/modules/device/Device";
import { DeviceModel } from "@/modules/device/Device";
import { EventEmitter, type Subscribable, type Unsubscribe } from "@/modules/shared/EventEmitter";
import type { DeviceApiPort } from "@/ports/DeviceApiPort";
import type { CallSignalingPort, DeviceSignalingPort, IncomingOffer, ServerDeviceEvent } from "@/ports/SignalingPort";

export type DeviceSessionEvents = {
    statusChanged: [status: DeviceStatus];
    connectionStatusChanged: [status: ConnectionStatus];
    qrCodeChanged: [qrCode?: string];
    contactChanged: [contact?: Contact];
    restrictedChanged: [restricted: boolean, restrictedUntil: Date | null];
    activeCallsChanged: [count: number];
    incomingCall: [call: CallSession];
};

export type DeviceSessionDeps = {
    signaling: CallSignalingPort & DeviceSignalingPort;
    api: DeviceApiPort;
    transports: TransportFactory;
    setLocalMuted: (muted: boolean) => void;
};

/**
 * Dona de um device: o estado que o servidor anuncia, a conexão com ele e as chamadas que
 * passam por aí. É ela mesma o `Device` que o integrador recebe — o que o tipo público
 * esconde é a chamada crua, que só o `Wavoip` embrulha nas vistas de chamada.
 */
export class DeviceSession implements Subscribable<DeviceSessionEvents>, Device {
    private readonly events = new EventEmitter<DeviceSessionEvents>();
    private readonly device: DeviceModel;
    private readonly registry: CallRegistry;
    private readonly callDeps: CallSessionDeps;
    private stopped = false;

    constructor(
        private readonly deps: DeviceSessionDeps,
        token: string,
    ) {
        this.device = new DeviceModel(token);
        this.registry = new CallRegistry(deps.signaling);
        this.callDeps = {
            signaling: deps.signaling,
            transports: deps.transports,
            setLocalMuted: deps.setLocalMuted,
        };

        deps.signaling.onDeviceEvent((event) => this.applyServerEvent(event));
        deps.signaling.onOffer((offer) => this.receiveOffer(offer));
        deps.signaling.onConnectionLost(() => this.handleConnectionLost());
    }

    on<T extends keyof DeviceSessionEvents>(
        event: T,
        listener: (...args: DeviceSessionEvents[T]) => void,
    ): Unsubscribe {
        return this.events.on(event, listener);
    }

    get token(): string {
        return this.device.token;
    }

    get qrCode(): string | undefined {
        return this.device.qrCode;
    }

    get contact(): Contact | undefined {
        return this.device.contact;
    }

    get status(): DeviceStatus {
        return this.device.status;
    }

    get connectionStatus(): ConnectionStatus {
        return this.device.connectionStatus;
    }

    get restricted(): boolean {
        return this.device.restricted;
    }

    get restrictedUntil(): Date | null {
        return this.device.restrictedUntil;
    }

    get activeCalls(): number {
        return this.device.activeCalls;
    }

    connect(): void {
        this.stopped = false;
        this.deps.signaling.connect();
    }

    disconnect(): void {
        this.stopped = true;
        this.deps.signaling.disconnect();
    }

    async startCall(to: string): Promise<Result<CallSession, WavoipError<StartCallErrorCode>>> {
        const blocked = this.device.canCall();
        if (blocked) return Result.fail(blocked);

        const started = await CallSession.Start(this.callDeps, {
            to,
            type: this.device.callType,
            deviceToken: this.device.token,
        });
        if (started.data) this.registry.register(started.data);
        return started;
    }

    restart(): Promise<Result<void, DeviceApiFailure>> {
        return this.deps.api.restart();
    }

    logout(): Promise<Result<void, DeviceApiFailure>> {
        return this.deps.api.logout();
    }

    wakeUp(): Promise<Result<void, DeviceApiFailure>> {
        return this.deps.api.wakeUp();
    }

    async pairingCode(phone: string): Promise<Result<string, CommandFailure>> {
        const ack = await this.deps.signaling.requestPairingCode(phone, CallPolicy.ackTimeoutMs);
        if (ack.kind === "timeout") return Result.fail("ACK_TIMEOUT");
        if (ack.kind === "refused") return Result.fail(ack.code, { cause: ack.cause });
        return Result.ok(ack.value);
    }

    private receiveOffer(offer: IncomingOffer): void {
        const session = new CallSession(this.callDeps, {
            id: offer.id,
            peer: offer.peer,
            type: this.device.callType,
            direction: "INCOMING",
            deviceToken: this.device.token,
            status: "CALLING",
            transport: this.deps.transports.forOffer(offer.plan, this.device.token),
        });
        this.registry.register(session);
        this.events.emit("incomingCall", session);
    }

    /** O device anunciou o que é dele: o estado muda aqui, e só então os eventos saem. */
    private applyServerEvent(event: ServerDeviceEvent): void {
        switch (event.type) {
            case "init":
                this.applyInit(event);
                return;
            case "building":
                this.announceStatus("BUILDING");
                return;
            case "restarting":
                this.announceStatus("restarting");
                return;
            case "hibernating":
                this.announceStatus("hibernating");
                return;
            case "open":
                this.applyLinked(event.contact);
                return;
            case "connecting":
                this.applyPairing(event.qrCode);
                return;
            case "close":
                this.applyUnlinked();
                return;
            case "restriction":
                this.applyRestriction(event.restricted, event.restrictedUntil);
                return;
            case "activeCalls":
                this.device.activeCalls = event.count;
                this.events.emit("activeCallsChanged", event.count);
                return;
        }
    }

    private applyInit(event: Extract<ServerDeviceEvent, { type: "init" }>): void {
        this.device.status = event.status;
        this.device.callType = event.callType;
        this.device.contact = event.contact ?? undefined;
        this.device.qrCode = event.qrCode ?? undefined;
        this.device.restricted = event.restricted;
        this.device.restrictedUntil = event.restrictedUntil;
        this.device.activeCalls = event.activeCalls;

        this.announceConnection("connected");
        this.events.emit("statusChanged", this.device.status);
        this.events.emit("contactChanged", this.device.contact);
        this.events.emit("qrCodeChanged", this.device.qrCode);
        this.events.emit("restrictedChanged", this.device.restricted, this.device.restrictedUntil);
        this.events.emit("activeCallsChanged", this.device.activeCalls);
    }

    private applyLinked(contact: Contact): void {
        this.device.status = "open";
        this.device.contact = contact;
        this.device.qrCode = undefined;
        this.announceLink();
    }

    private applyPairing(qrCode: string | null): void {
        this.device.status = "connecting";
        this.device.contact = undefined;
        this.device.qrCode = qrCode ?? undefined;
        this.device.restricted = false;
        this.device.restrictedUntil = null;
        this.announceLink();
    }

    private applyUnlinked(): void {
        this.device.status = "close";
        this.device.contact = undefined;
        this.device.qrCode = undefined;
        this.device.restricted = false;
        this.device.restrictedUntil = null;
        this.announceLink();
    }

    private applyRestriction(restricted: boolean, restrictedUntil: Date | null): void {
        this.device.restricted = restricted;
        this.device.restrictedUntil = restrictedUntil;
        this.events.emit("restrictedChanged", restricted, restrictedUntil);
    }

    private announceStatus(status: DeviceStatus): void {
        this.device.status = status;
        this.events.emit("statusChanged", status);
    }

    private announceLink(): void {
        this.events.emit("statusChanged", this.device.status);
        this.events.emit("contactChanged", this.device.contact);
        this.events.emit("qrCodeChanged", this.device.qrCode);
    }

    private announceConnection(status: ConnectionStatus): void {
        if (this.device.connectionStatus === status) return;
        this.device.connectionStatus = status;
        this.events.emit("connectionStatusChanged", status);
    }

    private handleConnectionLost(): void {
        this.announceConnection("disconnected");
        if (this.stopped) return;
        // O socket.io ainda tentando por conta própria: reconectar por cima duplicaria.
        if (this.deps.signaling.isRetrying()) return;
        this.reconnect(1);
    }

    /**
     * Acorda o device pela API central antes de tentar o socket. O nginx do
     * `devices.wavoip.com` acorda sozinho um device hibernado que recebe requisição HTTP,
     * mas pula essa parte quando o upgrade é websocket — então o socket bateria num device
     * dormindo para sempre. Era por isso que a v2 funcionava: ela pedia `/whatsapp/all_info`
     * antes de reconectar, e quem acordava o device era o efeito colateral do nginx.
     *
     * O status novo chega no `device:init` da reconexão.
     */
    private reconnect(attempt: number): void {
        const delayMs = ReconnectPolicy.nextDelayMs(attempt);
        if (delayMs === null || this.stopped || this.deps.signaling.isConnected()) return;

        this.announceConnection("reconnecting");
        setTimeout(async () => {
            if (this.stopped) return;
            const woken = await this.deps.api.wakeUp();
            if (this.stopped) return;
            if (woken.error) return this.reconnect(attempt + 1);
            this.deps.signaling.connect();
        }, delayMs);
    }
}
