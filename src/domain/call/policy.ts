/**
 * `ackTimeoutMs`: socket caído guarda o emit em buffer e o callback nunca roda; sem teto, a
 * Promise fica pendente para sempre e a interface trava em "cancelando".
 *
 * `mediaHandoverTimeoutMs`: subir a mídia depois que o outro lado atende é trabalho local —
 * aplicar a resposta e ligar o transporte —, e leva milissegundos. Sem teto, um `await` que
 * não volta deixa a chamada em ACTIVE sem áudio e sem falha: o telefone do outro lado fica
 * em "conectando" para sempre e a biblioteca não diz nada. Dez segundos é folga de sobra.
 *
 * `alreadyAnswered`: a única recusa que significa chamada ainda de pé — o outro lado
 * atendeu entre o clique e o ack. Qualquer outra é chamada morta, e a mídia vai junto.
 */
export const CallPolicy = {
    ackTimeoutMs: 10_000,
    mediaHandoverTimeoutMs: 10_000,
    alreadyAnswered: "CALL_ALREADY_ANSWERED",
} as const;
