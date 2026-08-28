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

// Статус модуля — три состояния: черновик (published=false), превью
// (published=true, preview_only=true — виден в ленте, но без кнопки
// «Изучить фразу»), опубликован (published=true, preview_only=false)
export async function updateCurriculumStatus(id, { published, previewOnly }) {
  dbg('[DB WRITE] curricula status', id, { published, previewOnly })
  const { error } = await supabase
    .from('curricula')
    .update({ published, preview_only: previewOnly })
    .eq('id', id)
  if (error) {
    dbg('[DB ERROR] curricula status', error.message)
    throw error
  }
}

// Сохранение структуры модуля — только список уроков. Заголовок НЕ трогаем
// (им владеет saveCurriculumTitleData): иначе 💾 затирал бы переименование
// модуля значением из устаревшего пропа.
export async function saveCurriculumLessons(id, lessonIds) {
  dbg('[DB WRITE] curricula lesson_ids', id, lessonIds.length)
  const { error } = await supabase
    .from('curricula')
    .update({ lesson_ids: lessonIds })
    .eq('id', id)
  if (error) {
    dbg('[DB ERROR] curricula lesson_ids', error.message)
    throw error
  }
}

// Название и переводы одного модуля (для редактора названия): читаем прямо
// перед открытием, чтобы не тащить их через пропы из разных экранов
export async function loadCurriculumTitleData(id) {
  dbg('[DB READ] curricula title data', id)
  const { data, error } = await supabase
    .from('curricula')
    .select('title, title_translation, word_translations')
    .eq('id', id)
    .single()
  if (error) {
    dbg('[DB ERROR] curricula title data', error.message)
    throw error
  }
  return data
}

// Название + переводы одним сохранением (редактор названия модуля, админ):
// title, полный перевод фразы и пословный перевод [{ w, t }] в порядке слов.
// Пустые переводы слов не храним — массив остаётся коротким.
export async function saveCurriculumTitleData(id, { title, titleTranslation, wordTranslations }) {
  const words = (wordTranslations ?? []).filter(e => (e?.t ?? '').trim() !== '')
    .map(e => ({ w: e.w, t: e.t.trim() }))
  dbg('[DB WRITE] curricula title+translations', id, title, words.length)
  const { error } = await supabase
    .from('curricula')
    .update({
      title,
      title_translation: (titleTranslation ?? '').trim() || null,
      word_translations: words,
    })
    .eq('id', id)
  if (error) {
    dbg('[DB ERROR] curricula title+translations', error.message)
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

const CURRICULA_COLS = 'id, title, lesson_ids, created_at, video_url, poster_url, poster_crop, published, preview_only, difficulty, difficulty_votes, save_count, repost_count, is_pro'
// Колонки переводов названия появляются миграцией 20260725140000 — пока она не
// применена, читаем список без них (иначе вся лента падала бы на 400)
const CURRICULA_COLS_TR = `${CURRICULA_COLS}, title_translation, word_translations`

// В каком модуле лежит урок. Нужно для «назад» из редактора: урок можно
// открыть и не из схемы модуля (всплывашка «продолжить редактирование» после
// перезагрузки знает только сам урок) — тогда модуль ищем по lesson_ids
export async function findLessonModule(lessonId) {
  if (!lessonId) return null
  const rows = await loadCurricula()
  const m = rows.find(r => (r.lesson_ids ?? []).includes(lessonId))
  return m ? { id: m.id, title: m.title, isPro: !!m.is_pro } : null
}

export async function loadCurricula() {
  dbg('[DB READ] curricula list')
  let { data, error } = await supabase
    .from('curricula')
    .select(CURRICULA_COLS_TR)
    .order('created_at', { ascending: false })
  if (error && /title_translation|word_translations/.test(error.message)) {
    dbg('[DB WARN] нет колонок переводов — применить миграцию 20260725140000_module_translations.sql')
    ;({ data, error } = await supabase
      .from('curricula')
      .select(CURRICULA_COLS)
      .order('created_at', { ascending: false }))
  }
  if (error) {
    dbg('[DB ERROR] curricula load', error.message)
    throw error
  }
  dbg('[DB OK] curricula loaded', data?.length, 'rows')
  return data ?? []
}
