import { supabase } from './supabase.js'

// Лайки, закладки и прогресс модулей (новый интерфейс, видео-лента).
// Лайки/закладки гостю недоступны — лента предлагает войти. «Начатые модули»
// гость копит локально, при входе они переезжают на сервер.

const LS_STARTED = 'pithy_started_modules_v1'

// Локальное чтение сессии (без сетевого getUser)
async function currentUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

// Один запрос на открытие ленты: счётчики лайков + мои лайки/закладки.
// Лайки читаются целиком (RLS select all) — счётчики считаем на клиенте;
// при росте базы заменить на серверный агрегат.
export async function fetchFeedSocial() {
  const user = await currentUser()

  const { data: likeRows } = await supabase.from('module_likes').select('module_id, user_id')
  const likeCount = {}
  const myLikes = new Set()
  for (const r of likeRows ?? []) {
    likeCount[r.module_id] = (likeCount[r.module_id] ?? 0) + 1
    if (user && r.user_id === user.id) myLikes.add(r.module_id)
  }

  let myBookmarks = new Set()
  if (user) {
    const { data: bm } = await supabase.from('module_bookmarks').select('module_id')
    myBookmarks = new Set((bm ?? []).map(r => r.module_id))
  }

  return { isAuthed: !!user, likeCount, myLikes, myBookmarks }
}

async function setRow(table, moduleId, on) {
  const user = await currentUser()
  if (!user) return false
  if (on) {
    await supabase.from(table).upsert(
      { user_id: user.id, module_id: moduleId },
      { onConflict: 'user_id,module_id', ignoreDuplicates: true },
    )
  } else {
    await supabase.from(table).delete().eq('user_id', user.id).eq('module_id', moduleId)
  }
  return true
}

export const setLike     = (moduleId, on) => setRow('module_likes', moduleId, on)
export const setBookmark = (moduleId, on) => setRow('module_bookmarks', moduleId, on)

// Событие «Репост» — счётчик кликов, не тумблер (можно репостнуть не один
// раз); агрегат repost_count на curricula пересчитывает триггер в БД.
// Гость может делиться ссылкой локально — в счётчик это не попадает.
export async function logRepost(moduleId) {
  const user = await currentUser()
  if (!user) return
  const { error } = await supabase.from('module_reposts').insert({ user_id: user.id, module_id: moduleId })
  if (error) console.error('[SOCIAL] module_reposts insert:', error.message)
}

// Начатые модули текущего пользователя («Мои уроки»). Гость → пустой Set.
// Перед чтением переносит на сервер всё, что гость успел начать до входа.
export async function fetchStartedModules() {
  const user = await currentUser()
  if (!user) return new Set()
  await syncStartedModules(user.id)
  const { data, error } = await supabase.from('user_module_progress').select('module_id')
  if (error) {
    console.error('[PROGRESS] user_module_progress select:', error.message)
    return new Set()
  }
  return new Set((data ?? []).map(r => r.module_id))
}

// Факт «начал модуль» — при запуске стартового урока (проверяет вызывающий).
// Залогиненный → серверная строка (повторы гасит primary key); гость →
// локальный буфер, который переедет на сервер при входе (syncStartedModules).
export async function markModuleStarted(moduleId) {
  const user = await currentUser()
  if (!user) {
    try {
      const arr = JSON.parse(localStorage.getItem(LS_STARTED) ?? '[]')
      if (!arr.includes(moduleId)) {
        localStorage.setItem(LS_STARTED, JSON.stringify([...arr, moduleId]))
      }
    } catch { /* localStorage недоступен — пропускаем */ }
    return
  }
  const { error } = await supabase.from('user_module_progress').upsert(
    { user_id: user.id, module_id: moduleId },
    { onConflict: 'user_id,module_id', ignoreDuplicates: true },
  )
  if (error) console.error('[PROGRESS] user_module_progress upsert:', error.message)
}

// Убрать модуль из «начатых» (полный сброс модуля админской ⟲):
// модуль возвращается в рекомендации
export async function unmarkModuleStarted(moduleId) {
  const user = await currentUser()
  if (!user) return
  const { error } = await supabase.from('user_module_progress')
    .delete()
    .eq('user_id', user.id)
    .eq('module_id', moduleId)
  if (error) console.error('[PROGRESS] удаление начатого модуля:', error.message)
}

// Перенос гостевых «начатых модулей» на сервер (после входа/регистрации)
async function syncStartedModules(userId) {
  let pending = []
  try { pending = JSON.parse(localStorage.getItem(LS_STARTED) ?? '[]') } catch { return }
  if (!pending.length) return
  const rows = pending.map(module_id => ({ user_id: userId, module_id }))
  const { error } = await supabase.from('user_module_progress').upsert(
    rows,
    { onConflict: 'user_id,module_id', ignoreDuplicates: true },
  )
  if (error) console.error('[PROGRESS] перенос гостевых модулей:', error.message)
  else localStorage.removeItem(LS_STARTED)
}
