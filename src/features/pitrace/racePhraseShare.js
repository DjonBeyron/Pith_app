// Принятая фраза «Скажи» не по всем словам (ratio < 1, от PHRASE_OK = 75 %): что видит ученик (решение владельца 2026-11-16, «согласен A вместе с B и D»).
//  B — заливка доезжает не до 100 %, а до реальной доли сказанных слов (граница слов, racePhraseFill.edgeAt): раньше у фразы «сказал три слова из четырёх» полоска стояла у 97 % и прыгала в 100.
//  A — несказанные слова показаны в маске красным (data-w='miss', racePhraseMask.js).
//  D — взлёт янтарным (data-partial, race-phrase-rounds.css), у полной фразы — как раньше.
import { edgeAt } from './racePhraseFill.js'

export const isPartial = ratio => Number(ratio) < 1 - 1e-9

/** Куда доезжает заливка после зачёта: 1 — все слова; иначе — граница после ratio·n слов (edges — racePhraseFill.wordEdges или null) */
export const fillTo = ({ ratio, n, edges = null }) => (isPartial(ratio) ? Math.min(1, edgeAt(Math.max(0, ratio) * (n || 1), n || 1, edges)) : 1)

/** Взлёт принятой пилюли: не по всем словам — янтарный (pool.attr — как у data-lock) */
export function markPartial(pool, k, ratio) { if (isPartial(ratio)) pool.attr(k, 'data-partial') }
