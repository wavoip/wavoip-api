/**
 * Por onde o áudio da chamada vai passar. É o servidor que decide e anuncia junto da
 * oferta; a chamada só escolhe o transporte que sabe cumprir o plano.
 *
 * `none` é a chamada que ainda não tem mídia — quem liga espera o outro lado atender
 * antes de saber por onde o áudio virá.
 */
export type MediaPlanRelay = { type: "relay"; host: string; port: string };
export type MediaPlanWebRTC = { type: "webRTC"; sdp: string };
export type MediaPlanNull = { type: "none" };
export type MediaPlan = MediaPlanRelay | MediaPlanWebRTC | MediaPlanNull;
