// Награда за принятую пилюлю (владелец, логи v3.3.276): пилюля улетает ВВЕРХ по старой синусоиде (wordLaneRise.js, как во всех режимах до v3.3.271), в счётчик XP не летит. Когда она на 90 % ушла за экран
// (XP_ARRIVE_MS от принятия) — счётчик .wlXp «распухает» (событие XP_PULSE_EVENT на корне игры) и из него идёт «+N XP» (WordLaneXp). Полёт пилюли В счётчик (v3.3.271–275) убран.
import { RISE_DELAY_MS, RISE_MS } from './wordLaneRise.js'

export const XP_OFFSCREEN_SHARE = 0.9 // доля взлёта, к которой пилюля уже за экраном: счётчик пульсирует
export const XP_ARRIVE_MS = RISE_DELAY_MS + Math.round(RISE_MS * XP_OFFSCREEN_SHARE) // от принятия до пульса счётчика и «+N XP»
export const XP_PULSE_EVENT = 'wl-xp-pulse' // событие на корне игры .wl: пилюля почти покинула экран — счётчик «распухает» (WordLaneXp)
