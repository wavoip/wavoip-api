import type { AudioAnalyser } from "@wavoip/wavoip-api/react-native";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

const REFRESH_MS = 100;
// A barra é uma lista fixa: o id nasce com ela, para a identidade não ser a posição.
const BAR_IDS = Array.from({ length: 12 }, (_, index) => `bar-${index}`);

/**
 * O medidor responde "estou mandando áudio?" sem adivinhação, e é a primeira coisa a olhar
 * quando o outro lado diz que não ouve nada.
 *
 * O nível é síncrono de propósito: dá para lê-lo num intervalo curto sem esperar Promise.
 */
export function Meter({ label, analyser }: { label: string; analyser: AudioAnalyser }): React.JSX.Element {
    const level = useLevel(analyser);
    const filled = Math.min(BAR_IDS.length, Math.round(level * BAR_IDS.length * 2));

    return (
        <View style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.bars}>
                {BAR_IDS.map((id, index) => (
                    <View key={id} style={[styles.bar, index < filled && styles.barOn]} />
                ))}
            </View>
            <Text style={styles.value}>{`${Math.round(level * 100)}%`}</Text>
        </View>
    );
}

function useLevel(analyser: AudioAnalyser): number {
    const [level, setLevel] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => setLevel(analyser.level()), REFRESH_MS);
        return () => clearInterval(timer);
    }, [analyser]);

    return level;
}

const styles = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 2 },
    label: { width: 64, color: "#cbd5e1", fontSize: 12 },
    bars: { flexDirection: "row", gap: 2, flex: 1 },
    bar: { flex: 1, height: 10, backgroundColor: "#1e293b", borderRadius: 2 },
    barOn: { backgroundColor: "#22c55e" },
    value: { width: 40, textAlign: "right", color: "#cbd5e1", fontSize: 12 },
});
