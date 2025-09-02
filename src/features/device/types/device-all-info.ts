export type DeviceAllInfo = {
    name: string;
    profile_picture: string;
    status: string;
    phone: string;
    integrations: {
        baileys: unknown[];
        evolution: { id: number; name: string }[];
    };
    call: {
        call_id: number | null;
        peer_made_call: boolean | null;
        accepted_peer: number | null;
        call_direction: string | null;
        call_active_date: string | null;
        call_duration_in_seconds: number | null;
    };
};
