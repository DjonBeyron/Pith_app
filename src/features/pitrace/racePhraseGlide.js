// Заливка прохода 2 «Скажи» ПО РАСПОЗНАННЫМ СЛОВАМ без «ступенек» (решение владельца 2026-11-08: «бывает, я не говорю, а просто шум — пилюля заполняется»; отменяет заливку «под звук» из v3.3.165).
// Уровень микрофона заливку больше не двигает — только слова цели от слушателя (onWord, и черновик). Цель — граница последнего услышанного слова (edgeAt по границам слов на пилюле), как в проходе 1.
// ПЛАВНОСТЬ: пока слова приходят подряд (средний интервал между новыми словами попытки ≤ GLIDE_GAP_MS), линия после слова k не стоит, а идёт с постоянной скоростью к границе слова k+1 и
// доходит до неё за этот интервал (не быстрее GLIDE_MIN_MS) — к моменту, когда слово k+1 ожидается. Дальше границы слова k+1, пока оно не услышано, линия не идёт: слово не пришло — стоит
// (не откатывается). Первое слово, редкие слова (интервал больше GLIDE_GAP_MS) — без ведения, ровно до границы. 100 % — только по итогу фразы (done).
// Журнал: «[fill] режим по словам: слово k → граница 0,50[, веду к границе слова k+1 за N мс]» — на каждом новом слове; «[fill] режим по словам: слово k+1 не пришло — линия стоит на 0,62».
import { edgeAt } from './racePhraseFill.js'

export const GLIDE_GAP_MS = 400 // слова чаще этого — линия идёт к следующей границе одним движением
export const GLIDE_MIN_MS = 200 // ведение к следующей границе — не быстрее (слова пачкой в одном черновике)

const num = v => (Number(v) || 0).toFixed(2).replace('.', ',')

/** → { word(index, t), goal({ t, edges, done }), value() }. n — слов во фразе; log — журнал «[fill] …» */
export function createGlide({ n, log = () => {} }) {
  let v = 0, anchor = 0, firstAt = null, firstAnchor = 0, lastAt = 0, from = 0, ms = 0, gliding = false, pending = null
  const say = line => { try { log(line) } catch { /* журнал не мешает */ } }
  return {
    /** Слушатель отдал слово index (черновик или итог), t — сейчас */
    word(index, t) {
      if (index + 1 <= anchor) return
      anchor = Math.min(n, index + 1)
      if (firstAt == null) { firstAt = t; firstAnchor = anchor }
      const avg = anchor > firstAnchor ? (t - firstAt) / (anchor - firstAnchor) : Infinity
      lastAt = t; ms = anchor < n && avg <= GLIDE_GAP_MS ? Math.max(GLIDE_MIN_MS, avg) : 0
      from = null; gliding = ms > 0; pending = anchor
    },
    /** Цель на кадр: edges — границы слов (mask.edges) или null, done — итог фразы (100 %) */
    goal({ t, edges = null, done = false }) {
      if (done) return (v = 1)
      const floor = edgeAt(anchor, n, edges)
      v = Math.max(v, floor)
      if (pending != null) { pending = null; from = v; say(`[fill] режим по словам: слово ${anchor} → граница ${num(floor)}${ms ? `, веду к границе слова ${anchor + 1} за ${Math.round(ms)} мс` : ''}`) }
      if (gliding) {
        const next = edgeAt(anchor + 1, n, edges), k = Math.min(1, (t - lastAt) / ms)
        v = Math.max(v, Math.min(next, from + (next - from) * k))
        if (k >= 1) { gliding = false; say(`[fill] режим по словам: слово ${anchor + 1} не пришло — линия стоит на ${num(v)}`) }
      }
      return v
    },
    value: () => v,
  }
}
