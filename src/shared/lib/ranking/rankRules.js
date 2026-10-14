import { seeded } from './seeded.js'

// Жёсткие правила ре-ранжирования — отдельно от весов (rankWeighted.js вызывает
// их после сортировки по score). Все — чистые функции над массивом ranked
// ({ module, ... }), возвращают новый массив, вход не мутируют.

// Каждая N-я позиция — случайная фраза из хвоста (как подмешка в legacy rankFeed:
// pos 5, 11, 17… меняется с случайной позицией дальше). seed — сид дня: порядок
// стабилен в течение дня. every ≤ 0 — правило выключено
export function applyExploreSlots(ranked, every, seed = 1) {
  if (!every || every < 2 || ranked.length < every + 1) return ranked
  const out = ranked.slice()
  const rand = seeded(seed)
  for (let pos = every - 1; pos < out.length - 1; pos += every) {
    const j = pos + 1 + Math.floor(rand() * (out.length - pos - 1))
    ;[out[pos], out[j]] = [out[j], out[pos]]
    out[pos] = { ...out[pos], reasons: [...(out[pos].reasons ?? []), 'подмешана из хвоста'] }
  }
  return out
}

// Не больше maxInRow слайдов одного типа подряд. Тип — module[typeKey]; если ни у
// одного модуля типа нет (сейчас все слайды — видео-фразы) — правило пропускается
// (возвращает { applied:false }). Сдвигает ближайший слайд другого типа вверх
export function applyMaxSameTypeInRow(ranked, maxInRow, typeKey = 'type') {
  if (!maxInRow || maxInRow < 1) return { ranked, applied: false }
  if (!ranked.some(r => r.module?.[typeKey] != null)) return { ranked, applied: false }
  const out = ranked.slice()
  let run = 0
  for (let i = 1; i < out.length; i++) {
    const t = out[i].module?.[typeKey] ?? null
    run = t === (out[i - 1].module?.[typeKey] ?? null) ? run + 1 : 0
    if (run < maxInRow) continue
    const j = out.findIndex((r, k) => k > i && (r.module?.[typeKey] ?? null) !== t)
    if (j === -1) break
    const [moved] = out.splice(j, 1)
    out.splice(i, 0, { ...moved, reasons: [...(moved.reasons ?? []), 'разбавляет серию одного типа'] })
    run = 0
  }
  return { ranked: out, applied: true }
}
