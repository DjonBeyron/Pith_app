import { supabase } from '../api/supabase.js'
import { dbg } from './debug.js'

// isPro передаётся только при создании про-модуля (upsert не трогает
// колонки, которых нет в объекте — существующим модулям флаг не сбросит).
export async function saveCurriculum(id, title, lessonIds, isPro) {
  dbg('[DB WRITE] curricula upsert', { id, title, lessonIds, isPro })
  const row = { id, title, lesson_ids: lessonIds }
  if (isPro !== undefined) row.is_pro = isPro
  const { error } = await supabase
    .from('curricula')
    .upsert(row)
  if (error) {
    dbg('[DB ERROR] curricula upsert', error.message)
    throw error
  }
  dbg('[DB OK] curricula saved', id)
}

export async function deleteCurriculumFromServer(id) {
  dbg('[DB DELETE] curricula', id)
  const { error } = await supabase
    .from('curricula')
    .delete()
    .eq('id', id)
  if (error) {
    dbg('[DB ERROR] curricula delete', error.message)
    throw error
  }
  dbg('[DB OK] curricula deleted', id)
}

// Публикация модуля: черновики в ленту не попадают
export async function updateCurriculumPublished(id, published) {
  dbg('[DB WRITE] curricula published', id, published)
  const { error } = await supabase
    .from('curricula')
    .update({ published })
    .eq('id', id)
  if (error) {
    dbg('[DB ERROR] curricula published', error.message)
    throw error
  }
}

// Кадр мини-постера списка «Моих уроков»: { x, y, scale }
export async function updateCurriculumPosterCrop(id, crop) {
  dbg('[DB WRITE] curricula poster_crop', id, crop)
  const { error } = await supabase
    .from('curricula')
    .update({ poster_crop: crop })
    .eq('id', id)
  if (error) {
    dbg('[DB ERROR] curricula poster_crop', error.message)
    throw error
  }
}

// Видео фразы для ленты: пишет только ссылки (сами файлы — в R2)
export async function updateCurriculumVideo(id, videoUrl, posterUrl) {
  dbg('[DB WRITE] curricula video', id, videoUrl)
  const { error } = await supabase
    .from('curricula')
    .update({ video_url: videoUrl, poster_url: posterUrl })
    .eq('id', id)
  if (error) {
    dbg('[DB ERROR] curricula video', error.message)
    throw error
  }
}

export async function loadCurricula() {
  dbg('[DB READ] curricula list')
  const { data, error } = await supabase
    .from('curricula')
    .select('id, title, lesson_ids, created_at, video_url, poster_url, poster_crop, published, difficulty, difficulty_votes, is_pro')
    .order('created_at', { ascending: false })
  if (error) {
    dbg('[DB ERROR] curricula load', error.message)
    throw error
  }
  dbg('[DB OK] curricula loaded', data?.length, 'rows')
  return data ?? []
}
