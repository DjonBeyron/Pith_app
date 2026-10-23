// Ширина колонок таблицы по самому узкому экрану (iPhone SE: таблица 355px, как в редакторе таблиц — table-editor/tableAutoFitText.js).
// Правило автора: сначала КАЖДАЯ ячейка в одну строку (минимум переносов), и только потом баланс (колонки примерно равны). Чистые функции, без DOM:
// ширину текста оцениваем по числу символов (Montserrat ≈ 0,58 кегля на символ) — для линтера и генератора уроков (lesson-drafts/gen)
export const SE_TABLE_PX = 355
const PAD_X = 12 // .tableGridCell { padding: 8px 6px }
const CHAR_EM = 0.58
const TOLERANCE = 4

export const cellNeedPx = (value, fontSize = 13) => Math.ceil(String(value ?? '').length * fontSize * CHAR_EM) + PAD_X

/** Сколько px нужно каждой колонке, чтобы все её ячейки (без слияния по колонкам) стояли в одну строку */
export function columnNeeds(table) {
  const n = table.columns?.length ?? table.colCount ?? 0
  const needs = Array(n).fill(PAD_X + 12)
  for (const c of table.cells ?? []) if ((c.colspan ?? 1) === 1 && c.col < n) needs[c.col] = Math.max(needs[c.col], cellNeedPx(c.value, c.fontSize ?? 13))
  return needs
}

/** Целые проценты (сумма 100) из ширин в px: метод наибольших остатков */
function toPercents(px) {
  const total = px.reduce((s, v) => s + v, 0)
  const raw = px.map(v => (v / total) * 100)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((s, v) => s + v, 0)
  raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) out[i] += 1 })
  return out
}

/** Предложенные ширины колонок, %: влезает всё в одну строку — остаток выравнивает колонки; не влезает — короткие колонки не трогаем, длинные делят остаток */
export function suggestWidths(table, total = SE_TABLE_PX) {
  const needs = columnNeeds(table)
  if (!needs.length) return null
  const sum = needs.reduce((s, v) => s + v, 0)
  let px = [...needs]
  if (sum <= total) {
    let left = total - sum
    for (let guard = 0; left > 0.5 && guard < 50; guard++) {
      const min = Math.min(...px)
      const low = px.map((v, i) => (v === min ? i : -1)).filter(i => i >= 0)
      const next = Math.min(...px.filter(v => v > min), Infinity)
      const step = Math.min(next - min, left / low.length)
      low.forEach(i => { px[i] += step })
      left -= step * low.length
    }
  } else {
    const fair = total / needs.length
    const shortSum = needs.filter(v => v <= fair).reduce((s, v) => s + v, 0)
    const longSum = needs.filter(v => v > fair).reduce((s, v) => s + v, 0)
    px = needs.map(v => (v <= fair ? v : ((total - shortSum) * v) / longSum))
  }
  return toPercents(px)
}

/** Ячейки, которые при текущих ширинах колонок не помещаются в одну строку на узком экране */
export function wrappingCells(table, total = SE_TABLE_PX) {
  const cols = table.columns ?? []
  return (table.cells ?? []).filter(c => {
    const w = cols.slice(c.col, c.col + (c.colspan ?? 1)).reduce((s, k) => s + (k.widthPct ?? 0), 0) / 100 * total
    return w > 0 && cellNeedPx(c.value, c.fontSize ?? 13) > w + TOLERANCE
  })
}
