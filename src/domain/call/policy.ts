/**
 * `ackTimeoutMs`: socket caído guarda o emit em buffer e o callback nunca roda; sem teto, a
 * Promise fica pendente para sempre e a interface trava em "cancelando".
 *
 * `alreadyAnswered`: a única recusa que significa chamada ainda de pé — o outro lado
 * atendeu entre o clique e o ack. Qualquer outra é chamada morta, e a mídia vai junto.
 */
export const CallPolicy = {
    ackTimeoutMs: 10_000,
    alreadyAnswered: "IS_NOT_OFFER",
} as const;
