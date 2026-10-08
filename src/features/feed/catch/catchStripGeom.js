// Геометрия полоски фразы «Ловли слов» (CatchStripPhrase.jsx) — без DOM: работает с готовыми прямоугольниками
// (getBoundingClientRect), чтобы проверяться тестами (catchStripGeom.test.js).

// Слово под точкой тапа по массе шариков. rects — [{ index, left, top, right, bottom }] span'ов слов.
// Сначала точное попадание с допуском pad (палец шире буквы, строки узкие); иначе — ближайшее по горизонтали слово
// в той строке, куда попал палец (тап в пробел между словами); мимо всех строк → null
export function hitWordIndex(rects, x, y, pad = 6) {
  let best = null
  let bestD = Infinity
  for (const r of rects) {
    if (y < r.top - pad || y > r.bottom + pad) continue
    if (x >= r.left - pad && x <= r.right + pad) return r.index
    const d = x < r.left ? r.left - x : x - r.right
    if (d < bestD) { bestD = d; best = r.index }
  }
  return best
}

// Зазор между низом слова и подчёркиванием: ниже бахромы массы шариков (MARGIN_Y канваса ≈ 9px — полоска
// ложится по её нижнему краю, а не поверх плотной части)
export const UNDERLINE_GAP = 5

// Положение подчёркивания под словом относительно обёртки полоски: { x, y, w } — левый край, верх (низ слова + gap),
// ширина слова. span/wrap — прямоугольники (clientRect) span'а слова и обёртки
export function underlineBox(span, wrap, gap = UNDERLINE_GAP) {
  return { x: span.left - wrap.left, y: span.bottom - wrap.top + gap, w: span.right - span.left }
}
