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
     * Kept for backward compatibility.
     */
    | "AUDIO_TIMEOUT"
    /** The call could not be established securely. */
    | "CORRUPTED_KEYS"
    /** The call lost contact with the server. */
    | "CONNECTION_TIMEOUT"
    /** The contact stopped sending audio. */
    | "PEER_TX_TIMEOUT"
    /** The user stopped sending audio. Supersedes `"AUDIO_TIMEOUT"`. */
    | "PEER_RX_TIMEOUT"
    /** The WhatsApp account is restricted and cannot place calls. */
    | "ACCOUNT_RESTRICTED"
    /** The account is not allowed to place calls. */
    | "NO_CALL_PERMISSION"
    /** Something went wrong on the server side. */
    | "INTERNAL_ERROR"
    | (string & {});
