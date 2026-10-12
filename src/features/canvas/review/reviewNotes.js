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

/** JSON замечаний: notes — по порядку ленты, у каждого ref/seq/тип/ветка/текст ноды; general — замечания ко всему уроку */
export function buildNotesJson({ notes, general, items, nodes, lessonTitle = '' }) {
  const byRef = new Map(nodes.map(n => [n.ref, n]))
  const pos = new Map()
  items.forEach((it, i) => { if (it.kind === 'node' && !pos.has(it.ref)) pos.set(it.ref, { i, wrong: it.wrongBranch }) })
  const sorted = [...notes].sort((a, b) => (pos.get(a.ref)?.i ?? 1e9) - (pos.get(b.ref)?.i ?? 1e9))
  return {
    format: 'pithy-review-notes',
    version: 1,
    lesson: lessonTitle,
    hint: 'notes — замечания к нодам по порядку ленты (ref и seq — идентификаторы ноды в JSON урока; content — текст ноды до правок, edited — после правок автора в окне замечания, если он менял); general — замечания ко всему уроку',
    notes: sorted.map((n, k) => {
      const node = byRef.get(n.ref)
      const now = node ? nodeCopyText(node) : ''
      const before = n.before ?? now
      return {
        order: k + 1,
        ref: n.ref,
        seq: node?.seq ?? null,
        type: node?.type ?? null,
        branch: pos.get(n.ref)?.wrong ? 'ветка ошибки' : 'основная',
        content: before,
        ...(before !== now ? { edited: now } : {}),
        template: n.template || '',
        comment: n.text || '',
      }
    }),
    general: general.map(g => ({ template: g.template || '', comment: g.text || '' })),
  }
}
