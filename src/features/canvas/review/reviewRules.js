// Связь замечаний линтера с правилами и подбор правил под ноду — для правой колонки окна «Разбор урока». Чистые функции.
import { toMarkup } from '../../../shared/lib/lessonMarkup.js'
import { groupOf, ruleTitle } from '../lesson-io/ruleMeta.js'

// Код замечания линтера → название правила в окне правил
const CODE_TITLE = {
  'R-text-run': 'Не больше двух текстов подряд',
  'R-same-type': 'Не больше двух одинаковых заданий подряд',
  'R-tautology': 'Главная формула урока',
  'R-base': 'Базовая подложка на весь текст',
}
export function ruleForWarning(warning, rules) {
  const code = warning.match(/^\[(R-[\w-]+)\]/)?.[1]
  const title = code && CODE_TITLE[code]
  return title ? rules.find(r => ruleTitle(r) === title) ?? null : null
}

const ALWAYS_GROUPS = new Set(['Последовательности', 'Формула и ритм'])
/** Правила, относящиеся к ноде: упоминают её тип в тексте, либо общие группы про порядок и ритм */
export function rulesForNode(node, rules) {
  if (!node) return []
  return rules.filter(r => r.active && (r.text.includes(node.type) || ALWAYS_GROUPS.has(groupOf(r))))
}

/** Нода → строка примера «тип: содержимое с метками» (для «нельзя / можно» нового правила) */
export function nodeToExampleLine(node) {
  const d = node.data ?? {}
  const text = d.content ?? d.text ?? d.caption ?? (node.type === 'reaction' ? d.emoji : '') ?? ''
  return `${node.type}: ${toMarkup(String(text), d.highlights ?? [])}`
}
