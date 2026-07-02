import { getProfile } from './profileApi.js'

// Кэш профиля в памяти + подписчики. Задача: после урока плеер фоном вызывает
// refreshProfile(), и вкладка «Профиль» открывается сразу со свежим XP,
// без мигания старых цифр (раньше она тянула профиль только при монтировании).
let cached = null
const subs = new Set()

export function getCachedProfile() {
  return cached
}

export function clearProfileCache() {
  cached = null
}

export async function refreshProfile() {
  cached = await getProfile()
  subs.forEach(fn => fn(cached))
  return cached
}

export function subscribeProfile(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}
