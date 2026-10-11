// Сборка промпта для ИИ-автора урока из правил окна правил (LessonRulesPanel). Чистая функция, без React.
// Один источник правды: что автор правит в окне правил (текст, примеры «нельзя / можно», серьёзность, кто проверяет),
// то и попадает в промпт — руками копировать и сверять ничего не нужно.
import { buildLegend } from './lessonSchema.js'
import { checkerOf, groupOf, ruleTitle } from './ruleMeta.js'

const SEV = { error: 'ОШИБКА — урок с этим нарушением не принимается', warn: 'совет' }

function ruleBlock(r, n) {
  const c = checkerOf(r.checker)
  const lines = [`[R${n}] ${ruleTitle(r)}  (${SEV[r.severity] ?? SEV.warn}; проверяет: ${c.label})`, r.text.trim()]
  if (r.bad?.trim()) lines.push('❌ НЕЛЬЗЯ:', r.bad.trim())
  if (r.good?.trim()) lines.push('✅ МОЖНО:', r.good.trim())
  return lines.join('\n')
}

/** Правила, сгруппированные по группам, с номерами R1…Rn. Возвращает { text, count } */
export function rulesSection(rules) {
  const active = rules.filter(r => r.active && r.category === 'principle')
  const groups = new Map()
  active.forEach(r => groups.set(groupOf(r), [...(groups.get(groupOf(r)) ?? []), r]))
  let n = 0
  const text = [...groups].map(([g, list]) => `### ${g}\n\n${list.map(r => ruleBlock(r, ++n)).join('\n\n')}`).join('\n\n')
  return { text, count: n }
}

/** Пункты «перед сдачей» — проверка по готовому уроку целиком */
export function checklistSection(rules) {
  return rules.filter(r => r.active && r.category === 'checklist').map((r, i) => `C${i + 1}. ${r.text.trim()}`).join('\n')
}

/** Полный промпт: роль, формула, правила, процесс, формат ответа, легенда формата нод (без дублирования принципов) */
export function buildAuthorPrompt(rules, { topic = '' } = {}) {
  const { text: rulesText, count } = rulesSection(rules)
  const checklist = checklistSection(rules)
  const { principles: _p, preSubmitChecklist: _c, ...legend } = buildLegend([], [])
  return `Ты автор уроков для приложения Pithy (формат pithy-lesson). Урок — живая переписка с другом Питом, а не учебник.

ТЕМА УРОКА: ${topic.trim() || '<впиши тему и целевое слово>'}

ГЛАВНАЯ ФОРМУЛА. Каждая нода должна менять ученика: дать новое знание или потребовать нового действия. Если ноду можно убрать и ничего не потеряется — убери. Каждая смысловая единица идёт так: ЗАМЕТЬ (живой пример) → СДЕЛАЙ САМ (ответ НЕ написан в двух предыдущих нодах) → УСЛОЖНИ → ИСПОЛЬЗУЙ (голос или свободная фраза).

ПРАВИЛА (${count}). Это не пожелания: после тебя урок прогоняет автоматический линтер, нарушения уровня «ОШИБКА» возвращаются тебе на исправление.

${rulesText}
${checklist ? `\nЧЕК-ЛИСТ ПЕРЕД СДАЧЕЙ (проверяется по готовому уроку целиком):\n${checklist}\n` : ''}
ПРОЦЕСС (строго по порядку):
1. ПЛАН: перечисли части урока и в каждой — что ученик ЗАМЕЧАЕТ, что ДЕЛАЕТ САМ, чем УСЛОЖНЯЕТСЯ. Без JSON.
2. УРОК: один JSON формата pithy-lesson, в блоке \`\`\`json. Выделения только разметкой в тексте ({g:..}, {w:..}, {u:..}, {b:..}, {p:..}), массив highlights НЕ пиши.
3. ОТЧЁТ: после JSON — список ${count ? `R1…R${count}` : 'правил'}${checklist ? ' и C1…' : ''}: «ок» либо «исправил: что». Если нашёл нарушение — исправь JSON и выдай исправленный целиком. Больше ничего не добавляй.

ФОРМАТ НОД (легенда):
${JSON.stringify(legend)}
`
}
