import { supabase } from '../api/supabase.js'
import { dbg } from './debug.js'

// Закладки на ОТДЕЛЬНЫЕ уроки (не путать с module_bookmarks — те на модуль
// целиком, из ленты). Гостю недоступно — как и лайки/закладки модулей.
async function currentUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

// Последний ответ сервера — на сессию. Лента (useBookmarkedLessons) и профиль
// спрашивают список при старте, так что к моменту карточки-ссылки в уроке
// (LessonRefModule) состояние закладки уже известно синхронно и кнопка
// рисуется в правильном виде с первого кадра, а не «появляется позже».
// null — ещё не спрашивали
let cache = null

export function cachedLessonBookmarks() {
  return cache
}

export async function listLessonBookmarks() {
  const user = await currentUser()
  if (!user) { cache = new Set(); return cache }
  const { data, error } = await supabase.from('lesson_bookmarks').select('lesson_id')
  if (error) { dbg('[DB ERROR] lesson_bookmarks list', error.message); return cache ?? new Set() }
  cache = new Set((data ?? []).map(r => r.lesson_id))
  return cache
}

export async function setLessonBookmark(lessonId, on) {
  const user = await currentUser()
  if (!user) return false
  if (cache) { if (on) cache.add(lessonId); else cache.delete(lessonId) }
  if (on) {
    const { error } = await supabase.from('lesson_bookmarks').upsert(
      { user_id: user.id, lesson_id: lessonId },
      { onConflict: 'user_id,lesson_id', ignoreDuplicates: true },
    )
    if (error) dbg('[DB ERROR] lesson_bookmarks add', error.message)
  } else {
    const { error } = await supabase.from('lesson_bookmarks')
      .delete().eq('user_id', user.id).eq('lesson_id', lessonId)
    if (error) dbg('[DB ERROR] lesson_bookmarks remove', error.message)
  }
  return true
}
