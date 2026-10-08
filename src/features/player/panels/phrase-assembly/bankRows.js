// Раскладка банка слов «Собери фразу» по строкам: при ≥ 4 чипах — ровно две строки,
// сбалансированные по суммарной ШИРИНЕ (а не по числу слов). Порядок чипов — порядок банка.
// Чистая функция: ширины меряет компонент (PhraseBank.jsx), здесь только арифметика.

// Меньше стольких чипов — одна строка по центру, ничего не режем
export const TWO_ROW_MIN = 4
// Допуск на дробные ширины (контейнер 288.4px, чипы суммарно 288.9px — ещё влезают)
const FIT_EPS = 0.5

// Возвращает индексы чипов, ПОСЛЕ которых ставится разрыв строки: [] — не резать (естественный
// перенос), [k] — две строки (первая 0..k), [i, j] — три строки (очень длинные слова на 320px).
// widths — ширины чипов в px, gap — зазор между чипами в строке, maxWidth — ширина контейнера.
export function splitBankRows(widths, gap, maxWidth) {
  const n = widths.length
  if (n < TWO_ROW_MIN) return []
  const pre = [0]
  widths.forEach(w => pre.push(pre[pre.length - 1] + w))
  // ширина строки из чипов a..b-1 (b не входит)
  const rowW = (a, b) => pre[b] - pre[a] + gap * (b - a - 1)
  const fits = w => w <= maxWidth + FIT_EPS

  let best = null
  for (let k = 1; k < n; k++) {
    const left = rowW(0, k), right = rowW(k, n)
    if (!fits(left) || !fits(right)) continue
    const diff = Math.abs(left - right)
    if (!best || diff < best.score - 0.01) best = { score: diff, cuts: [k - 1] }
  }
  if (best) return best.cuts

  // Две строки не помещаются — три, тоже балансом (минимум разброса ширин строк)
  for (let i = 1; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const rows = [rowW(0, i), rowW(i, j), rowW(j, n)]
      if (!rows.every(fits)) continue
      const spread = Math.max(...rows) - Math.min(...rows)
      if (!best || spread < best.score - 0.01) best = { score: spread, cuts: [i - 1, j - 1] }
    }
  }
  return best ? best.cuts : []
}
