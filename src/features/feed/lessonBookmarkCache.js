// Зеркало уроков-закладок в localStorage — чтобы строка появлялась в первый
// же кадр вкладки «Мои уроки», а не на сотню миллисекунд позже остальных.
//
// Модули приходят в MyLessons готовыми пропсами, а закладки — тремя
// последовательными шагами по сети (сессия → lesson_bookmarks → названия
// уроков). Из-за этого список сначала рисовался без них, а потом дорастал.
// Зеркало даёт правильный первый кадр, ответ сервера молча его уточняет.
//
// Ключ включает id пользователя: на общем устройстве чужие закладки не должны
// мелькнуть после смены аккаунта. Неизвестен пользователь — кэша нет.

const KEY = 'pithy_bm_lessons_v1'

function keyFor(userId) {
  return userId ? `${KEY}:${userId}` : null
}

// [{ id, title }] либо пустой массив — как и сам список в MyLessons
export function readCachedBookmarks(userId) {
  const k = keyFor(userId)
  if (!k) return []
  try {
    const raw = JSON.parse(localStorage.getItem(k) ?? '[]')
    return Array.isArray(raw) ? raw.filter(x => x && x.id) : []
  } catch { return [] }
}

export function writeCachedBookmarks(userId, list) {
  const k = keyFor(userId)
  if (!k) return
  try { localStorage.setItem(k, JSON.stringify(list.map(({ id, title }) => ({ id, title })))) }
  catch { /* приватный режим — просто останемся без зеркала */ }
}
