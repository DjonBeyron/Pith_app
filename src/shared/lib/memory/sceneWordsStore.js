import { supabase } from '../../api/supabase.js'
import { loadSceneWords, WORDS_TTL_MS } from './sceneVarsSource.js'

// Общий (на всё приложение) стор слов пользователя для сцен-шаблонов: ОДИН запрос на сессию (+ обновление раз в 5 минут),
// сколько бы сцен/слайдов ни просили слова одновременно. Без подписок: тот, кому нужны слова, ждёт промис ensureSceneWords();
// синхронно — peekSceneWords() (null, если ещё не загружены). Сеть и разбор — loadSceneWords (sceneVarsSource.js).
let last = null     // { at, result }
let flight = null   // общий промис текущей загрузки
const resetHooks = new Set() // кто ещё помнит данные пользователя (решения о словах сцен) — сбрасывается вместе со стором
export const onSceneWordsReset = fn => { resetHooks.add(fn) }

// Одна общая подписка на вход/выход: другой пользователь — чужие слова и выбор слов не показываем
let watching = false
let uid
function watchAuth() {
  if (watching) return
  watching = true
  try {
    supabase.auth.onAuthStateChange((_e, session) => {
      const id = session?.user?.id ?? null
      if (uid !== undefined && id !== uid) resetSceneWordsStore()
      uid = id
    })
  } catch { /* нет клиента (тесты) */ }
}

export function peekSceneWords(now = Date.now()) {
  return last && now - last.at < WORDS_TTL_MS ? last.result : null
}

// → Promise<{ words, stats, source, error }>; ошибка сети не бросается (words пуст, error задан) и в стор не кладётся
export function ensureSceneWords(ctx = {}) {
  const hit = peekSceneWords(ctx.now ?? Date.now())
  if (hit) return Promise.resolve(hit)
  if (!flight) {
    if (!ctx.load) watchAuth()
    const load = ctx.load ?? loadSceneWords
    flight = Promise.resolve(load(ctx)).then(result => {
      if (!result?.error) last = { at: ctx.now ?? Date.now(), result }
      return result
    }).finally(() => { flight = null })
  }
  return flight
}

// Сменился пользователь / тесты
export function resetSceneWordsStore() { last = null; flight = null; resetHooks.forEach(fn => fn()) }
