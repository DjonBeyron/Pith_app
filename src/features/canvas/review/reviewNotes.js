// Замечания автора к уроку из окна «Разбор урока»: шаблоны, сборка JSON для передачи Claude (ссылки на ноды + их текст + порядок + комментарии).
import { nodeCopyText } from './nodeCopyText.js'

export const NOTE_TEMPLATES = [
  'Звучит неестественно, переформулировать',
  'Не хватает перехода или вводного слова',
  'Выделить главное подчёркиванием',
  'Выделить цветом / белым жирным',
  'Подсказка при ошибке неполная',
  'Лучше голосовым сообщением',
  'Лучше текстом',
  'Добавить смайлик или стикер',
  'Добавить пояснение после ответа',
  'Задание неоднозначное',
  'Слишком длинно, сократить',
  'Другое',
]

let seq = 0
export const newNoteId = () => `note-${Date.now().toString(36)}-${(seq++).toString(36)}`

const asView = v => (typeof v === 'string' ? { text: v, type: null } : v)

/** Ноды, которые автор изменил относительно оригинала: текст или вид (originals: Map ref → { text, type } до правок; строка тоже годится) */
export function changedRefs(originals, nodes) {
  const byRef = new Map(nodes.map(n => [n.ref, n]))
  return [...originals.keys()].filter(r => {
    const n = byRef.get(r)
    if (!n) return false
    const o = asView(originals.get(r))
    return o.text !== nodeCopyText(n, { markup: true }) || (o.type && o.type !== n.type)
  })
}

/**
 * JSON замечаний: notes — по порядку ленты, одна запись на ноду с замечанием ИЛИ правкой (текста или вида ноды):
 * ref/seq/тип/ветка, before (оригинал, разметка {g:..} видна), after (как стало), type_before (если вид меняли), changed, comments — список замечаний
 * (шаблон + текст, может быть пуст, если автор только поправил). general — замечания ко всему уроку. originals: Map ref → { text, type } до правок
 */
export function buildNotesJson({ notes, general, items, nodes, originals = new Map(), lessonTitle = '' }) {
  const byRef = new Map(nodes.map(n => [n.ref, n]))
  const pos = new Map()
  items.forEach((it, i) => { if (it.kind === 'node' && !pos.has(it.ref)) pos.set(it.ref, { i, wrong: it.wrongBranch }) })
  const rank = ref => pos.get(ref)?.i ?? 1e9
  const refs = [...new Set([...notes.map(n => n.ref), ...changedRefs(originals, nodes)])].sort((a, b) => rank(a) - rank(b))
  return {
    format: 'pithy-review-notes',
    version: 3,
    lesson: lessonTitle,
    hint: 'notes: по одной записи на ноду (ref и seq: идентификаторы ноды в JSON урока), по порядку ленты. before: текст ноды как был (с разметкой {g:}, {u:}…), after: как автор исправил (равен before, если не менял), type: вид ноды сейчас, type_before: каким был (есть, только если автор сменил вид), changed: менял ли текст или вид, comments: замечания автора (может быть пусто, если он только поправил). general: замечания ко всему уроку',
    notes: refs.map((ref, k) => {
      const node = byRef.get(ref)
      const after = node ? nodeCopyText(node, { markup: true }) : ''
      const o = originals.has(ref) ? asView(originals.get(ref)) : { text: after, type: null }
      const typeChanged = !!(o.type && node && o.type !== node.type)
      return {
        order: k + 1, ref, seq: node?.seq ?? null, type: node?.type ?? null, ...(typeChanged ? { type_before: o.type } : {}),
        branch: pos.get(ref)?.wrong ? 'ветка ошибки' : 'основная',
        before: o.text, after, changed: o.text !== after || typeChanged,
        comments: notes.filter(n => n.ref === ref).map(n => ({ template: n.template || '', comment: n.text || '' })),
      }
    }),
    general: general.map(g => ({ template: g.template || '', comment: g.text || '' })),
  }
}
