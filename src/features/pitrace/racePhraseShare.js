// Принятая фраза «Скажи» не по всем словам (ratio < 1, от PHRASE_OK = 75 %): что видит ученик (решение владельца 2026-11-16, «согласен A вместе с B и D»).
//  B — заливка доезжает не до 100 %, а ровно до PARTIAL_FILL = 80 % (v3.3.276; раньше — до границы сказанных слов, на длинной фразе ≈ 90 %+): раньше у фразы «сказал три слова из четырёх» полоска стояла у 97 % и прыгала в 100.
//  A — несказанные слова показаны в маске красным (data-w='miss', racePhraseMask.js).
//  D — взлёт янтарным (data-partial, race-phrase-rounds.css), у полной фразы — как раньше.

import { edgeAt, saidPrefix } from './racePhraseFill.js'

export const isPartial = ratio => Number(ratio) < 1 - 1e-9

// СТРОГО ≈80 % (владелец, v3.3.275: «если не хватает одного слова, заполненность пилюли должна быть строго примерно 80 %, а не 99»): неполная фраза доезжает ровно до PARTIAL_FILL, а не до границы слов.
export const PARTIAL_FILL = 0.8

// ВТЫКАЕТСЯ НА ПРОПУЩЕННОМ СЛОВЕ (2026-11-28, владелец v3.3.394, «Where are you from», «are» пропущено: «пилюля полностью заполнилась, а должна была воткнуться на «are», чтобы я понимал, где ошибка»):
// неполная фраза доезжает НЕ до фиксированных 80 %, а до границы перед первым несказанным словом — той же, где стоит линия (saidPrefix). Слова после пропуска фразу не заливают, хоть и сказаны.

/** Куда доезжает заливка после зачёта: 1 — все слова; иначе — граница перед первым несказанным словом (heard — Map слов; edges — границы на пилюле), без heard — PARTIAL_FILL */
export function fillTo({ ratio, n = 0, edges = null, heard = null }) {
  if (!isPartial(ratio)) return 1
  if (!heard || !(n > 1)) return PARTIAL_FILL
  return edgeAt(Math.min(saidPrefix(heard), n - 1), n, edges)
}

/** Взлёт принятой пилюли: не по всем словам — янтарный (pool.attr — как у data-lock) */
export function markPartial(pool, k, ratio) { if (isPartial(ratio)) pool.attr(k, 'data-partial') }
