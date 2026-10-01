// Справка слова («карточка слова», PROJECT.md → «Макет «Карточка слова»»): конспект
// для новичка, который ученик открывает тапом по слову в выученной фразе. Лежит в
// lessons.script.wordCard урока-слова: { tag?, nodes: [блоки] } — один набор на все
// модули со словом. Блоки — в любом порядке и количестве. Чистые функции без DOM.
//   text    { text }                         пояснение; **слово** — выделение лаймом
//   table   { head[2–4], rows[[...]], mark }  простая таблица; mark — номер строки «в вашей фразе»
//   formula { parts[], result }              слово из кусочков: I’m + try + ing = I’m trying
//   cases   { items: [{ label, example, tr, mark }] }  случаи употребления (to: перед действием / местом)
//   dialog  { left, right, lines: [{ side, text, tr, neg }] }  пример диалога с переводом

export const DEFAULT_LEFT = 'Пит'
export const DEFAULT_RIGHT = 'Анна'

export const BLOCK_TYPES = [
  { type: 'text', label: 'Текст' },
  { type: 'table', label: 'Таблица' },
  { type: 'formula', label: 'Формула' },
  { type: 'cases', label: 'Случаи' },
  { type: 'dialog', label: 'Пример диалога' },
]
export const BLOCK_LABEL = Object.fromEntries(BLOCK_TYPES.map(b => [b.type, b.label]))

