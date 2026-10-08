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

// Первая загрузка профиля на старте: четыре бейджа (уровень, билеты, энергия, точка наград) и
// вкладка «Профиль» просят его одновременно, пока кэш пуст — раньше это 5 одинаковых запросов
// подряд. Теперь все присоединяются к одному, пока он в полёте. Только для «кэша ещё нет»:
// обычный refreshProfile() (после урока, награды, записи) всегда идёт свежим запросом
let initialLoad = null
export function ensureProfile() {
  if (cached) return Promise.resolve(cached)
  if (!initialLoad) initialLoad = refreshProfile().finally(() => { initialLoad = null })
  return initialLoad
}

// Для вкладки «Профиль», которая при монтировании хочет свежие данные: если первая загрузка уже
// идёт — присоединяемся к ней, иначе обычное обновление
export function refreshOrJoinProfile() {
  return initialLoad ?? refreshProfile()
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
