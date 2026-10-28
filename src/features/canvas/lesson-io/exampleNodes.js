// Пример правила («нельзя» / «можно» — пузыри {type, content}) → ноды обменного формата (exportLesson.js: ref, seq, type, data, triggers),
// чтобы прогнать пример через линтер (lintEffectiveness.test.js) или собрать из примеров судьи проверочный урок (scripts/lesson-eval.mjs).
// Чистая функция. Поле data — по типу ноды (как в легенде); цепочка — через «успешный» переход типа.
// Атрибуты в скобках в начале или конце строки — поля ноды: «audio: (showText: false) текст», «type_word: go to Paris (extraLetters: xzq)»,
// «table: (dictator, sendToChat: true, triggers: table_correct → n5)», «text: (seq 5, replyToSeq 7) да»; голое слово — режим (mode)
import { parseExample } from './ruleExample.js'
import { toMarkup } from '../../../shared/lib/lessonMarkup.js'

const NEXT = { audio: 'played', word_choice: 'word_correct', phrase_assembly: 'phrase_correct', type_word: 'type_correct', say_phrase: 'say_done', photo_choice: 'photo_correct', table: 'table_correct', fill_blanks: 'fill_correct' }
const MODES = new Set(['dictator', 'demo', 'manual'])

const value = v => (v === 'true' ? true : v === 'false' ? false : /^-?\d+$/.test(v) ? Number(v) : /^\[.*\]$/s.test(v) ? v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean) : v)

/** «(a: 1, dictator, triggers: played → n5)» → { attrs, triggers } */
function parseAttrs(src) {
  const attrs = {}, triggers = []
  for (const part of src.split(/,(?![^[]*\])/)) {
    const m = part.trim().match(/^([a-zA-Z_]+)\s*[:=]?\s*(.*)$/)
    if (!m) continue
    const [, k, v] = m
    if (k === 'triggers') { const t = v.match(/^(\w+)\s*→\s*(\S+)$/); if (t) triggers.push({ if: t[1], then: t[2] }); continue }
    if (!v && MODES.has(k)) { attrs.mode = k; continue }
    attrs[k] = value(v.trim())
  }
  return { attrs, triggers }
}

/** Отделяет атрибуты в скобках от текста: «(seq 5, replyToSeq 7) да» → { text: 'да', attrs } */
export function splitAttrs(raw) {
  const m = raw.match(/^\(([^()]*)\)\s*(.*)$/s) || raw.match(/^(.*?)\s*\(([^()]*(?:[:=]|dictator|demo|manual)[^()]*)\)$/s)
  if (!m) return { text: raw, attrs: {}, triggers: [] }
  const [attrsSrc, text] = raw.startsWith('(') ? [m[1], m[2]] : [m[2], m[1]]
  return { text, ...parseAttrs(attrsSrc) }
}

function dataOf(type, text) {
  switch (type) {
    case 'audio': return { text, showText: true }
    case 'photo': case 'sticker': return { caption: text, imagePrompt: 'пример' }
    case 'reaction': return { emoji: text }
    case 'word_choice': {
      const [q, opts = ''] = text.includes('?') ? text.split(/\?\s*/, 2) : ['', text]
      const options = opts.split('/').map((t, i) => ({ text: t.trim(), isCorrect: i === 0 })).filter(o => o.text)
      return { question: q.trim(), options, responseCorrect: '', responseWrong: '' }
    }
    case 'phrase_assembly': return { words: text.split(/\s+/).filter(Boolean), distractors: [], responseCorrect: '', responseWrong: '' }
    case 'type_word': return { word: text, responseCorrect: '', responseWrong: '' }
    case 'say_phrase': return { phrase: text, translation: '', keywords: '' }
    case 'table': return { mode: 'dictator', chatCaption: text, script: text, table: { cells: text.split('·').map(v => ({ value: v.trim() })).filter(c => c.value) }, answer: '', sendToChat: true }
    case 'fill_blanks': return { template: text, blanks: [], responseCorrect: '', responseWrong: '' }
    default: return { content: text }
  }
}

/** value — строка примера из базы; prefix — префикс ref (b3-, g3-); seq0 — первый seq. → ноды в цепочке */
export function exampleNodes(value, { prefix = 'n', seq0 = 1 } = {}) {
  const bubbles = parseExample(value)
  return bubbles.map((b, i) => {
    const { text, attrs, triggers } = splitAttrs(toMarkup(b.content, b.highlights))
    const { seq, note, ...rest } = attrs
    const ref = `${prefix}${i + 1}`
    const next = i + 1 < bubbles.length ? `${prefix}${i + 2}` : null
    const data = { ...dataOf(b.type, text), ...rest }
    if (Array.isArray(data.answers)) data.answers = data.answers.map(a => (Array.isArray(a) ? a : String(a).split(/\s+/))) // answers: [Every day we try] — другой порядок слов
    const tr = triggers.length ? triggers : next ? [{ if: NEXT[b.type] ?? 'timer', then: next }] : []
    return { ref, seq: seq ?? seq0 + i, type: b.type, data, triggers: tr, ...(note ? { note } : {}) }
  })
}
