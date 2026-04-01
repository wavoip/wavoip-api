export class Call {
    constructor(
        public readonly id: string,
        public readonly type: CallType,
        public readonly direction: CallDirection,
        public readonly peer: Peer,
        public readonly deviceToken: string,
        public status: CallStatus,
    ) {}

    accept(): boolean {
        if (!["RINGING", "CALLING"].includes(this.status)) return false;
        this.status = "ACTIVE";
        return true;
    }

    reject(): boolean {
        if (this.status !== "ACTIVE") return false;
        this.status = "REJECTED";
        return true;
    }

    end(): boolean {
        if (this.status !== "ACTIVE") return false;
        this.status = "ENDED";
        return true;
    }

    timeout() {
        if (!["RINGING", "CALLING"].includes(this.status)) return false;
        this.status = "NOT_ANSWERED";
        return true;
    }

    fail() {
        if (!["ACTIVE"].includes(this.status)) return false;
        this.status = "FAILED";
        return true;
    }

    static CreateOffer(id: string, type: CallType, peer: Peer, deviceToken: string) {
        return new Call(id, type, "INCOMING", peer, deviceToken, "CALLING");
    }
}

export type CallStatus =
    | "RINGING"
    | "CALLING"
    | "NOT_ANSWERED"
    | "ACTIVE"
    | "ENDED"
    | "REJECTED"
    | "FAILED"
    | "DISCONNECTED";

export type CallType = "official" | "unofficial";

export type Peer = {
    phone: string;
    displayName: string | null;
    profilePicture: string | null;
};

export type CallDirection = "INCOMING" | "OUTGOING";
