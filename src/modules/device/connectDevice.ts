import { FetchDeviceApi } from "@/adapters/http/FetchDeviceApi";
import { SocketIoSignaling } from "@/adapters/socketio/SocketIoSignaling";
import type { TransportFactory } from "@/application/call/CallSession";
import { DeviceSession } from "@/application/device/DeviceSession";
import { DeviceWebSocketFactory } from "@/adapters/socketio/DeviceSocket";
import type { TransportOptions } from "@/modules/media/ITransport";
import { WebsocketTransport } from "@/modules/media/relay/Transport";
import { WebRTCTransport } from "@/modules/media/webrtc/Transport";
import type { WavoipRuntime } from "@/ports/WavoipRuntime";

/**
 * Liga um device: monta os adaptadores que falam com o servidor e com a mídia, e entrega a
 * sessão já conectada. É o único lugar que escolhe implementação — a sessão só conhece portas.
 */
export function connectDevice(
    runtime: WavoipRuntime,
    token: string,
    platform?: string,
    transportOptions?: TransportOptions,
): DeviceSession {
    const session = new DeviceSession(
        {
            signaling: new SocketIoSignaling(DeviceWebSocketFactory(token, platform)),
            api: new FetchDeviceApi(token),
            transports: transportsFor(runtime, token, transportOptions),
            setLocalMuted: (muted) => runtime.microphone.setMuted(muted),
        },
        token,
    );

    session.connect();
    return session;
}

/**
 * O device decide o transporte da chamada que sai: OFFICIAL fala WebRTC, UNOFFICIAL fala
 * relay. Na oferta recebida, quem decide é o plano que veio nela.
 */
function transportsFor(runtime: WavoipRuntime, token: string, options?: TransportOptions): TransportFactory {
    return {
        forCall: (type) =>
            type === "OFFICIAL"
                ? new WebRTCTransport(runtime, undefined, options)
                : new WebsocketTransport(runtime, token),
        forOffer: (plan, deviceToken) => {
            if (plan.type === "webRTC") return new WebRTCTransport(runtime, plan.sdp, options);
            if (plan.type === "relay") {
                const relay = new WebsocketTransport(runtime, deviceToken);
                relay.useRelay(plan);
                return relay;
            }
            throw new Error(`Unsupported media plan type: ${plan.type}`);
        },
    };
}
