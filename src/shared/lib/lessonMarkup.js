// Разметка выделений в тексте нод урока. ИИ плохо считает номера символов, поэтому вместо highlights [{start,end,...}]
// он пишет метки прямо в тексте, а раскраску (и обязательные правила: базовый серый на весь текст, цвет всегда с bold) строит код.
//   {g:слово}  зелёный + bold — английское слово/форма         {t:перевод} белый курсив (#fdfcfc), БЕЗ bold — русский перевод
//   {w:слово}  белый + bold — русский термин/заголовок (НЕ перевод)
//   {u:слово}  голубой + bold + подчёркивание — главный акцент {b:буква}  bold без цвета — буква внутри прозы
//   {l:слово}  главная мысль: текст остаётся серым, под ним белое подчёркивание (БЕЗ цвета и bold)
//   {x:слово}  лишнее / неверное: красный + зачёркнутый
//   {p:i}      плашка на 1–2 буквах внутри слова (y → i)       Метки не вкладываются друг в друга.
// Чистые функции, без React. Если разметки в тексте нет — данные возвращаются как есть (ручные highlights не трогаем).
/** Базовый серый всего текста нод: реальный серый цвет (раньше — белый с прозрачностью .75: это тяжелее в отрисовке и «гасило» белое подчёркивание) */
export const BASE_GRAY = '#c6c6c6'
const LEGACY_BASE = h => String(h.color).toLowerCase() === '#ffffff' && h.opacity === 0.75 // старый базовый: тоже считается базовым
/** Базовая подложка текста (новая или старая) */
export const isBaseHighlight = h => h.mode === 'text' && (String(h.color).toLowerCase() === BASE_GRAY || LEGACY_BASE(h))
const GREEN = '#b6fe3b', WHITE = '#ffffff', CYAN = '#6bfabc', DARK = '#12140d', TRANSLATION = '#fdfcfc', RED = '#ff5a5a'
const TEXT_KEYS = ['content', 'text', 'caption']
const MARK = /\{([gwtubplx]):([^}]*)\}/g

const hl = (start, end, mode, color, opacity = 1, extra = {}) => ({ end, mode, ...(color ? { color } : {}), start, ...(opacity != null ? { opacity } : {}), ...extra })

/** Есть ли в строке метки {g:..} */
export const hasMarkup = s => typeof s === 'string' && new RegExp(MARK.source).test(s)

/** Разобрать строку с метками → { text, highlights } */
export function parseMarkup(src) {
  let text = ''
  const segs = []
  const re = new RegExp(MARK.source, 'g')
  let last = 0, m
  while ((m = re.exec(src))) {
    text += src.slice(last, m.index)
    const start = text.length
    text += m[2]
    segs.push({ kind: m[1], start, end: text.length })
    last = re.lastIndex
  }
  text += src.slice(last)
  const highlights = [hl(0, text.length, 'text', BASE_GRAY, 1)]
  for (const s of segs) {
    const { kind: k, start: a, end: b } = s
    if (a === b) continue
    if (k === 'g') highlights.push(hl(a, b, 'text', GREEN), hl(a, b, 'bold', GREEN))
    if (k === 'w') highlights.push(hl(a, b, 'text', WHITE), hl(a, b, 'bold', WHITE))
    if (k === 't') highlights.push(hl(a, b, 'text', TRANSLATION), hl(a, b, 'italic', null, null))
    if (k === 'u') highlights.push(hl(a, b, 'text', CYAN), hl(a, b, 'bold', CYAN), hl(a, b, 'underline', CYAN))
    if (k === 'b') highlights.push(hl(a, b, 'bold', null, null))
    if (k === 'l') highlights.push(hl(a, b, 'underline', WHITE))
    if (k === 'x') highlights.push(hl(a, b, 'text', RED), hl(a, b, 'strike', RED))
    if (k === 'p') highlights.push(hl(a, b, 'bg', GREEN, 1, { pin: true }), hl(a, b, 'text', DARK))
  }
  return { text, highlights }
}

/**
 * Данные ноды при импорте: метки {g:..} → чистый текст + highlights; обычный текст без раскраски получает базовый серый на весь текст
 * (обязательное правило легенды — автору и ИИ о нём помнить не нужно). Ручные highlights без меток не трогаем.
 */
export function applyMarkup(data) {
  if (!data || typeof data !== 'object') return data
  const key = TEXT_KEYS.find(k => hasMarkup(data[k]))
  if (key) {
    const { text, highlights } = parseMarkup(data[key])
    return { ...data, [key]: text, highlights }
  }
  const plain = TEXT_KEYS.find(k => typeof data[k] === 'string' && data[k].length)
  if (plain && !(data.highlights?.length)) return { ...data, highlights: [hl(0, data[plain].length, 'text', BASE_GRAY, 1)] }
  return data
}

/** Какой метке {g:..}/{t:..}… соответствует сочетание стилей (null — нестандартное). Общая логика для toMarkup и подписи в панели раскраски */
export function classifyStyle({ color, bold, italic, underline, strike, pin }) {
  if (pin) return 'p'
  const eq = c => String(color ?? '').toLowerCase() === c
  if (eq(GREEN) && bold) return 'g'
  if (eq(TRANSLATION) || italic) return 't'
  if (eq(CYAN) && (underline || bold)) return 'u'
  if (eq(WHITE) && bold) return 'w'
  if (eq(WHITE) && underline && !bold) return 'l'
  if (eq(RED) && strike) return 'x'
  if (!color && bold) return 'b'
  return null
}
export const MARK_NAMES = { l: 'главное: белое подчёркивание', x: 'лишнее: красное зачёркнутое', g: 'английская форма', t: 'перевод', w: 'русский термин', u: 'главный акцент', b: 'буква в прозе', p: 'плашка на букве' }

/**
 * Обратное преобразование: текст + highlights → строка с метками {g:..}. Нужен, чтобы пример, раскрашенный в редакторе (тем же
 * инструментом, что и ноды), в промпте для ИИ выглядел разметкой. Понимает только стандартные сочетания (зелёный+bold, перевод #fdfcfc,
 * белый bold, акцент с подчёркиванием, bold, плашка); нестандартная раскраска остаётся простым текстом.
 */
export function toMarkup(text, highlights = []) {
  const byRange = new Map()
  for (const h of highlights) {
    if (isBaseHighlight(h)) continue // базовая подложка
    const k = `${h.start}:${h.end}`
    byRange.set(k, [...(byRange.get(k) ?? []), h])
  }
  const marks = []
  for (const [k, hs] of byRange) {
    const [start, end] = k.split(':').map(Number)
    const has = m => hs.some(h => h.mode === m)
    const color = (hs.find(h => h.mode === 'text' && h.color) ?? hs.find(h => h.color))?.color
    const kind = classifyStyle({ color, bold: has('bold'), italic: has('italic'), underline: has('underline'), strike: has('strike'), pin: hs.some(h => h.pin) })
    if (kind && start < end) marks.push({ start, end, kind })
  }
  marks.sort((a, b) => a.start - b.start)
  let out = '', pos = 0
  for (const m of marks) {
    if (m.start < pos) continue // пересечение — берём первую
    out += text.slice(pos, m.start) + `{${m.kind}:${text.slice(m.start, m.end)}}`
    pos = m.end
  }
  return out + text.slice(pos)
}
