import { regionsKey } from '../phraseBubbleRegions.js'

// Замер слов фразы в полоске «Ловли слов» (CatchStripPhrase): единственное место, где «Ловля» читает DOM-геометрию слов.
// phrase — элемент с span'ами слов (data-index). Возвращает:
//   regions — прямоугольники слов { x, y, w, h } относительно текстового блока спойлера (.phraseBubbleWrap — от него
//             PhraseBubbleAnimated кладёт сетку шариков) в порядке слов;
//   widths  — { [index слова]: ширина } для слотов строки набранного (CatchTypedLine);
//   sig     — подпись набора, чтобы не пересобирать то, что не изменилось.
export function measureWords(phrase) {
  const origin = (phrase.closest('.phraseBubbleWrap') ?? phrase).getBoundingClientRect()
  const regions = []
  const widths = {}
  for (const el of phrase.querySelectorAll('[data-index]')) {
    const r = el.getBoundingClientRect()
    regions.push({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height })
    widths[el.dataset.index] = r.width
  }
  return { regions, widths, sig: `${regionsKey(regions)}#${Object.values(widths).map(w => Math.round(w * 2)).join(',')}` }
}

// Естественная ширина фразы в одну строку при масштабе 1 (catchFit.js): phrase — блок фразы, scale — масштаб, применённый
// сейчас. Ширина меряется при white-space: nowrap (на время замера — прямо в style), блок спойлера — inline-block по
// содержимому, поэтому его ширина и есть длина строки; делим на масштаб: ширина строки растёт пропорционально шрифту
export function naturalWidth(phrase, scale) {
  const prev = phrase.style.whiteSpace
  phrase.style.whiteSpace = 'nowrap'
  const w = (phrase.closest('.phraseBubbleWrap') ?? phrase).getBoundingClientRect().width
  phrase.style.whiteSpace = prev
  return w / scale
}
