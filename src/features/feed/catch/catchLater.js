// «Спроси позже» в «Ловле слов»: нейтральный сигнал «не сейчас». Память слов не трогает (ни уровней, ни интервалов, ни
// «услышано»), задание не сгорает — фраза остаётся кандидатом, но стоит на паузе:
//  • обычная пауза — LATER_COOLDOWN_MS (3 часа) после нажатия;
//  • «мягкий сигнал о трении»: LATER_STREAK_LIMIT (3) «позже» подряд на одной фразе → пауза LATER_LONG_MS (7 суток), счёт с нуля.
// «Подряд» = без «Проверить»/«Раскрыть» на этой фразе между нажатиями (resetLaterStreak зовётся при них); запись счёта
// старше LATER_LONG_MS считается устаревшей. Ключ фразы — id модуля. Хранение — localStorage устройства:
//   pithy_catch_later_v1   { [phraseKey]: untilTs }          — пауза до момента (мс)
//   pithy_catch_later_n_v1 { [phraseKey]: { n, at } }        — подряд «позже» и когда было последнее
// Чистые функции (map → map) работают с переданными объектами и временем; тонкие обёртки ниже читают/пишут localStorage.
// Тестовые (принудительные из админки) задания пауз не создают и не проверяют — это решает вызывающий (useSlideCatch).
export const LATER_COOLDOWN_MS = 3 * 60 * 60 * 1000
export const LATER_STREAK_LIMIT = 3
export const LATER_LONG_MS = 7 * 24 * 60 * 60 * 1000
export const LATER_UNTIL_KEY = 'pithy_catch_later_v1'
export const LATER_STREAK_KEY = 'pithy_catch_later_n_v1'
const MAX_ENTRIES = 100 // страховка от разрастания хранилища

const isObj = v => v && typeof v === 'object' && !Array.isArray(v)

// Пауза фразы активна, пока untilTs в будущем
export const isLaterPaused = (untilMap, key, now) => {
  const until = untilMap?.[key]
  return typeof until === 'number' && until > now
}

// Выкидывает истёкшие паузы и мусор; число записей ограничено (остаются самые свежие по концу паузы)
export function pruneUntil(untilMap, now) {
  const rows = Object.entries(isObj(untilMap) ? untilMap : {}).filter(([, u]) => typeof u === 'number' && u > now)
  rows.sort((a, b) => a[1] - b[1])
  return Object.fromEntries(rows.slice(-MAX_ENTRIES))
}

// То же для счётчиков «подряд»: устаревшие (старше LATER_LONG_MS) и битые убираются
export function pruneStreak(streakMap, now) {
  const rows = Object.entries(isObj(streakMap) ? streakMap : {})
    .filter(([, v]) => isObj(v) && v.n > 0 && typeof v.at === 'number' && now - v.at <= LATER_LONG_MS)
  rows.sort((a, b) => a[1].at - b[1].at)
  return Object.fromEntries(rows.slice(-MAX_ENTRIES))
}

// Нажали «Спроси позже» на фразе key. → { until (новая карта пауз), streak (новая карта счётчиков), n (сколько подряд теперь),
// long (сработала длинная пауза 7 суток), pausedUntil (до какого момента фраза на паузе) }
export function applyLater(untilMap, streakMap, key, now) {
  const streak = pruneStreak(streakMap, now)
  const n = (streak[key]?.n ?? 0) + 1
  const long = n >= LATER_STREAK_LIMIT
  const pausedUntil = now + (long ? LATER_LONG_MS : LATER_COOLDOWN_MS)
  if (long) delete streak[key]
  else streak[key] = { n, at: now }
  return { until: { ...pruneUntil(untilMap, now), [key]: pausedUntil }, streak, n, long, pausedUntil }
}

// Фразу проверили или раскрыли — «подряд» прервалось. → новая карта счётчиков (та же, если записи не было)
export function clearStreak(streakMap, key) {
  if (!isObj(streakMap) || !(key in streakMap)) return streakMap
  const rest = { ...streakMap }
  delete rest[key]
  return rest
}

function read(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')
    return isObj(v) ? v : {}
  } catch { return {} }
}
function write(key, map) {
  try { localStorage.setItem(key, JSON.stringify(map)) } catch { /* приватный режим */ }
}

// Фраза сейчас на паузе «Спроси позже»? (не удалось прочитать — не на паузе)
export const isPhraseLaterPaused = (key, now = Date.now()) => isLaterPaused(read(LATER_UNTIL_KEY), key, now)

// Записать нажатие. → { n, long, pausedUntil }
export function noteLater(key, now = Date.now()) {
  const r = applyLater(read(LATER_UNTIL_KEY), read(LATER_STREAK_KEY), key, now)
  write(LATER_UNTIL_KEY, r.until)
  write(LATER_STREAK_KEY, r.streak)
  return { n: r.n, long: r.long, pausedUntil: r.pausedUntil }
}

// «Проверить»/«Раскрыть» на фразе: счёт «подряд» с нуля (пауза, если уже стоит, доживает своё)
export function resetLaterStreak(key) {
  const cur = read(LATER_STREAK_KEY)
  const next = clearStreak(cur, key)
  if (next !== cur) write(LATER_STREAK_KEY, next)
}
