import { supabase } from '../api/supabase.js'
import { dbg } from './debug.js'

// Закладки на ОТДЕЛЬНЫЕ уроки (не путать с module_bookmarks — те на модуль
// целиком, из ленты). Гостю недоступно — как и лайки/закладки модулей.
async function currentUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

export async function listLessonBookmarks() {
  const user = await currentUser()
  if (!user) return new Set()
  const { data, error } = await supabase.from('lesson_bookmarks').select('lesson_id')
  if (error) { dbg('[DB ERROR] lesson_bookmarks list', error.message); return new Set() }
  return new Set((data ?? []).map(r => r.lesson_id))
}

export async function setLessonBookmark(lessonId, on) {
  const user = await currentUser()
  if (!user) return false
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
