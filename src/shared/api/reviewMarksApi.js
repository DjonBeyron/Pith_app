import { supabase } from './supabase.js'

// Пометки админа из плеера на телефоне (таблица lesson_review_marks, миграция 20261022100000_review_marks_examples.sql):
// долгое нажатие по сообщению → тег (роботизированно / скучно / непонятно / отлично) + комментарий. Окно «Разбор» показывает их
// на нодах. Только админ (RLS). lesson_id — uuid урока; не uuid (стенды) → null
const COLS = 'id, lesson_id, node_id, node_seq, node_type, node_text, tag, comment, device, created_at'
const UUID = /^[0-9a-f-]{36}$/i
const uuidOrNull = v => (typeof v === 'string' && UUID.test(v) ? v : null)
const toMark = r => ({ id: r.id, lessonId: r.lesson_id, nodeId: r.node_id, seq: r.node_seq, type: r.node_type, text: r.node_text, tag: r.tag, comment: r.comment, device: r.device, at: r.created_at })

export async function listReviewMarks(lessonId) {
  const id = uuidOrNull(lessonId)
  if (!id) return []
  const { data, error } = await supabase.from('lesson_review_marks').select(COLS).eq('lesson_id', id).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toMark)
}

export async function addReviewMark(m) {
  const row = { lesson_id: uuidOrNull(m.lessonId), node_id: m.nodeId, node_seq: m.seq ?? null, node_type: m.type ?? '', node_text: m.text ?? '', tag: m.tag, comment: m.comment ?? '', device: m.device ?? '' }
  const { data, error } = await supabase.from('lesson_review_marks').insert(row).select(COLS).single()
  if (error) throw error
  return toMark(data)
}

export async function deleteReviewMark(id) {
  const { error } = await supabase.from('lesson_review_marks').delete().eq('id', id)
  if (error) throw error
}
