export type CallStats = {
    rtt: {
        min: number;
        max: number;
        avg: number;
    };
    tx: {
        total: number;
        total_bytes: number;
        loss: number;
    };
    rx: {
        total: number;
        total_bytes: number;
        loss: number;
    };
};

export type ServerCallStats = {
    rtt: {
        client: { min: number; max: number; avg: number };
        whatsapp: { min: number; max: number; avg: number };
    };
    tx: {
        total: number;
        total_bytes: number;
        loss: number;
    };
    rx: {
        total: number;
        total_bytes: number;
        loss: number;
    };
};
