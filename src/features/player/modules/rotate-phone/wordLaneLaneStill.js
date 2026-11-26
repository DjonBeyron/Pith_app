// Выключатель «Узор дорожек: стоит» (v3.3.382, запасной для слабого телефона: журнал владельца 2026-11-27 — «до двигающихся дорожек было плавнее»). По умолчанию узор едет (на слабом — дёшево, laneConveyorMover.loopMover);
// ключ localStorage pithy_wl_lane_still_v1 = '1' — узор стоит на месте, меняется только яркость (как при reduced-motion). Читает WordLanePills при старте игры, переключают HUD и окно комментария («после «Игра заново»»).
export const LANE_STILL_KEY = 'pithy_wl_lane_still_v1'

export function readLaneStill(store = globalThis.localStorage) {
  try { return store?.getItem(LANE_STILL_KEY) === '1' } catch { return false }
}
export function writeLaneStill(on, store = globalThis.localStorage) {
  try { if (on) store?.setItem(LANE_STILL_KEY, '1'); else store?.removeItem(LANE_STILL_KEY) } catch { /* приватный режим — живёт до перезагрузки */ }
}
