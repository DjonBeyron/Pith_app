// Тексты стандартных правил для легенды экспорта (lessonSchema.buildLegend) и скриптов — производные от набора rules/*.js
// (lessonRulesSeed.js). Реальный источник — таблица lesson_rules (админ правит её в LessonRulesPanel.jsx); это зашитый в код дефолт
// на случай недоступности БД. Разделение по тому, КОГДА правило проверяется (см. PROJECT.md):
//   PRINCIPLES — в момент написания конкретной ноды;
//   PRE_SUBMIT_CHECKLIST — по готовому черновику целиком, перед тем как его отдать;
//   REFERENCE_NOTES — справка, как устроен модуль (поля, попытки, что уходит в чат) — не правило качества, судье не отдаётся.
import { SEED_RULES } from './lessonRulesSeed.js'

const texts = category => SEED_RULES.filter(r => r.category === category).map(r => r.text)

export const PRINCIPLES = texts('principle')
export const PRE_SUBMIT_CHECKLIST = texts('checklist')
export const REFERENCE_NOTES = texts('reference')
