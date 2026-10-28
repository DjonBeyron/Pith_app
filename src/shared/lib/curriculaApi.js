import { supabase } from '../api/supabase.js'
import { dbg } from './debug.js'
import { shareInFlight } from './shareInFlight.js'

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
// перед открытием, чтобы не тащить их через пропы из разных экранов. Плюс
// флаг «Ловля слов в ленте» (feed_catch_enabled, миграция 20261008120000) —
// без миграции читаем без него (в ответе колонки не будет = считается включённым)
const TITLE_COLS = 'title, title_translation, word_translations'
export async function loadCurriculumTitleData(id) {
  dbg('[DB READ] curricula title data', id)
  const q = cols => supabase.from('curricula').select(cols).eq('id', id).single()
  let { data, error } = await q(`${TITLE_COLS}, feed_catch_enabled`)
  if (error && /feed_catch_enabled/.test(error.message)) {
    dbg('[DB WARN] нет колонки feed_catch_enabled — применить миграцию 20261008130000_feed_catch.sql')
    ;({ data, error } = await q(TITLE_COLS))
  }
  if (error) {
    dbg('[DB ERROR] curricula title data', error.message)
    throw error
  }
  return data
}

// Название + переводы одним сохранением (редактор названия модуля, админ):
// title, полный перевод фразы и пословный перевод [{ w, t }] в порядке слов.
// Пустые переводы слов не храним — массив остаётся коротким. feedCatchEnabled
// (флаг «Ловля слов в ленте») пишется в том же update; если колонки ещё нет —
// повторяем без неё, чтобы не ломать сохранение переводов
export async function saveCurriculumTitleData(id, { title, titleTranslation, wordTranslations, feedCatchEnabled }) {
  const words = (wordTranslations ?? []).filter(e => (e?.t ?? '').trim() !== '')
    .map(e => ({ w: e.w, t: e.t.trim() }))
  dbg('[DB WRITE] curricula title+translations', id, title, words.length, { feedCatchEnabled })
  const row = { title, title_translation: (titleTranslation ?? '').trim() || null, word_translations: words }
  const upd = r => supabase.from('curricula').update(r).eq('id', id)
  let { error } = await upd(feedCatchEnabled === undefined ? row : { ...row, feed_catch_enabled: feedCatchEnabled !== false })
  if (error && /feed_catch_enabled/.test(error.message)) {
    dbg('[DB WARN] нет колонки feed_catch_enabled — применить миграцию 20261008130000_feed_catch.sql')
    ;({ error } = await upd(row))
  }
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

// Сцена в ленте вместо видео (curricula.scene_id → scenes.id, миграция
// 20261014150000); null — сцены нет. Приоритет «сцена выше видео» решает слайд
export async function updateCurriculumScene(id, sceneId) {
  dbg('[DB WRITE] curricula scene_id', id, sceneId)
  const { error } = await supabase
    .from('curricula')
    .update({ scene_id: sceneId ?? null })
    .eq('id', id)
  if (error) {
    dbg('[DB ERROR] curricula scene_id', error.message)
    throw error
  }
}

const CURRICULA_COLS = 'id, title, lesson_ids, created_at, video_url, poster_url, poster_crop, published, preview_only, difficulty, difficulty_votes, save_count, repost_count, is_pro'
// Колонки переводов названия появляются миграцией 20260725140000, флаг «Ловля
// слов в ленте» — миграцией 20261008120000, сцена ленты — 20261014150000, сложность от админа —
// 20261028120000; пока они не применены, читаем список без них (иначе вся лента падала бы на 400):
// ярусы от полного набора к базовому, спуск — только по ошибке «нет колонки»
const CURRICULA_COLS_TR = `${CURRICULA_COLS}, title_translation, word_translations, feed_catch_enabled`
const CURRICULA_COL_TIERS = [
  { cols: `${CURRICULA_COLS_TR}, scene_id, difficulty_admin`, missing: /difficulty_admin|scene_id|title_translation|word_translations|feed_catch_enabled/, warn: 'нет колонки difficulty_admin — применить миграцию 20261028120000_curricula_difficulty_admin.sql' },
  { cols: `${CURRICULA_COLS_TR}, scene_id`, missing: /scene_id|title_translation|word_translations|feed_catch_enabled/, warn: 'нет колонки scene_id — применить миграцию 20261014150000_curricula_scene_id.sql' },
  { cols: CURRICULA_COLS_TR, missing: /title_translation|word_translations|feed_catch_enabled/, warn: 'нет колонок переводов / ловли слов — применить миграции 20260725140000_module_translations.sql, 20261008130000_feed_catch.sql' },
  { cols: CURRICULA_COLS, missing: null },
]

// Сложность фразы от админа: 1/2/3 или null («авто» — по голосам); колонка curricula.difficulty_admin (миграция 20261028120000)
export async function setCurriculumDifficultyAdmin(id, value) {
  dbg('[DB WRITE] curricula difficulty_admin', id, value)
  const { error } = await supabase
    .from('curricula')
    .update({ difficulty_admin: value ?? null })
    .eq('id', id)
  if (error) {
    dbg('[DB ERROR] curricula difficulty_admin', error.message)
    throw error
  }
}

// Медиа одного модуля для панели админа: видео/постер/кадр + сцена ленты
// (без колонки scene_id — читаем без неё, в ответе её не будет)
const MEDIA_COLS = 'video_url, poster_url, poster_crop'
export async function loadCurriculumMedia(id) {
  dbg('[DB READ] curricula media', id)
  const q = cols => supabase.from('curricula').select(cols).eq('id', id).single()
  let { data, error } = await q(`${MEDIA_COLS}, scene_id`)
  if (error && /scene_id/.test(error.message)) {
    dbg('[DB WARN]', CURRICULA_COL_TIERS[1].warn)
    ;({ data, error } = await q(MEDIA_COLS))
  }
  if (error) {
    dbg('[DB ERROR] curricula media', error.message)
    throw error
  }
  return data ?? {}
}

// В каком модуле лежит урок. Нужно для «назад» из редактора: урок можно
// открыть и не из схемы модуля (всплывашка «продолжить редактирование» после
// перезагрузки знает только сам урок) — тогда модуль ищем по lesson_ids
export async function findLessonModule(lessonId) {
  if (!lessonId) return null
  const rows = await loadCurricula()
  const m = rows.find(r => (r.lesson_ids ?? []).includes(lessonId))
  return m ? { id: m.id, title: m.title, isPro: !!m.is_pro } : null
}

async function fetchCurriculaRows() {
  dbg('[DB READ] curricula list')
  let data = null, error = null
  for (const tier of CURRICULA_COL_TIERS) {
    ;({ data, error } = await supabase
      .from('curricula')
      .select(tier.cols)
      .order('created_at', { ascending: false }))
    if (!error || !tier.missing?.test(error.message)) break
    dbg('[DB WARN]', tier.warn)
  }
  if (error) {
    dbg('[DB ERROR] curricula load', error.message)
    throw error
  }
  dbg('[DB OK] curricula loaded', data?.length, 'rows')
  return data ?? []
}

// На старте список просят лента, «Память» и «Профиль» разом — один запрос на всех
// (shareInFlight.js). Каждый получает свои копии строк: потребители вправе их менять
const sharedCurricula = shareInFlight(fetchCurriculaRows)
export const loadCurricula = () => sharedCurricula().then(rows => rows.map(r => ({ ...r })))
