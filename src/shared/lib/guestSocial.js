// Лайки и закладки ГОСТЯ — в localStorage (B7, PLAN_NEW_USER.md, решение №14):
// сердечко и закладка работают сразу, без формы входа. При регистрации/входе
// переезжают в аккаунт (importGuestSocial в moduleSocialApi.js), локальные
// списки чистятся. Хранится только список id модулей, не больше MAX_GUEST_SOCIAL
// на список (при переполнении выпадает самый старый).
export const LIKES_KEY = 'pithy_guest_likes_v1'
export const SAVES_KEY = 'pithy_guest_saves_v1'
export const MAX_GUEST_SOCIAL = 200

// Копия на случай, когда localStorage недоступен (приватный режим): в рамках
// сессии сердечко всё равно работает
const memory = {}

// Чистое переключение: id есть в списке — убрать, нет — добавить в конец
// (лишнее с начала отрезается до max). Исходный массив не меняется
export function toggleIn(list, id, max = MAX_GUEST_SOCIAL) {
  if (list.includes(id)) return list.filter(x => x !== id)
  const next = [...list, id]
  return next.length > max ? next.slice(next.length - max) : next
}

function read(key) {
  try {
    const arr = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (Array.isArray(arr)) return arr.filter(x => typeof x === 'string')
  } catch { /* нет localStorage или битый JSON — смотрим копию в памяти */ }
  return memory[key] ?? []
}

function write(key, list) {
  memory[key] = list
  try {
    if (list.length) localStorage.setItem(key, JSON.stringify(list))
    else localStorage.removeItem(key)
  } catch { /* localStorage недоступен — остаётся копия в памяти */ }
}

function toggle(key, id) {
  const list = read(key)
  write(key, toggleIn(list, id))
  return !list.includes(id) // true — теперь стоит
}

export const getGuestLikes = () => read(LIKES_KEY)
export const getGuestSaves = () => read(SAVES_KEY)
// → true, если лайк/закладка теперь стоит; false — снята
export const toggleGuestLike = id => toggle(LIKES_KEY, id)
export const toggleGuestSave = id => toggle(SAVES_KEY, id)

export const hasGuestSocial = () => getGuestLikes().length > 0 || getGuestSaves().length > 0

export function clearGuestSocial() {
  write(LIKES_KEY, [])
  write(SAVES_KEY, [])
}
