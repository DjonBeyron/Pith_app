// Что за стиль у выделенного текста — для панели раскраски (RichTextToolbar): цвет, прозрачность, жирный/курсив/подчёркнутый/зачёркнутый,
// плашка, и если сочетание стандартное — название метки {g:..}/{t:..} (lessonMarkup.js). Чистая функция, без React.
import { classifyStyle, MARK_NAMES } from './lessonMarkup.js'

const hasMode = (hs, i, m) => hs.some(h => h.mode === m && h.start <= i && h.end > i)

/** Стиль одного символа */
function charStyle(hs, i) {
  const text = [...hs].reverse().find(h => h.mode === 'text' && h.start <= i && h.end > i) // верхний слой побеждает
  const bg = [...hs].reverse().find(h => h.mode === 'bg' && h.start <= i && h.end > i)
  return {
    color: text?.color ?? null, opacity: text?.opacity ?? null,
    bg: bg ? { color: bg.color, opacity: bg.opacity ?? 1, outline: !!bg.outline, pin: !!bg.pin } : null,
    bold: hasMode(hs, i, 'bold'), italic: hasMode(hs, i, 'italic'), underline: hasMode(hs, i, 'underline'), strike: hasMode(hs, i, 'strike'),
  }
}

/**
 * Описание стиля участка [start, end). mixed — в участке больше одного стиля (тогда показываем первый и пометку).
 * @returns {{mixed: boolean, color: string|null, opacity: number|null, bg: object|null, flags: string[], mark: string|null, markName: string|null, isBase: boolean}}
 */
export function describeStyle(highlights, start, end) {
  const hs = highlights ?? []
  if (!(end > start)) return null
  const first = charStyle(hs, start)
  let mixed = false
  for (let i = start + 1; i < end && !mixed; i++) mixed = JSON.stringify(charStyle(hs, i)) !== JSON.stringify(first)
  const flags = ['bold', 'italic', 'underline', 'strike'].filter(f => first[f])
  const mark = classifyStyle({ color: first.color, bold: first.bold, italic: first.italic, underline: first.underline, pin: !!first.bg?.pin })
  const isBase = String(first.color ?? '').toLowerCase() === '#ffffff' && first.opacity === 0.75 && !flags.length && !first.bg
  return { mixed, color: first.color, opacity: first.opacity, bg: first.bg, flags, mark, markName: mark ? MARK_NAMES[mark] : null, isBase }
}