const MAX_NODES = 12
const MAX_TEXT = 600
const MAX_ROWS = 8
const MAX_LINES = 12
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`)
const str = (v, max = MAX_TEXT) => (typeof v === 'string' ? v.slice(0, max) : '')
const arr = v => (Array.isArray(v) ? v : [])

export function makeBlock(type) {
  const id = uid()
  switch (type) {
    case 'table': return { id, type, head: ['когда', 'форма', 'по-русски'], rows: [['', '', ''], ['', '', '']], mark: null }
    case 'formula': return { id, type, parts: ['', ''], result: '' }
    case 'cases': return { id, type, items: [{ label: '', example: '', tr: '', mark: true }, { label: '', example: '', tr: '', mark: false }] }
    case 'dialog': return { id, type, left: DEFAULT_LEFT, right: DEFAULT_RIGHT, lines: [{ side: 'l', text: '', tr: '', neg: false }, { side: 'r', text: '', tr: '', neg: false }] }
    default: return { id, type: 'text', text: '' }
  }
}

// Чистка блока из любого источника (база, импорт JSON): неизвестное выбрасываем,
// лишнее обрезаем, нужные поля достраиваем. null — блок не годится
export function normalizeBlock(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' && raw.id ? raw.id : uid()
  switch (raw.type) {
    case 'text': return { id, type: 'text', text: str(raw.text) }
    case 'table': {
      const cols = Math.min(4, Math.max(2, arr(raw.head).length || 3))
      const cell = v => str(v, 80)
      const head = Array.from({ length: cols }, (_, i) => cell(arr(raw.head)[i]))
      const rows = arr(raw.rows).slice(0, MAX_ROWS).map(r => Array.from({ length: cols }, (_, i) => cell(arr(r)[i])))
      const mark = Number.isInteger(raw.mark) && raw.mark >= 0 && raw.mark < rows.length ? raw.mark : null
      return { id, type: 'table', head, rows, mark }
    }
    case 'formula': return { id, type: 'formula', parts: arr(raw.parts).slice(0, 5).map(p => str(p, 40)), result: str(raw.result, 60) }
    case 'cases': return {
      id, type: 'cases',
      items: arr(raw.items).slice(0, 4).map(i => ({ label: str(i?.label, 60), example: str(i?.example, 120), tr: str(i?.tr, 160), mark: !!i?.mark })),
    }
    case 'dialog': return {
      id, type: 'dialog',
      left: str(raw.left, 20) || DEFAULT_LEFT,
      right: str(raw.right, 20) || DEFAULT_RIGHT,
      lines: arr(raw.lines).slice(0, MAX_LINES).map(l => ({ side: l?.side === 'r' ? 'r' : 'l', text: str(l?.text, 200), tr: str(l?.tr, 200), neg: !!l?.neg })),
    }
    default: return null
  }
}

// Вся справка из базы/файла → { tag, nodes }; null — справки нет
export function normalizeWordCard(raw) {
  if (!raw || typeof raw !== 'object') return null
  const nodes = arr(raw.nodes).slice(0, MAX_NODES).map(normalizeBlock).filter(Boolean)
  const tag = str(raw.tag, 40).trim()
  return nodes.length ? { ...(tag ? { tag } : {}), nodes } : null
}

// Блок пуст — в ученика он не попадёт (и не сохраняется): ни текста, ни реплик
export function isBlockEmpty(b) {
  switch (b.type) {
    case 'text': return !b.text.trim()
    case 'table': return b.rows.every(r => r.every(c => !c.trim()))
    case 'formula': return !b.parts.some(p => p.trim()) && !b.result.trim()
    case 'cases': return b.items.every(i => !i.example.trim() && !i.label.trim())
    case 'dialog': return b.lines.every(l => !l.text.trim())
    default: return true
  }
}

// Что реально сохраняем и показываем: пустые блоки и пустые строки убраны
export function cleanForSave(wc) {
  const nodes = arr(wc?.nodes).map(n => {
    if (n.type === 'dialog') return { ...n, lines: n.lines.filter(l => l.text.trim()) }
    if (n.type === 'table') {
      const keep = n.rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some(c => c.trim()))
      return { ...n, rows: keep.map(k => k.r), mark: n.mark == null ? null : (keep.findIndex(k => k.i === n.mark) >= 0 ? keep.findIndex(k => k.i === n.mark) : null) }
    }
    if (n.type === 'formula') return { ...n, parts: n.parts.filter(p => p.trim()) }
    if (n.type === 'cases') return { ...n, items: n.items.filter(i => i.example.trim() || i.label.trim()) }
    return n
  }).filter(n => !isBlockEmpty(n))
  return nodes.length ? { ...(wc?.tag?.trim() ? { tag: wc.tag.trim() } : {}), nodes } : null
}

// **выделение** → [{ text, bold }]; непарные ** остаются обычным текстом
export function parseMarks(text) {
  const parts = String(text ?? '').split('**')
  const paired = parts.length % 2 === 1
  const out = []
  parts.forEach((p, i) => {
    if (!p) return
    const open = i % 2 === 1
    if (open && !paired && i === parts.length - 1) out.push({ text: `**${p}`, bold: false })
    else out.push({ text: p, bold: open })
  })
  return out
}

// Отрицание в реплике диалога (галочка «отрицание»): не / don’t / not … подсвечиваются
// янтарным. lang 'en' | 'ru' → [{ text, neg }]
const NEG = {
  en: /\b(?:do not|does not|did not|don['’]t|doesn['’]t|didn['’]t|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|can['’]t|won['’]t|not|no|never)\b/giu,
  ru: /(?<![\p{L}])(?:не|нет|никогда|ни)(?![\p{L}])/giu,
}
export function splitNeg(text, lang) {
  const s = String(text ?? '')
  const out = []
  let at = 0
  for (const m of s.matchAll(NEG[lang] ?? NEG.en)) {
    if (m.index > at) out.push({ text: s.slice(at, m.index), neg: false })
    out.push({ text: m[0], neg: true })
    at = m.index + m[0].length
  }
  if (at < s.length) out.push({ text: s.slice(at), neg: false })
  return out
}

export function moveBlock(nodes, i, dir) {
  const j = i + dir
  if (j < 0 || j >= nodes.length) return nodes
  const next = nodes.slice()
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

// Кусок описания блока в списке редактора
export function blockSummary(b) {
  switch (b.type) {
    case 'text': return b.text.replace(/\*\*/g, '').slice(0, 40)
    case 'table': return `${b.head.length} столбца · ${b.rows.length} строк`
    case 'formula': return b.result || b.parts.filter(Boolean).join(' + ')
    case 'cases': return `${b.items.length} случая`
    case 'dialog': return `${b.lines.length} реплик`
    default: return ''
  }
}
