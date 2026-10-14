// Печатает промпт из правил.
//   node scripts/lesson-prompt.mjs "тема урока"         — промпт для автора урока
//   node scripts/lesson-prompt.mjs --judge урок.json    — промпт для ИИ-судьи (правила, которые не ловит линтер, + сам урок)
import { readFileSync } from 'node:fs'
import { loadRules } from './lesson-rules.mjs'
import { buildAuthorPrompt } from '../src/features/canvas/lesson-io/authorPrompt.js'
import { buildJudgePrompt } from '../src/features/canvas/lesson-io/judgePrompt.js'

const { rules } = loadRules()
if (process.argv[2] === '--judge') {
  if (!process.argv[3]) { console.error('Использование: --judge урок.json'); process.exit(1) }
  console.log(buildJudgePrompt(rules, readFileSync(process.argv[3], 'utf8')))
} else {
  console.log(buildAuthorPrompt(rules, { topic: process.argv.slice(2).join(' ') }))
}
