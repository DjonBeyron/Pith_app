// Заливка круга 2 «Скажи» (racePhraseScene.js): ЦЕЛЬ заливки широкой пилюли по состоянию слов и момент взлёта после итога. Чистые функции, время — аргументом; экран догоняет цель сам (wordLaneFillView.js, 2,5/с).
// Правило (2026-11-07, замечание владельца 5: «пилюля чётко заполняется на сказанное слово»): каждое сказанное слово даёт СВОЮ ПОЛНУЮ долю 1/N фразы — подтверждённое (итогом захода или следующим словом) сразу,
// черновое — когда черновик устоялся: слово держится в черновике FILL_SETTLE_MS (как RU_SETTLE_MS в wordLaneListen.js); до этого — половина доли (игрок видит отклик). Слова не откатываются: черновик, который потом
// перестроился без этого слова, долю не теряет. «Аванс» FILL_ADVANCE слова — только по первому непустому звуку, пока ни одного слова фразы ещё нет (дальше «1 слово из 4 — 25 %» читается без перелёта).
// Итог (замечание 6): после onPhrase цель — 100 %, кромка доезжает с той же скоростью, и только когда дошла (+ FILL_HOLD_MS) — взлёт и зачёт; ожидание не дольше FILL_FINISH_MAX_MS.
import { FILL_ADVANCE } from '../player/modules/rotate-phone/wordLaneFillView.js'

export const FILL_SETTLE_MS = 350     // черновое слово устоялось — полная доля
export const ADVANCE_MS = 1500        // «аванс» по первому звуку держится столько после последнего черновика
export const FILL_HOLD_MS = 120       // заливка дошла до 100 % — столько видна целиком, потом взлёт
export const FILL_FINISH_MAX_MS = 700 // потолок ожидания доезда после итога

/** Вклад слова в долях слова: подтверждено — 1; черновик — 0,5, устоялся (FILL_SETTLE_MS) — 1. w = { full, at } (at — когда пришёл черновик) */
export const wordShare = (w, t) => (w.full || t - w.at >= FILL_SETTLE_MS ? 1 : 0.5)

/** Цель заливки 0…1: words — Map номер слова → { full, at }, n — слов во фразе, heardAt — последний непустой звук, done — итог пришёл (доезд до 100 %) */
export function fillGoal({ words, n, t, heardAt = -Infinity, done = false }) {
  if (done) return 1
  let sum = 0
  for (const w of words.values()) sum += wordShare(w, t)
  const ahead = !words.size && t - heardAt < ADVANCE_MS ? FILL_ADVANCE : 0
  return Math.min(1, Math.max(sum, ahead) / (n || 1))
}

/** Слово услышано (onWord): черновик запоминает время первого появления, подтверждение — полная доля; все слова до него — подтверждены (их перекрыло следующее) */
export function markWord(words, index, draft, t) {
  const w = words.get(index)
  if (!w) words.set(index, { full: !draft, at: t })
  else if (!draft) w.full = true
  for (const [i, x] of words) if (i < index) x.full = true
}

/** Доезд после итога: fin = { at } — когда пришёл итог; shown — заливка на экране. Возвращает true, когда пора взлетать (дошла до 100 % и подержалась, или кончился потолок) */
export function finishDue(fin, shown, t) {
  if (shown >= 1 - 1e-6 && fin.full == null) fin.full = t
  return (fin.full != null && t - fin.full >= FILL_HOLD_MS) || t - fin.at >= FILL_FINISH_MAX_MS
}
