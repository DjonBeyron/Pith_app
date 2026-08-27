import { diffTextEdit } from './textEditDiff.js'

// Shared highlight utilities for canvas editor and player.
// Highlight format: { start, end, color, mode, opacity }
//
// Режимы делятся на два вида:
//   'text' | 'bg'                     — как красим сам текст: цветом букв или
//                                       плашкой (у плашки outline: true —
//                                       только рамка, без заливки);
//   'bold' | 'italic' | 'underline' | 'strike' — ДЕКОРАЦИИ: накладываются
//                                       поверх любого из первых двух и друг
//                                       на друга.
// bg имеет приоритет отображения над цветом текста на одних и тех же буквах.
// Оба могут сосуществовать — ПКМ снимает их по одному (сначала плашку).
export const DECOR_MODES = ['bold', 'italic', 'underline', 'strike']

export function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

export function sameStyle(a, b) {
  return a && b && a.color === b.color && a.mode === b.mode && a.opacity === b.opacity &&
    !!a.outline === !!b.outline
}

export function bridgeSpans(spans) {
  return spans.map((s, i) => {
    // Перенос строки не «мостим»: подсветка, натянутая через \n, залила бы
    // прямоугольник от конца одной строки до начала другой
    if (!s.h && /^[^\S\n]+$/.test(s.text) && sameStyle(spans[i - 1]?.h, spans[i + 1]?.h))
      return { ...s, h: spans[i - 1].h }
    return s
  })
}

// Делит текст спана на строки. Фон выделения рисуется абсолютным слоем внутри
// строчного элемента, а у многострочного элемента этот слой охватывает обе
// строки разом — заливка уезжает через весь пузырь. Поэтому каждая строка
// получает свой спан, а переносы выносятся между ними отдельными <br>.
export function splitLines(text) {
  return text.split('\n')
}

// Builds flat span array from text + highlights for rendering.
// bg has display priority over text-color on the same position.
// Returns [{ text, h: display_highlight|null }]
export function buildSpans(text, highlights = []) {
  if (!highlights.length) return [{ text, h: null, bold: false, italic: false, underline: null, strike: null }]
  const bgMap   = new Array(text.length).fill(null)
  const textMap = new Array(text.length).fill(null)
  // Декорации — отдельные слои: они сочетаются и с плашкой, и с цветом текста,
  // поэтому не спорят с ними за отображение, а просто накладываются сверху.
  // Храним само выделение, а не флаг: у подчёркивания и зачёркивания свой цвет
  const decorMaps = Object.fromEntries(
    DECOR_MODES.map(m => [m, new Array(text.length).fill(null)]))
  for (const h of highlights) {
    for (let i = h.start; i < h.end && i < text.length; i++) {
      if (decorMaps[h.mode]) decorMaps[h.mode][i] = h
      else if (h.mode === 'bg') bgMap[i] = h
      else textMap[i] = h
    }
  }
  // Display: bg wins; text-color can still show inside bg (as textUnder)
  const dispMap = bgMap.map((bg, i) => bg ?? textMap[i])
  const spans = []
  let i = 0
  while (i < text.length) {
    const h = dispMap[i]
    let j = i + 1
    while (j < text.length && dispMap[j] === h && textMap[j] === textMap[i] &&
           DECOR_MODES.every(m => decorMaps[m][j] === decorMaps[m][i])) j++
    const textUnder = h?.mode === 'bg' ? textMap[i] : null
    spans.push({
      text: text.slice(i, j), h, textUnder,
      bold: !!decorMaps.bold[i],
      italic: !!decorMaps.italic[i],
      underline: decorMaps.underline[i],
      strike: decorMaps.strike[i],
    })
    i = j
  }
  return spans
}

// Стиль декораций спана — общий для всех трёх мест рендера (канвас-редактор,
// пузырь чата, печатающийся текст плеера), чтобы они не разъезжались.
// Подчёркивание и зачёркивание красятся своим цветом, а не цветом букв.
export function decorStyle(span) {
  const lines = []
  if (span?.underline) lines.push('underline')
  if (span?.strike)    lines.push('line-through')
  const src = span?.underline ?? span?.strike
  return {
    ...(span?.bold ? { fontWeight: 700 } : {}),
    ...(span?.italic ? { fontStyle: 'italic' } : {}),
    ...(lines.length ? {
      textDecorationLine: lines.join(' '),
      ...(src?.color ? { textDecorationColor: hexToRgba(src.color, src.opacity ?? 1) } : {}),
      // Em-относительные (не px): фиксированный офсет был одинаково мал и в
      // мелком чат-пузыре, и в крупном превью — на жирных буквах с засечкой
      // (например «р») линия оказывалась впритык и визуально их перечёркивала.
      textDecorationThickness: '0.08em',
      textUnderlineOffset: '0.15em',
      textDecorationSkipInk: 'auto',
    } : {}),
  }
}

