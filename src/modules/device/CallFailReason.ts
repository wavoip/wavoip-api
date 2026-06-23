/**
 * Reasons emitted by the server on the `call:failed` socket event and surfaced
 * to consumers via the {@link CallActive} `"error"` event.
 *
 * The union is loose (`| (string & {})`): typing as a literal union gives
 * autocomplete for known reasons in editors, while still accepting any future
 * server-side reason without forcing a library bump.
 *
 * Source of truth: `whatsapp_instance` server's `Helper.mapError` — keep this
 * union in sync with the strings that function returns.
 *
 * @example
 *   active.on("error", (reason) => {
 *       if (reason === "PEER_TX_TIMEOUT") notifyPeerSilence();
 *   });
 */
export type CallFailReason =
    /**
     * @deprecated Use {@link CallFailReason} `"PEER_RX_TIMEOUT"` instead.
     * Kept for backward compatibility while older server builds still emit
     * the legacy `client:audio-timeout` cause.
     */
    | "AUDIO_TIMEOUT"
    /** Integration failure decoding the offer ACK. */
    | "CORRUPTED_KEYS"
    /** Ping timeout between client and server. */
    | "CONNECTION_TIMEOUT"
    /**
     * Server stopped receiving audio from the peer (peer-side TX silence).
     * Typically the WhatsApp leg dropped or the peer muted unexpectedly.
     */
    | "PEER_TX_TIMEOUT"
    /**
     * Server stopped receiving audio from the user (user-side RX silence).
     * Supersedes the legacy `"AUDIO_TIMEOUT"` reason.
     */
    | "PEER_RX_TIMEOUT"
    /** WhatsApp returned ack-error 463 — account is restricted. */
    | "ACCOUNT_RESTRICTED"
    /** Integration forbade the call (missing permission). */
    | "NO_CALL_PERMISSION"
    /** Catch-all server-side internal error. */
    | "INTERNAL_ERROR"
    | (string & {});
