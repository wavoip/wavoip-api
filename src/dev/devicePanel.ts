import { button, element, field, type Log } from "@/dev/ui";
import type { Device } from "@/index";

type Command = Promise<{ error: { code: string } | null }>;

/** Um cartão por device: o que ele anuncia e o que dá para pedir a ele. */
export function devicePanel(device: Device, log: Log): HTMLElement {
    const box = element("div", "device");
    const state = element("p", "state");
    const qr = element("p", "state qr", "sem QR");

    const describe = () => {
        state.textContent = describeDevice(device);
        qr.textContent = device.qrCode ? `QR (${device.qrCode.length} chars): ${device.qrCode.slice(0, 48)}…` : "sem QR";
    };
    bindDeviceEvents(device, describe, log);

    box.append(element("h2", undefined, `Dispositivo ${short(device.token)}`), state, qr, actions(device, log));
    describe();
    return box;
}

function describeDevice(device: Device): string {
    const restriction = device.restricted ? `restrito até ${device.restrictedUntil?.toLocaleString("pt-BR") ?? "?"}` : "sem restrição";
    return `${device.status} · ${device.connectionStatus} · ${device.contact?.phone ?? "sem número"} · ${device.activeCalls} em curso · ${restriction}`;
}

function bindDeviceEvents(device: Device, describe: () => void, log: Log): void {
    const watch = (event: "statusChanged" | "connectionStatusChanged" | "contactChanged" | "activeCallsChanged") =>
        device.on(event, () => {
            log.write(`device ${short(device.token)}: ${event}`);
            describe();
        });
    for (const event of ["statusChanged", "connectionStatusChanged", "contactChanged", "activeCallsChanged"] as const) {
        watch(event);
    }
    device.on("qrCodeChanged", describe);
    device.on("restrictedChanged", (restricted, until) => {
        log.write(`device ${short(device.token)}: restrito=${restricted} até ${until?.toISOString() ?? "—"}`);
        describe();
    });
}

function actions(device: Device, log: Log): HTMLElement {
    const box = element("div", "actions");
    const run = async (name: string, command: Command) => {
        const { error } = await command;
        log.write(error ? `${name} falhou — ${error.code}` : `${name} ok`);
    };
    box.append(
        button("Acordar", () => run("wakeUp", device.wakeUp())),
        button("Reiniciar", () => run("restart", device.restart())),
        button("Desvincular", () => run("logout", device.logout())),
    );
    box.appendChild(pairing(device, log));
    return box;
}

/** O código de pareamento é a alternativa ao QR para vincular um número. */
function pairing(device: Device, log: Log): HTMLElement {
    const box = element("div", "actions");
    const phone = field("Parear com", "");
    box.append(
        phone.row,
        button("Código", async () => {
            const { data, error } = await device.pairingCode(phone.input.value.trim());
            log.write(error ? `pairingCode falhou — ${error.code}` : `pairingCode: ${data}`);
        }),
    );
    return box;
}

function short(token: string): string {
    return token.length > 10 ? `${token.slice(0, 8)}…` : token;
}
