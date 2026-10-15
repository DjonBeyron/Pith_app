// Сборка промпта для ИИ-автора урока из правил окна правил (LessonRulesPanel). Чистая функция, без React.
// Один источник правды: что автор правит в окне правил (текст, примеры «нельзя / можно», серьёзность, кто проверяет),
// то и попадает в промпт — руками копировать и сверять ничего не нужно.
import { buildLegend } from './lessonSchema.js'
import { checkerOf, groupOf, ruleTitle } from './ruleMeta.js'
import { exampleToPrompt } from './ruleExample.js'
import { sceneLegendText } from '../../scene/v2/sceneLegend.js'

export const SCENE_GROUP = 'Сцены'

const SEV = { error: 'ОШИБКА — урок с этим нарушением не принимается', warn: 'совет' }

function ruleBlock(r, n) {
  const c = checkerOf(r.checker)
  const lines = [`[R${n}] ${ruleTitle(r)}  (${SEV[r.severity] ?? SEV.warn}; проверяет: ${c.label})`, r.text.trim()]
  if (r.bad?.trim()) lines.push('❌ НЕЛЬЗЯ:', exampleToPrompt(r.bad))
  if (r.good?.trim()) lines.push('✅ МОЖНО:', exampleToPrompt(r.good))
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

/** Раздел про ноду scene: компактная легенда сцены + как ставить сцены. Пусто, если активных правил группы «Сцены» нет */
export function sceneSection(rules) {
  if (!rules.some(r => r.active && r.category === 'principle' && groupOf(r) === SCENE_GROUP)) return ''
  return `СЦЕНЫ В УРОКЕ (нода scene). Правила группы «${SCENE_GROUP}» — выше, в ПРАВИЛАХ. Коротко: только в уроках-словах (не в Старте и Финале); открывающий и закрывающий кружок Пита (mode "circle", один кот a без b), в середине — диалог двух котов (mode "bubble"); без task; озвучку (audioUrl) не заполняй — реплики без неё озвучит админ. Сцену в data.scene пиши по легенде ниже; сначала проверь её отдельно (node scripts/lint-scene.mjs сцена.json).

ЛЕГЕНДА СЦЕНЫ (поле data.scene):
${sceneLegendText({ compact: true })}
`
}

/** Полный промпт: роль, формула, правила, процесс, формат ответа, легенда формата нод (без дублирования принципов) */
export function buildAuthorPrompt(rules, { topic = '' } = {}) {
  const { text: rulesText, count } = rulesSection(rules)
  const checklist = checklistSection(rules)
  const scenes = sceneSection(rules)
  const { principles: _p, preSubmitChecklist: _c, ...legend } = buildLegend([], [])
  return `Ты автор уроков для приложения Pithy (формат pithy-lesson). Урок — живая переписка с другом Питом, а не учебник.

ТЕМА УРОКА: ${topic.trim() || '<впиши тему и целевое слово>'}

ГЛАВНАЯ ФОРМУЛА. Каждая нода должна менять ученика: дать новое знание или потребовать нового действия. Если ноду можно убрать и ничего не потеряется — убери. Каждая смысловая единица идёт так: ЗАМЕТЬ (живой пример) → СДЕЛАЙ САМ (ответ НЕ написан в двух предыдущих нодах) → УСЛОЖНИ → ИСПОЛЬЗУЙ (голос или свободная фраза).

ПРАВИЛА (${count}). Это не пожелания: после тебя урок прогоняет автоматический линтер, нарушения уровня «ОШИБКА» возвращаются тебе на исправление.

${rulesText}
${checklist ? `\nЧЕК-ЛИСТ ПЕРЕД СДАЧЕЙ (проверяется по готовому уроку целиком):\n${checklist}\n` : ''}
ПРОЦЕСС (строго по порядку):
1. ПЛАН: перечисли части урока и в каждой — что ученик ЗАМЕЧАЕТ, что ДЕЛАЕТ САМ, чем УСЛОЖНЯЕТСЯ. Без JSON.
2. УРОК: один JSON формата pithy-lesson, в блоке \`\`\`json. Выделения только разметкой в тексте ({g:..}, {w:..}, {u:..}, {l:..} белое подчёркивание главного, {x:..} красное зачёркнутое лишнее, {b:..}, {p:..}); в каждом объяснении САМ выдели главную мысль белым подчёркиванием {l:..}, массив highlights НЕ пиши.
3. ОТЧЁТ: после JSON — список ${count ? `R1…R${count}` : 'правил'}${checklist ? ' и C1…' : ''}: «ок» либо «исправил: что». Если нашёл нарушение — исправь JSON и выдай исправленный целиком. Больше ничего не добавляй.

ФОРМАТ НОД (легенда):
${JSON.stringify(legend)}
${scenes ? `\n${scenes}` : ''}`
}
