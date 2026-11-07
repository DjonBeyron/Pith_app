// Заливка круга 2 «Скажи» (racePhraseScene.js): ЦЕЛЬ заливки широкой пилюли по состоянию слов и момент взлёта после итога. Чистые функции, время — аргументом; экран догоняет цель сам (wordLaneFillView.approachFillFast).
// ГРАНИЦЫ СЛОВ (2026-11-07, замечание владельца A: «линия заполнения должна встать точно между словами»): после k сказанных слов цель — не k/N, а граница edges[k−1] — середина зазора между словом k и k+1
// В ТЕКСТЕ НА ПИЛЮЛЕ (wordEdges по прямоугольникам <b> маски, racePhraseMaskView.edges); последнее слово — 100 %. Без DOM (тесты) или пока маска не измерена — доли 1/N.
// Каждое сказанное слово даёт СВОЮ ПОЛНУЮ долю сразу — и черновое (замечание B: «говорю быстро — заливается быстро, без остановок»; раньше черновое давало половину и полную только через 350 мс — ступеньки).
// Слова не откатываются: черновик, который потом перестроился без этого слова, долю не теряет. «Аванс» FILL_ADVANCE первого слова — только по первому непустому звуку, пока ни одного слова фразы ещё нет.
// Итог (замечание 6): после onPhrase цель — 100 %, кромка доезжает, и только когда дошла (+ FILL_HOLD_MS) — взлёт и зачёт; ожидание не дольше FILL_FINISH_MAX_MS (было 700 — замечание C: «думает около секунды»).
import { FILL_ADVANCE } from '../player/modules/rotate-phone/wordLaneFillView.js'

export const ADVANCE_MS = 1500        // «аванс» по первому звуку держится столько после последнего черновика
export const FILL_HOLD_MS = 120       // заливка дошла до 100 % — столько видна целиком, потом взлёт
export const FILL_FINISH_MAX_MS = 400 // потолок ожидания доезда после итога

/**
 * Границы слов в долях слоя кромки: rects — [{ left, right, top, bottom }] прямоугольники <b> слов по порядку, layer — { left, width } слоя, по которому едет кромка (translateX(v·100 %)).
 * Граница k (после слова k) — правый край слова k + половина зазора до слова k+1. Текст в две строки — «виртуальная одна строка»: слова и зазоры подряд (зазор на переносе — средний по строкам),
 * её длина ложится на ширину текста (от самого левого до самого правого края слов) — для одной строки это ровно середины зазоров. Последняя — 1. Нет размеров (не в DOM, скрыта) — null.
 */
export function wordEdges(rects, layer) {
  const n = rects?.length ?? 0
  if (!n || !(layer?.width > 0) || rects.some(r => !(r.right - r.left > 0))) return null
  const sameLine = (a, b) => Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < (a.bottom - a.top) / 2
  const gaps = rects.slice(1).map((r, i) => (sameLine(rects[i], r) ? Math.max(0, r.left - rects[i].right) : null))
  const known = gaps.filter(g => g != null)
  const mid = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0
  const gap = gaps.map(g => g ?? mid)
  const total = rects.reduce((s, r) => s + r.right - r.left, 0) + gap.reduce((a, b) => a + b, 0)
  const lo = Math.min(...rects.map(r => r.left)), span = Math.max(...rects.map(r => r.right)) - lo
  let run = 0
  return rects.map((r, i) => {
    if (i === n - 1) return 1
    run += r.right - r.left
    const x = lo + ((run + gap[i] / 2) / total) * span
    run += gap[i]
    return Math.min(1, Math.max(0, (x - layer.left) / layer.width))
  })
}

/** Где кромка после s сказанных слов (s может быть дробным — «аванс»): edges — границы (wordEdges) или null (доли 1/N) */
export function edgeAt(s, n, edges = null) {
  if (s <= 0) return 0
  if (s >= n) return 1
  if (!edges || edges.length !== n) return s / n
  const k = Math.floor(s), a = k ? edges[k - 1] : 0
  return a + (edges[k] - a) * (s - k)
}

/** Цель заливки 0…1: words — Map номер слова → { full, at }, n — слов во фразе, heardAt — последний непустой звук, done — итог пришёл (доезд до 100 %), edges — границы слов на пилюле */
export function fillGoal({ words, n, t, heardAt = -Infinity, done = false, edges = null }) {
  if (done) return 1
  const ahead = !words.size && t - heardAt < ADVANCE_MS ? FILL_ADVANCE : 0
  return edgeAt(Math.max(words.size, ahead), n || 1, edges)
}

/** Слово услышано (onWord): черновик запоминает время первого появления, подтверждение — full; все слова до него — подтверждены (их перекрыло следующее) */
export function markWord(words, index, draft, t) {
  const w = words.get(index)
  if (!w) words.set(index, { full: !draft, at: t })
  else if (!draft) w.full = true
  for (const [i, x] of words) if (i < index) x.full = true
}

/** Доезд после итога: fin = { at } — когда пришёл итог; shown — заливка на экране; onFull(t) — заливка впервые дошла до 100 %. Возвращает true, когда пора взлетать (дошла и подержалась, или кончился потолок) */
export function finishDue(fin, shown, t, onFull = null) {
  if (shown >= 1 - 1e-6 && fin.full == null) { fin.full = t; onFull?.(t) }
  return (fin.full != null && t - fin.full >= FILL_HOLD_MS) || t - fin.at >= FILL_FINISH_MAX_MS
}

/** Строка журнала: от последнего услышанного слова (wordAt) до 100 % заливки на экране */
export const fullLine = (wordAt, t) => `[phrases] последнее слово → 100 %: ${wordAt == null ? '—' : Math.round(t - wordAt)} мс`
