import { describe, it, expect } from 'vitest'
import { splitBankRows, TWO_ROW_MIN } from './bankRows.js'

// Ширины строк по результату разреза — для проверки баланса
function rowsOf(widths, gap, cuts) {
  const rows = []
  let from = 0
  for (const c of [...cuts, widths.length - 1]) {
    const part = widths.slice(from, c + 1)
    rows.push(part.reduce((s, w) => s + w, 0) + gap * (part.length - 1))
    from = c + 1
  }
  return rows
}

describe('splitBankRows — банк слов в две строки поровну по ширине', () => {
  it('меньше четырёх чипов — одна строка, разрывов нет', () => {
    expect(TWO_ROW_MIN).toBe(4)
    expect(splitBankRows([80], 8, 300)).toEqual([])
    expect(splitBankRows([80, 60, 90], 8, 300)).toEqual([])
  })

  it('четыре одинаковых — ровно пополам', () => {
    expect(splitBankRows([70, 70, 70, 70], 8, 300)).toEqual([1])
  })

  it('баланс по ширине, а не по числу слов: длинное слово в начале — вторая строка богаче словами', () => {
    // 200 | 40+40+40+40 (+3 gap) = 184 → разница 16, а «по два» дало бы 248 против 120
    const w = [200, 40, 40, 40, 40]
    const cuts = splitBankRows(w, 8, 400)
    expect(cuts).toEqual([0])
    const [a, b] = rowsOf(w, 8, cuts)
    expect(Math.abs(a - b)).toBeLessThan(20)
  })

  it('выбирает разрез с минимальной разницей среди всех', () => {
    const w = [50, 90, 60, 100, 40, 80]
    const cuts = splitBankRows(w, 8, 600)
    const best = [0, 1, 2, 3, 4].map(k => {
      const [a, b] = rowsOf(w, 8, [k])
      return { k, d: Math.abs(a - b) }
    }).sort((x, y) => x.d - y.d)[0]
    expect(cuts).toEqual([best.k])
  })

  it('порядок сохранён: разрез — один индекс «после какого чипа», чипы не переставляются', () => {
    const cuts = splitBankRows([60, 100, 70, 90, 50], 8, 400)
    expect(cuts).toHaveLength(1)
    expect(cuts[0]).toBeGreaterThanOrEqual(0)
    expect(cuts[0]).toBeLessThan(4)
  })

  it('две строки не влезают по ширине — три, тоже балансом', () => {
    // 320px: контейнер 288; шесть чипов по 120 → две строки по 3 = 376 > 288; по 2 → 248 — три строки
    const w = [120, 120, 120, 120, 120, 120]
    const cuts = splitBankRows(w, 8, 288)
    expect(cuts).toEqual([1, 3])
    expect(rowsOf(w, 8, cuts).every(r => r <= 288)).toBe(true)
  })

  it('разрез с лучшим балансом среди влезающих', () => {
    const w = [150, 30, 30, 30]
    // [0]: 150 | 106 (разница 44); [1]: 188 | 68; [2]: 226 | 30 — влезают все, баланс лучше у [0]
    expect(splitBankRows(w, 8, 250)).toEqual([0])
  })

  it('ничего не влезает даже в три строки — разрывов нет (естественный перенос)', () => {
    expect(splitBankRows([400, 400, 400, 400], 8, 288)).toEqual([])
  })
})
