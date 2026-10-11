// Общий загрузчик правил для скриптов генератора уроков. Источник: lesson-drafts/rules.json (выгрузка из окна правил, кнопка
// «Правила для Claude»); если файла нет — зашитый в код дефолт (lessonRulesDefaults.js), с предупреждением.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PRINCIPLES, PRE_SUBMIT_CHECKLIST } from '../src/features/canvas/lesson-io/lessonRulesDefaults.js'

const FILE = fileURLToPath(new URL('../lesson-drafts/rules.json', import.meta.url))
const mk = (text, category) => ({ id: category + text.slice(0, 12), text, category, active: true, title: '', group: '', checker: 'manual', severity: 'warn', bad: '', good: '' })

export function loadRules() {
  if (existsSync(FILE)) return { rules: JSON.parse(readFileSync(FILE, 'utf8')), source: 'lesson-drafts/rules.json' }
  console.error('⚠ lesson-drafts/rules.json нет — беру зашитые в код правила (без твоих правок из окна правил). Выгрузи: окно правил → «Правила для Claude»')
  return { rules: [...PRINCIPLES.map(t => mk(t, 'principle')), ...PRE_SUBMIT_CHECKLIST.map(t => mk(t, 'checklist'))], source: 'defaults' }
}
