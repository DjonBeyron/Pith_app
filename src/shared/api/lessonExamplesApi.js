import { supabase } from './supabase.js'

// Золотой набор примеров (таблица lesson_examples, миграция 20261022100000_review_marks_examples.sql): пары «до → после» из разбора
// (kind 'pair'), образцы «плохо» ('bad') и «хорошо» ('good') — из окна замечания и из пометок с телефона. Только админ (RLS).
// Форма записи — lessonExamples.js (features/canvas/review): это и есть материал для примеров в промпте автора и калибровки судьи
const COLS = 'id, lesson_id, lesson_title, node_ref, node_seq, node_type, branch, kind, before_text, after_text, comments, tags, rule_title, source, created_at'
const UUID = /^[0-9a-f-]{36}$/i
const uuidOrNull = v => (typeof v === 'string' && UUID.test(v) ? v : null)
const toExample = r => ({
  id: r.id, lessonId: r.lesson_id, lessonTitle: r.lesson_title, ref: r.node_ref, seq: r.node_seq, type: r.node_type, branch: r.branch, kind: r.kind,
  before: r.before_text, after: r.after_text, comments: Array.isArray(r.comments) ? r.comments : [], tags: r.tags ?? [], ruleTitle: r.rule_title, source: r.source, at: r.created_at,
})

export async function listLessonExamples({ lessonId = null } = {}) {
  let q = supabase.from('lesson_examples').select(COLS).order('created_at', { ascending: false })
  const id = uuidOrNull(lessonId)
  if (id) q = q.eq('lesson_id', id)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(toExample)
}

export async function addLessonExample(e) {
  const row = {
    lesson_id: uuidOrNull(e.lessonId), lesson_title: e.lessonTitle ?? '', node_ref: e.ref ?? '', node_seq: e.seq ?? null, node_type: e.type ?? '', branch: e.branch ?? 'основная',
    kind: e.kind, before_text: e.before ?? '', after_text: e.after ?? '', comments: e.comments ?? [], tags: e.tags ?? [], rule_title: e.ruleTitle ?? '', source: e.source ?? 'review',
  }
  const { data, error } = await supabase.from('lesson_examples').insert(row).select(COLS).single()
  if (error) throw error
  return toExample(data)
}

export async function deleteLessonExample(id) {
  const { error } = await supabase.from('lesson_examples').delete().eq('id', id)
  if (error) throw error
}
