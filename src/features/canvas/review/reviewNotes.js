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

/** Ноды, текст которых автор изменил относительно оригинала (originals: Map ref → текст до правок) */
export function changedRefs(originals, nodes) {
  const byRef = new Map(nodes.map(n => [n.ref, n]))
  return [...originals.keys()].filter(r => byRef.has(r) && originals.get(r) !== nodeCopyText(byRef.get(r), { markup: true }))
}

/**
 * JSON замечаний: notes — по порядку ленты, одна запись на ноду, у которой есть замечание ИЛИ правка текста (или и то и другое):
 * ref/seq/тип/ветка, before (оригинал, разметка {g:..} видна), after (как стало), changed, comments — список замечаний (шаблон + текст, может быть пуст,
 * если автор только поправил текст). general — замечания ко всему уроку. originals: Map ref → текст ноды до правок
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
    hint: 'notes: по одной записи на ноду (ref и seq: идентификаторы ноды в JSON урока), по порядку ленты. before: текст ноды как был (с разметкой {g:}, {u:}…), after: как автор исправил (равен before, если не менял), changed: менял ли, comments: замечания автора (может быть пусто, если он только поправил текст). general: замечания ко всему уроку',
    notes: refs.map((ref, k) => {
      const node = byRef.get(ref)
      const after = node ? nodeCopyText(node, { markup: true }) : ''
      const before = originals.get(ref) ?? after
      return {
        order: k + 1, ref, seq: node?.seq ?? null, type: node?.type ?? null, branch: pos.get(ref)?.wrong ? 'ветка ошибки' : 'основная',
        before, after, changed: before !== after,
        comments: notes.filter(n => n.ref === ref).map(n => ({ template: n.template || '', comment: n.text || '' })),
      }
    }),
    general: general.map(g => ({ template: g.template || '', comment: g.text || '' })),
  }
}
