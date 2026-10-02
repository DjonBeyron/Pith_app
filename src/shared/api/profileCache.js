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

// Точечная правка кэша без похода в сеть (надел другую косметику): подписчики — например, свой ряд во
// вкладке «Рейтинг» — обновляются сразу, а не после повторной загрузки, когда уже видно «скачок»
export function patchCachedProfile(patch) {
  if (!cached) { refreshProfile(); return } // кэша ещё нет — подтянем целиком (правка уже сохранена на сервере)
  cached = { ...cached, ...patch }
  subs.forEach(fn => fn(cached))
}

export function subscribeProfile(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}
