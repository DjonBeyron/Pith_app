// Общий загрузчик правил для скриптов генератора уроков. Источник: lesson-drafts/rules.json (выгрузка правил, если их правили в окне
// правил); иначе — стандартный набор со структурой (lessonRulesSeed.js — тот же, что «Загрузить стандартные правила» кладёт в базу).
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SEED_RULES } from '../src/features/canvas/lesson-io/lessonRulesSeed.js'

const FILE = fileURLToPath(new URL('../lesson-drafts/rules.json', import.meta.url))

export function loadRules() {
  if (existsSync(FILE)) return { rules: JSON.parse(readFileSync(FILE, 'utf8')), source: 'lesson-drafts/rules.json' }
  return { rules: SEED_RULES.map((r, i) => ({ id: `seed${i}`, active: true, ...r })), source: 'seed' }
}
