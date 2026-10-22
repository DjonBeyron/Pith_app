import { supabase } from './supabase.js'

// Снимки набора правил — таблица lesson_rules_history (миграция 20261022140000_lesson_rules_tidy.sql): перед каждой синхронизацией
// со стандартом (useLessonRules.syncFromSeed) весь список правил кладётся одной строкой jsonb — чтобы любое слияние можно было откатить
// руками или сравнить, что изменилось. Только админ (RLS)

/** Сохранить снимок: reason — зачем (например «до синхронизации v3.2.2062»), rules — список из listLessonRules() */
export async function snapshotLessonRules(reason, rules) {
  const { error } = await supabase.from('lesson_rules_history').insert({ reason, rules, count: rules.length })
  if (error) throw error
}

/** Последние снимки: [{ id, reason, count, at }] */
export async function listLessonRulesHistory(limit = 20) {
  const { data, error } = await supabase.from('lesson_rules_history').select('id, reason, count, created_at').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []).map(r => ({ id: r.id, reason: r.reason, count: r.count, at: r.created_at }))
}
