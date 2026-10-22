// Общий загрузчик правил для скриптов генератора уроков. Источник: lesson-drafts/rules.json (выгрузка из окна правил, кнопка
// «⬇ Правила для Claude»); иначе — стандартный набор (lessonRulesSeed.js — тот же, что «Синхронизировать со стандартом» кладёт в базу).
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SEED_RULES } from '../src/features/canvas/lesson-io/lessonRulesSeed.js'

const FILE = fileURLToPath(new URL('../lesson-drafts/rules.json', import.meta.url))

/** Текст rules.json → { rules, source } (поля как в окне правил; active по умолчанию true) */
export function loadRulesFromJson(text, source = 'lesson-drafts/rules.json') {
  const rules = JSON.parse(text).map((r, i) => ({ id: r.id ?? `r${i}`, active: r.active !== false, category: r.category ?? 'principle', checker: r.checker ?? 'manual', severity: r.severity ?? 'warn', title: r.title ?? '', group: r.group ?? '', bad: r.bad ?? '', good: r.good ?? '', text: r.text ?? '' }))
  return { rules, source }
}

export function loadRules() {
  if (existsSync(FILE)) return loadRulesFromJson(readFileSync(FILE, 'utf8'))
  return { rules: SEED_RULES.map((r, i) => ({ id: `seed${i}`, active: true, ...r })), source: 'seed' }
}
