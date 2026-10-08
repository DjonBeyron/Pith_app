// Геометрия полоски фразы «Ловли слов» (CatchStripPhrase.jsx) — без DOM: работает с готовыми прямоугольниками
// (getBoundingClientRect), чтобы проверяться тестами (catchStripGeom.test.js).

import { REGION_PAD, REGION_VPAD } from '../phraseBubbleRegions.js'

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

// Зазор между низом слова и подчёркиванием: запас облачка снизу (REGION_VPAD) + ещё 3px — полоска ложится по нижнему
// краю бахромы облачка, а не поверх плотной части
export const UNDERLINE_GAP = REGION_VPAD + 3

// Положение подчёркивания под облачком относительно обёртки полоски: { x, y, w } — левый край, верх (низ слова + gap),
// ширина. Подчёркивание стоит под облачком целиком, а не только под словом: ширина слова + запас облачка (padX =
// REGION_PAD) с каждой стороны. span/wrap — прямоугольники (clientRect) span'а слова и обёртки
export function underlineBox(span, wrap, gap = UNDERLINE_GAP, padX = REGION_PAD) {
  return { x: span.left - wrap.left - padX, y: span.bottom - wrap.top + gap, w: span.right - span.left + padX * 2 }
}
