import { CallRegistry } from "@/application/call/CallRegistry";
import { CallSession, type CallSessionDeps, type TransportFactory } from "@/application/call/CallSession";
import type { CallType } from "@/domain/call/types";
import { DevicePolicy } from "@/domain/device/policy";
import { CallPolicy } from "@/domain/call/policy";
import type { CommandFailure, DeviceApiFailure, StartCallErrorCode, WavoipError } from "@/domain/shared/errors";
import { Result } from "@/domain/shared/Result";
import type { ConnectionStatus, Contact, Device, DeviceRestriction, DeviceStatus } from "@/domain/device/Device";
import { EventEmitter, type Subscribable, type Unsubscribe } from "@/modules/shared/EventEmitter";
import type { DeviceApiPort } from "@/ports/DeviceApiPort";
import type { CallSignalingPort, DeviceSignalingPort, IncomingOffer, ServerDeviceEvent } from "@/ports/SignalingPort";

export type DeviceSessionEvents = {
    statusChanged: [status: DeviceStatus];
    connectionStatusChanged: [status: ConnectionStatus];
    qrCodeChanged: [qrCode: string | null];
    contactChanged: [contact: Contact | null];
    restrictionChanged: [restriction: DeviceRestriction | null];
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
 * O device: o estado que o servidor anuncia, a conexão com ele e as chamadas que passam por
 * aí. É ele mesmo o `Device` que o integrador recebe — o que o tipo público esconde é a
 * chamada crua, que só o `Wavoip` veste nas vistas de chamada.
 *
 * Estado e transição moram juntos de propósito: cada `apply*` é o que aconteceu no mundo,
 * escreve o que mudou e só então anuncia.
 */
export class DeviceSession implements Subscribable<DeviceSessionEvents>, Device {
    private readonly events = new EventEmitter<DeviceSessionEvents>();
    private readonly registry: CallRegistry;
    private readonly callDeps: CallSessionDeps;
    private stopped = false;

    private _status: DeviceStatus = "BUILDING";
    private _connectionStatus: ConnectionStatus = "disconnected";
    /** Só o servidor sabe: até o `device:init` chegar, o device não chama (ver `DevicePolicy`). */
    private _callType: CallType | null = null;
    private _contact: Contact | null = null;
    private _qrCode: string | null = null;
    private _restriction: DeviceRestriction | null = null;
    private _activeCalls = 0;

    constructor(
        private readonly deps: DeviceSessionDeps,
        readonly token: string,
    ) {
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

    get status(): DeviceStatus {
        return this._status;
    }

    get connectionStatus(): ConnectionStatus {
        return this._connectionStatus;
    }

    get qrCode(): string | null {
        return this._qrCode;
    }

    get contact(): Contact | null {
        return this._contact;
    }

    get restriction(): DeviceRestriction | null {
        return this._restriction;
    }

    get activeCalls(): number {
        return this._activeCalls;
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
        const { data: type, error } = DevicePolicy.typeOfNextCall(this._status, this._callType);
        if (error) return Result.fail(error.code);

        const started = await CallSession.Start(this.callDeps, {
            to,
            type,
            deviceToken: this.token,
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
        // O plano da oferta é quem diz o transporte, e o transporte é o que separa a chamada
        // oficial da não oficial. Ler o tipo do device aqui faria a oferta depender de o
        // `device:init` ter chegado antes dela.
        const session = new CallSession(this.callDeps, {
            id: offer.id,
            peer: offer.peer,
            type: offer.plan.type === "webRTC" ? "OFFICIAL" : "UNOFFICIAL",
            direction: "INCOMING",
            deviceToken: this.token,
            status: "CALLING",
            transport: this.deps.transports.forOffer(offer.plan, this.token),
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
                this.applyRestriction(event.restriction);
                return;
            case "activeCalls":
                this._activeCalls = event.count;
                this.events.emit("activeCallsChanged", event.count);
                return;
        }
    }

    /** O device se apresentou: tudo que ele é chega de uma vez. */
    private applyInit(event: Extract<ServerDeviceEvent, { type: "init" }>): void {
        this._status = event.status;
        this._callType = event.callType;
        this._contact = event.contact;
        this._qrCode = event.qrCode;
        this._restriction = event.restriction;
        this._activeCalls = event.activeCalls;

        this.announceConnection("connected");
        this.announceLink();
        this.events.emit("restrictionChanged", this._restriction);
        this.events.emit("activeCallsChanged", this._activeCalls);
    }

    /** Vinculou um número: o QR não serve mais. */
    private applyLinked(contact: Contact): void {
        this._status = "open";
        this._contact = contact;
        this._qrCode = null;
        this.announceLink();
    }

    /** Esperando alguém ler o QR. Sem vínculo não há restrição de conta a carregar. */
    private applyPairing(qrCode: string | null): void {
        this._status = "connecting";
        this._contact = null;
        this._qrCode = qrCode;
        this._restriction = null;
        this.announceLink();
    }

    /** O vínculo caiu: não sobra contato, QR nem restrição. */
    private applyUnlinked(): void {
        this._status = "close";
        this._contact = null;
        this._qrCode = null;
        this._restriction = null;
        this.announceLink();
    }

    private applyRestriction(restriction: DeviceRestriction | null): void {
        this._restriction = restriction;
        this.events.emit("restrictionChanged", restriction);
    }

    /** Mudou de fase sem mexer no vínculo: reiniciando, hibernando, subindo. */
    private announceStatus(status: DeviceStatus): void {
        this._status = status;
        this.events.emit("statusChanged", status);
    }

    private announceLink(): void {
        this.events.emit("statusChanged", this._status);
        this.events.emit("contactChanged", this._contact);
        this.events.emit("qrCodeChanged", this._qrCode);
    }

    /** Anunciar a mesma conexão duas vezes faria a interface piscar. */
    private announceConnection(status: ConnectionStatus): void {
        if (this._connectionStatus === status) return;
        this._connectionStatus = status;
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
        const delayMs = DevicePolicy.nextReconnectDelayMs(attempt);
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
