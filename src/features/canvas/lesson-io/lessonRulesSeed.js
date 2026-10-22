// Стандартный набор правил для окна правил — собран из файлов rules/*.js (одна группа = один файл). Это ЗАГОТОВКА: «Загрузить стандартные
// правила» кладёт её в таблицу lesson_rules, «Синхронизировать со стандартом» (useLessonRules.syncFromSeed) приводит базу к ней по названиям,
// дальше источник правды — база. Тот же набор берут скрипты (scripts/lesson-rules.mjs), пока нет выгрузки lesson-drafts/rules.json.
// Запись правила: { title, text, checker (auto|judge|manual), severity (error|warn), bad, good }; группа и категория — от файла.
// Категории: principle — правило к ноде; checklist — по готовому уроку целиком; reference — справка, как устроен модуль (судье не идёт).
import { FORMULA_RULES } from './rules/formula.js'
import { SEQUENCE_RULES } from './rules/sequences.js'
import { TASK_RULES } from './rules/tasks.js'
import { TONE_RULES } from './rules/tone.js'
import { STYLE_RULES } from './rules/style.js'
import { TABLE_RULES } from './rules/tables.js'
import { SIGNAL_RULES } from './rules/signals.js'
import { VOICE_RULES } from './rules/voice.js'
import { CANVAS_RULES } from './rules/canvas.js'
import { SCENE_RULES } from './rules/scenes.js'
import { CHECKLIST_RULES } from './rules/checklist.js'
import { REFERENCE_NOTES } from './rules/reference.js'
import { RETIRED_TITLES } from './rules/retired.js'

const GROUPS = [
  ['Формула и ритм', FORMULA_RULES], ['Последовательности', SEQUENCE_RULES], ['Задания', TASK_RULES], ['Тон и общение', TONE_RULES],
  ['Выделения и стиль', STYLE_RULES], ['Таблицы', TABLE_RULES], ['Сигналы', SIGNAL_RULES], ['Голос и сказать', VOICE_RULES],
  ['Холст и раскладка', CANVAS_RULES], ['Сцены', SCENE_RULES],
]

const norm = (r, group, category) => ({
  text: r.text, category, title: r.title, group: r.group ?? group,
  checker: r.checker ?? 'manual', severity: r.severity ?? 'warn', bad: r.bad ?? '', good: r.good ?? '',
})

/** Все стандартные правила: принципы по группам, затем чек-лист, затем справка по модулям */
export const SEED_RULES = [
  ...GROUPS.flatMap(([group, list]) => list.map(r => norm(r, group, 'principle'))),
  ...CHECKLIST_RULES.map(r => norm(r, r.group, 'checklist')),
  ...REFERENCE_NOTES.map(r => norm(r, r.group, 'reference')),
]

/** Порядок групп, как в окне правил и промпте */
export const SEED_GROUP_ORDER = GROUPS.map(([g]) => g)

export { RETIRED_TITLES }
