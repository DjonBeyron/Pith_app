// Разметка выделений в тексте нод урока. ИИ плохо считает номера символов, поэтому вместо highlights [{start,end,...}]
// он пишет метки прямо в тексте, а раскраску (и обязательные правила: базовый серый на весь текст, цвет всегда с bold) строит код.
//   {g:слово}  зелёный + bold — английское слово/форма         {t:перевод} белый курсив (#fdfcfc), БЕЗ bold — русский перевод
//   {w:слово}  белый + bold — русский термин/заголовок (НЕ перевод)
//   {u:слово}  голубой + bold + подчёркивание — главный акцент {b:буква}  bold без цвета — буква внутри прозы
//   {p:i}      плашка на 1–2 буквах внутри слова (y → i)       Метки не вкладываются друг в друга.
// Чистые функции, без React. Если разметки в тексте нет — данные возвращаются как есть (ручные highlights не трогаем).
const GREEN = '#b6fe3b', WHITE = '#ffffff', CYAN = '#6bfabc', DARK = '#12140d', TRANSLATION = '#fdfcfc'
const TEXT_KEYS = ['content', 'text', 'caption']
const MARK = /\{([gwtubp]):([^}]*)\}/g

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
  const highlights = [hl(0, text.length, 'text', WHITE, 0.75)]
  for (const s of segs) {
    const { kind: k, start: a, end: b } = s
    if (a === b) continue
    if (k === 'g') highlights.push(hl(a, b, 'text', GREEN), hl(a, b, 'bold', GREEN))
    if (k === 'w') highlights.push(hl(a, b, 'text', WHITE), hl(a, b, 'bold', WHITE))
    if (k === 't') highlights.push(hl(a, b, 'text', TRANSLATION), hl(a, b, 'italic', null, null))
    if (k === 'u') highlights.push(hl(a, b, 'text', CYAN), hl(a, b, 'bold', CYAN), hl(a, b, 'underline', CYAN))
    if (k === 'b') highlights.push(hl(a, b, 'bold', null, null))
    if (k === 'p') highlights.push(hl(a, b, 'bg', GREEN, 1, { pin: true }), hl(a, b, 'text', DARK))
  }
  return { text, highlights }
}

/** Данные ноды: если текстовое поле содержит метки — заменить его чистым текстом и построить highlights. Иначе вернуть как есть */
export function applyMarkup(data) {
  if (!data || typeof data !== 'object') return data
  const key = TEXT_KEYS.find(k => hasMarkup(data[k]))
  if (!key) return data
  const { text, highlights } = parseMarkup(data[key])
  return { ...data, [key]: text, highlights }
}
