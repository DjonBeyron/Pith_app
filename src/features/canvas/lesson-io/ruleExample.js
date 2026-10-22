// Примеры «нельзя / можно» у правил: последовательность «пузырей» (нод) — [{ type, content, highlights, hardWrap }].
// В базе лежит строкой (колонки bad_example / good_example): либо JSON такого массива (сохранено окном правил), либо простой текст
// с метками {g:..} и строками «тип: содержимое» (так записан стандартный набор). Чистые функции, без React.
import { parseMarkup, toMarkup, hasMarkup, BASE_GRAY } from '../../../shared/lib/lessonMarkup.js'

export const EXAMPLE_TYPES = [
  ['text', 'Текст'], ['reaction', 'Реакция'], ['audio', 'Голос'], ['pin_message', 'Закреп'], ['system', 'Заголовок'],
  ['photo', 'Фото'], ['word_choice', 'Выбор слова'], ['phrase_assembly', 'Собери фразу'], ['type_word', 'Напечатай'], ['say_phrase', 'Скажи'],
  ['sticker', 'Стикер'], ['table', 'Таблица'], ['fill_blanks', 'Составь предложение'], ['photo_choice', 'Выбери фото'], ['lesson_ref', 'Ссылка на урок'],
]
const KNOWN = new Set(EXAMPLE_TYPES.map(([t]) => t))
const BASE = len => ({ start: 0, end: len, mode: 'text', color: BASE_GRAY, opacity: 1 })

const bubble = (type, raw) => {
  const { text, highlights } = hasMarkup(raw) ? parseMarkup(raw) : { text: raw, highlights: [BASE(raw.length)] }
  return { type, content: text, highlights: text ? highlights : [], hardWrap: false }
}

/** Строка из базы → пузыри. Пусто → [] */
export function parseExample(value) {
  const src = String(value ?? '').trim()
  if (!src) return []
  if (src.startsWith('[')) {
    try {
      const arr = JSON.parse(src)
      if (Array.isArray(arr)) return arr.map(b => ({ type: KNOWN.has(b.type) ? b.type : 'text', content: String(b.content ?? ''), highlights: b.highlights ?? [], hardWrap: !!b.hardWrap }))
    } catch { /* обычный текст */ }
  }
  return src.split('\n').filter(l => l.trim()).map(line => {
    const m = line.match(/^([a-z_]+):\s?(.*)$/)
    return m && KNOWN.has(m[1]) ? bubble(m[1], m[2]) : bubble('text', line)
  })
}

/** Пузыри → строка для базы (JSON); пустой пример → '' */
export const serializeExample = bubbles => (bubbles.some(b => b.content.trim()) ? JSON.stringify(bubbles) : '')

/** Пример → текст для промпта ИИ: по строке на ноду «тип: содержимое», выделения — метками {g:..} */
export const exampleToPrompt = value => parseExample(value).map(b => `${b.type}: ${toMarkup(b.content, b.highlights)}`).join('\n')

export const newBubble = (type = 'text') => ({ type, content: '', highlights: [], hardWrap: false })
