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

/**
 * JSON замечаний: notes — по порядку ленты, у каждого ref/seq/тип/ветка, before (оригинал, разметка {g:..} видна) и after (как стало после правок автора),
 * шаблон и комментарий; edits_without_note — ноды, которые автор правил без замечания; general — замечания ко всему уроку.
 * originals: Map ref → текст ноды до правок (фиксируется при первом открытии окна замечания)
 */
export function buildNotesJson({ notes, general, items, nodes, originals = new Map(), lessonTitle = '' }) {
  const byRef = new Map(nodes.map(n => [n.ref, n]))
  const pos = new Map()
  items.forEach((it, i) => { if (it.kind === 'node' && !pos.has(it.ref)) pos.set(it.ref, { i, wrong: it.wrongBranch }) })
  const rank = ref => pos.get(ref)?.i ?? 1e9
  const sorted = [...notes].sort((a, b) => rank(a.ref) - rank(b.ref))
  const view = ref => {
    const node = byRef.get(ref)
    const after = node ? nodeCopyText(node, { markup: true }) : ''
    const before = originals.get(ref) ?? after
    return { node, before, after }
  }
  const head = (ref, node) => ({ ref, seq: node?.seq ?? null, type: node?.type ?? null, branch: pos.get(ref)?.wrong ? 'ветка ошибки' : 'основная' })
  const noted = new Set(notes.map(n => n.ref))
  return {
    format: 'pithy-review-notes',
    version: 2,
    lesson: lessonTitle,
    hint: 'notes: замечания к нодам по порядку ленты (ref и seq: идентификаторы ноды в JSON урока). before: текст ноды как был (с разметкой {g:}, {u:}…), after: как автор исправил (равен before, если не менял), changed: менял ли. edits_without_note: правки без замечания. general: замечания ко всему уроку',
    notes: sorted.map((n, k) => {
      const { node, before, after } = view(n.ref)
      return { order: k + 1, ...head(n.ref, node), before, after, changed: before !== after, template: n.template || '', comment: n.text || '' }
    }),
    edits_without_note: [...originals.keys()].filter(r => !noted.has(r) && view(r).before !== view(r).after).sort((a, b) => rank(a) - rank(b))
      .map(r => { const { node, before, after } = view(r); return { ...head(r, node), before, after } }),
    general: general.map(g => ({ template: g.template || '', comment: g.text || '' })),
  }
}
