import type { CallType } from "@/domain/call/types";
import type { DeviceErrorCode } from "@/domain/shared/errors";

/**
 * Account-level device status. WebSocket transport state is tracked separately
 * via `ConnectionStatus` and `connectionStatusChanged`.
 */
export type DeviceStatus =
    | "close"
    | "connecting"
    | "open"
    | "error"
    | "restarting"
    | "hibernating"
    | "BUILDING"
    | "WAITING_PAYMENT"
    | "EXTERNAL_INTEGRATION_ERROR";

/** WebSocket transport state, independent of the account-level `DeviceStatus`. */
export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

export type Contact = { phone: string };

/** WhatsApp is holding the account back. `until` is absent when the server does not say. */
export type DeviceRestriction = { readonly until: Date | null };

/** Everything a device announces about itself at once. */
export type DeviceDescription = {
    readonly status: DeviceStatus;
    readonly callType: CallType;
    readonly contact: Contact | null;
    readonly qrCode: string | null;
    readonly restriction: DeviceRestriction | null;
    readonly activeCalls: number;
};

/**
 * O device como a biblioteca o conhece. Ele é o único a escrever no próprio estado: quem
 * observa o servidor chama o que **aconteceu** (`linkTo`, `unlink`, `restrict`), e não o
 * campo que mudou. Era o contrário antes, e as regras de cada transição viviam espalhadas
 * na sessão.
 */
export class DeviceModel {
    private _status: DeviceStatus = "BUILDING";
    private _callType: CallType = "OFFICIAL";
    private _contact: Contact | null = null;
    private _qrCode: string | null = null;
    private _restriction: DeviceRestriction | null = null;
    private _activeCalls = 0;
    private _connectionStatus: ConnectionStatus = "disconnected";

    constructor(readonly token: string) {}

    get status(): DeviceStatus {
        return this._status;
    }

    get callType(): CallType {
        return this._callType;
    }

    get contact(): Contact | null {
        return this._contact;
    }

    get qrCode(): string | null {
        return this._qrCode;
    }

    get restriction(): DeviceRestriction | null {
        return this._restriction;
    }

    get activeCalls(): number {
        return this._activeCalls;
    }

    get connectionStatus(): ConnectionStatus {
        return this._connectionStatus;
    }

    /** O device se apresentou: tudo que ele é chega de uma vez. */
    describe(description: DeviceDescription): void {
        this._status = description.status;
        this._callType = description.callType;
        this._contact = description.contact;
        this._qrCode = description.qrCode;
        this._restriction = description.restriction;
        this._activeCalls = description.activeCalls;
    }

    /** Um número foi vinculado: o QR não serve mais. */
    linkTo(contact: Contact): void {
        this._status = "open";
        this._contact = contact;
        this._qrCode = null;
    }

    /** Esperando alguém ler o QR. Sem vínculo não há restrição de conta a carregar. */
    awaitPairing(qrCode: string | null): void {
        this._status = "connecting";
        this._contact = null;
        this._qrCode = qrCode;
        this._restriction = null;
    }

    /** O vínculo caiu: não há contato, QR nem restrição. */
    unlink(): void {
        this._status = "close";
        this._contact = null;
        this._qrCode = null;
        this._restriction = null;
    }

    /** Mudou de fase sem mexer no vínculo: reiniciando, hibernando, subindo. */
    moveTo(status: DeviceStatus): void {
        this._status = status;
    }

    restrict(restriction: DeviceRestriction | null): void {
        this._restriction = restriction;
    }

    countCalls(total: number): void {
        this._activeCalls = total;
    }

    /** Devolve se mudou: anunciar o mesmo estado duas vezes faz a interface piscar. */
    connectAs(status: ConnectionStatus): boolean {
        if (this._connectionStatus === status) return false;
        this._connectionStatus = status;
        return true;
    }

    /** O motivo de o device não poder chamar agora, ou `null` se ele pode. */
    canCall(): DeviceErrorCode | null {
        if (this._status === "error") return "DEVICE_ERROR";
        if (this._status === "connecting") return "DEVICE_NOT_LINKED";
        if (this._status === "restarting") return "DEVICE_RESTARTING";
        return null;
    }
}