// Adds a new highlight. Same-mode overlaps are trimmed; different-mode overlaps are kept (stacking).
export function addHighlight(prev, newH) {
  const result = []
  for (const h of prev) {
    const overlaps = h.end > newH.start && h.start < newH.end
    if (!overlaps || h.mode !== newH.mode) {
      result.push(h) // no overlap OR different mode (keep both)
    } else {
      // same mode overlap: trim existing
      if (h.start < newH.start) result.push({ ...h, end: newH.start })
      if (h.end   > newH.end)   result.push({ ...h, start: newH.end })
    }
  }
  result.push(newH)
  return result.sort((a, b) => a.start - b.start)
}

// Полностью ли участок уже закрашен выделением этого режима (и, если задан,
// именно этим цветом). По этому признаку повторное выделение того же слова
// снимает раскраску, а не красит поверх.
export function rangeHasStyle(highlights, start, end, mode, color) {
  for (let i = start; i < end; i++) {
    const covers = highlights.some(h =>
      h.mode === mode && h.start <= i && h.end > i &&
      (color == null || h.color === color))
    if (!covers) return false
  }
  return true
}

// Вырезает выделения указанного режима из участка, оставляя хвосты снаружи
export function removeRange(highlights, start, end, mode) {
  const out = []
  for (const h of highlights) {
    if (h.mode !== mode || h.end <= start || h.start >= end) { out.push(h); continue }
    if (h.start < start) out.push({ ...h, end: start })
    if (h.end > end) out.push({ ...h, start: end })
  }
  return out.sort((a, b) => a.start - b.start)
}

// Снимает ВСЕ виды выделения (цвет, плашку, декорации) с диапазона разом —
// кнопка «очистить формат» в плавающем тулбаре. removeRange/removeHighlightAt
// снимают по одному слою за раз, это для полного сброса одним действием.
export function clearRange(highlights, start, end) {
  return [...DECOR_MODES, 'text', 'bg'].reduce((hl, mode) => removeRange(hl, start, end, mode), highlights)
}

// Right-click removal: removes highest-priority highlight at position.
// Порядок снятия: плашка → цвет текста → декорации, по клику за раз.
export function removeHighlightAt(highlights, pos) {
  const atPos = highlights.filter(h => h.start <= pos && h.end > pos)
  if (!atPos.length) return highlights
  const toRemove = atPos.find(h => h.mode === 'bg')
    ?? atPos.find(h => h.mode === 'text')
    ?? atPos[0]
  return highlights.filter(h => h !== toRemove)
}

// Returns CSS style object for a highlight (or empty object for null).
export function highlightStyle(h) {
  if (!h) return {}
  const c = hexToRgba(h.color, h.opacity ?? 1)
  if (h.mode !== 'bg') return { color: c }
  const box = { borderRadius: 3, padding: '1px 3px', lineHeight: 1, display: 'inline', verticalAlign: 'baseline' }
  // Плашка-обводка: рамка цветом, внутри ничего не заливаем
  return h.outline
    ? { ...box, boxShadow: `inset 0 0 0 1.5px ${c}` }
    : { ...box, background: c }
}

// Legacy: word-based char map used by audio module.
export function buildCharStyles(text, highlights = []) {
  if (!highlights.length) return null
  const styles = new Array(text.length).fill(null)
  const lower  = text.toLowerCase()
  for (const h of highlights) {
    const word = h.word.toLowerCase()
    let start  = 0
    while (start < lower.length) {
      const idx = lower.indexOf(word, start)
      if (idx === -1) break
      for (let i = idx; i < idx + h.word.length; i++) styles[i] = h
      start = idx + h.word.length
    }
  }
  return styles
}

// Текст правят не только набором с клавиатуры: смайлик из окна вставляется
// прямо в позицию курсора. Выделения хранятся позициями в строке, поэтому
// после вставки их нужно сдвинуть — иначе раскраска «съезжает» на соседние
// буквы. Кусок, попавший под замену (выделенный текст), схлопывается.
export function shiftHighlights(highlights, start, end, insertedLength) {
  const delta = insertedLength - (end - start)
  if (!highlights?.length || !delta) return highlights ?? []
  const moved = highlights.map(h => {
    // целиком до места вставки — не двигается
    if (h.end <= start) return h
    // целиком после — едет на дельту
    if (h.start >= end) return { ...h, start: h.start + delta, end: h.end + delta }
    // вставка внутри выделения — оно растягивается на новую длину
    return { ...h, end: Math.max(h.start, h.end + delta) }
  })
  return moved.filter(h => h.end > h.start)
}

// То же самое, но для обычного набора текста (печать/Backspace/Delete/paste
// в textarea), где нет готового {start,end,insertedLength} — есть только
// текст до и после правки. diffTextEdit восстанавливает эту тройку по разнице
// строк и текущей каретке, дальше работает как обычный shiftHighlights.
export function shiftHighlightsForEdit(highlights, oldText, newText, postCaret) {
  if (!highlights?.length) return highlights ?? []
  const { start, end, insertedLength } = diffTextEdit(oldText, newText, postCaret)
  return shiftHighlights(highlights, start, end, insertedLength)
}
