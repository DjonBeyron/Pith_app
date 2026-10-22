// Печатает промпт из правил.
//   node scripts/lesson-prompt.mjs "тема урока"                 — промпт для автора урока (+ образцы из lesson-drafts/examples.json, если есть)
//   node scripts/lesson-prompt.mjs --judge урок.json [группа]   — промпт для ИИ-судьи: правила группы (без линтерных и справки) + урок
//   node scripts/lesson-prompt.mjs --judge-groups               — список групп судьи (по одному вызову на группу)
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadRules } from './lesson-rules.mjs'
import { buildAuthorPrompt } from '../src/features/canvas/lesson-io/authorPrompt.js'
import { buildJudgePrompt, judgeGroups } from '../src/features/canvas/lesson-io/judgePrompt.js'

const EXAMPLES = fileURLToPath(new URL('../lesson-drafts/examples.json', import.meta.url))
const { rules } = loadRules()
const [mode, arg, group] = process.argv.slice(2)

if (mode === '--judge') {
  if (!arg) { console.error('Использование: --judge урок.json [группа]'); process.exit(1) }
  const groups = judgeGroups(rules)
  if (group && !groups.includes(group)) { console.error(`Нет такой группы. Есть: ${groups.join(' | ')}`); process.exit(1) }
  console.log(buildJudgePrompt(rules, readFileSync(arg, 'utf8'), { group }))
} else if (mode === '--judge-groups') {
  judgeGroups(rules).forEach(g => console.log(g))
} else {
  const examples = existsSync(EXAMPLES) ? JSON.parse(readFileSync(EXAMPLES, 'utf8')) : []
  console.log(buildAuthorPrompt(rules, { topic: process.argv.slice(2).join(' '), examples }))
}
