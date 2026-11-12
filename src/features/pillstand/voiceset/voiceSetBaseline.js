// Базовая линия прогона «Записи набора» (CONCEPT_VOICESET.md, scripts/voice-set-regress.mjs): по строкам результатов — сколько клипов каждого вида сработало как ожидали
// ({ 'whole': { ok: 16, total: 16 }, … }) и сверка с записанной линией. Регрессия — клипов «верно» стало МЕНЬШЕ, чем в линии (по виду, по набору), с допуском в TOL клипов
// для пограничных видов: подача идёт в реальном времени, и клип на границе (голос 230 мс при нужных 240, уверенность 0,66 у порога 0,6) в соседних прогонах срабатывает по-разному.
// Строгие виды (целые слова, шум, тишина, целые фразы) — без допуска. Больше — не ошибка: «улучшилось» (линию обновляют вручную: --update). Чистые функции — без файлов и браузера.
import { groupOf, rowOk } from './voiceSetTable.js'

export const STRICT = new Set(['whole', 'noise', 'long', 'phrase whole'])
export const TOL = 1 // допуск пограничных видов (fast, quiet, nolast, half, phrase cutlast …), клипов

/** rows — строки results.json (--repeat даёт несколько строк на клип: считаются все). → { вид: { ok, total } } */
export function aggregate(rows) {
  const out = {}
  for (const r of rows) {
    const g = groupOf(r), a = (out[g] ??= { ok: 0, total: 0 })
    a.total += 1
    if (rowOk(r)) a.ok += 1
  }
  return out
}

/** base — линия набора, now — прогон. → { regress: [строка], better: [строка], missing: [вид] } */
export function compareBaseline(base, now, tol = TOL) {
  const regress = [], better = [], missing = []
  for (const [g, b] of Object.entries(base ?? {})) {
    const n = now[g]
    if (!n) { missing.push(g); continue }
    if (n.total !== b.total) { missing.push(`${g} (клипов ${n.total}, в линии ${b.total})`); continue }
    if (n.ok < b.ok - (STRICT.has(g) ? 0 : tol)) regress.push(`${g}: верно ${n.ok} из ${n.total}, в линии ${b.ok}`)
    else if (n.ok > b.ok) better.push(`${g}: верно ${n.ok} из ${n.total}, в линии ${b.ok}`)
  }
  return { regress, better, missing }
}
