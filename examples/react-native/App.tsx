import type { ActiveCall, Readiness, Wavoip } from "@wavoip/wavoip-api/react-native";
import { useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Meter } from "./src/Meter.tsx";
import { Trace, useTrace } from "./src/trace.ts";
import { useCall } from "./src/useCall.ts";
import type { CallReadiness } from "./src/useSession.ts";
import { useSession } from "./src/useSession.ts";

/**
 * Um aparelho, uma chamada: conectar o device, ligar para um número, atender o que chega.
 *
 * O token é digitado e não fica no código — este repositório é público.
 */
export default function App(): React.JSX.Element {
    const { session, status, connection, readiness, connect } = useSession();
    const { phase, dial, accept, reject, hangUp } = useCall(session?.wavoip ?? null);

    return (
        <SafeAreaView style={styles.screen}>
            <Text style={styles.title}>Wavoip · exemplo</Text>

            {session ? (
                <Text style={styles.line}>{`device ${status ?? "?"} · conexão ${connection ?? "?"}`}</Text>
            ) : (
                <TokenField onConnect={connect} />
            )}
            {readiness && <Text style={styles.line}>{describeReadiness(readiness)}</Text>}

            {session && phase.kind === "idle" && <Dialer onDial={dial} />}
            {phase.kind === "offer" && (
                <Row>
                    <Text style={styles.line}>{`${phase.call.peer.phone} está chamando`}</Text>
                    <Button label="Atender" onPress={accept} />
                    <Button label="Recusar" onPress={reject} tone="danger" />
                </Row>
            )}
            {phase.kind === "outgoing" && (
                <Row>
                    <Text style={styles.line}>{`chamando ${phase.call.peer.phone}…`}</Text>
                    <Button label="Cancelar" onPress={hangUp} tone="danger" />
                </Row>
            )}
            {phase.kind === "active" && session && (
                <Active call={phase.call} wavoip={session.wavoip} onHangUp={hangUp} />
            )}

            <TraceView />
        </SafeAreaView>
    );
}

function TokenField({ onConnect }: { onConnect: (token: string) => void }): React.JSX.Element {
    const [token, setToken] = useState("");

    return (
        <Row>
            <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                placeholder="token do device"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
            />
            <Button label="Conectar" onPress={() => token && onConnect(token)} />
        </Row>
    );
}

function Dialer({ onDial }: { onDial: (to: string) => void }): React.JSX.Element {
    const [to, setTo] = useState("");

    return (
        <Row>
            <TextInput
                style={styles.input}
                value={to}
                onChangeText={setTo}
                placeholder="5511999999999"
                placeholderTextColor="#64748b"
                keyboardType="phone-pad"
            />
            <Button label="Ligar" onPress={() => to && onDial(to)} />
        </Row>
    );
}

/** A chamada de pé: o que se ouve, o que se manda, e para onde o som sai. */
function Active({
    call,
    wavoip,
    onHangUp,
}: {
    call: ActiveCall;
    wavoip: Wavoip;
    onHangUp: () => void;
}): React.JSX.Element {
    const [muted, setMuted] = useState(false);
    const [onSpeaker, setOnSpeaker] = useState(false);

    const toggleMute = async () => {
        const { error } = muted ? await call.unmute() : await call.mute();
        if (error) return Trace.write("mídia", `mudo recusado: ${error.code}`);
        setMuted(!muted);
    };

    const toggleSpeaker = async () => {
        const { error } = await wavoip.audio.selectOutput(onSpeaker ? "earpiece" : "speaker");
        if (error) return Trace.write("mídia", `saída recusada: ${error.code}`);
        setOnSpeaker(!onSpeaker);
    };

    return (
        <View style={styles.block}>
            <Text style={styles.line}>{`${call.peer.phone} · ${call.connection}`}</Text>
            <Meter label="entrada" analyser={call.audio.in} />
            <Meter label="saída" analyser={call.audio.out} />
            <Row>
                <Button label={muted ? "Desmutar" : "Mutar"} onPress={toggleMute} />
                <Button label={onSpeaker ? "Fone" : "Viva-voz"} onPress={toggleSpeaker} />
                <Button label="Desligar" onPress={onHangUp} tone="danger" />
            </Row>
        </View>
    );
}

function TraceView(): React.JSX.Element {
    const lines = useTrace();

    return (
        <ScrollView style={styles.trace}>
            {lines.map((line) => (
                <Text key={line.id} style={styles.traceLine}>
                    {`${(line.at / 1000).toFixed(1)}s ${line.scope.padEnd(9)} ${line.text}`}
                </Text>
            ))}
        </ScrollView>
    );
}

function Row({ children }: { children: React.ReactNode }): React.JSX.Element {
    return <View style={styles.row}>{children}</View>;
}

function Button({
    label,
    onPress,
    tone,
}: {
    label: string;
    onPress: () => void;
    tone?: "danger";
}): React.JSX.Element {
    return (
        <Pressable style={[styles.button, tone === "danger" && styles.danger]} onPress={onPress}>
            <Text style={styles.buttonLabel}>{label}</Text>
        </Pressable>
    );
}

function describeReadiness(readiness: CallReadiness): string {
    return `${describeOne("oficial", readiness.OFFICIAL)} · ${describeOne("não oficial", readiness.UNOFFICIAL)}`;
}

function describeOne(name: string, state: Readiness): string {
    return state.ready ? `${name} ok` : `${name} bloqueada por ${state.blockedBy.join(", ")}`;
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#0f172a", padding: 16, gap: 12 },
    title: { color: "#f8fafc", fontSize: 20, fontWeight: "600" },
    line: { color: "#e2e8f0", fontSize: 13 },
    block: { gap: 6 },
    row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    input: { flex: 1, minWidth: 140, color: "#f8fafc", backgroundColor: "#1e293b", borderRadius: 6, padding: 10 },
    button: { backgroundColor: "#2563eb", borderRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
    danger: { backgroundColor: "#b91c1c" },
    buttonLabel: { color: "#f8fafc", fontWeight: "600" },
    trace: { flex: 1, backgroundColor: "#020617", borderRadius: 6, padding: 8 },
    traceLine: { color: "#94a3b8", fontFamily: "monospace", fontSize: 11 },
});
