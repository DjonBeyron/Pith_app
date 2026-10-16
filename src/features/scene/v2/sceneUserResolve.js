import { ensureSceneWords, onSceneWordsReset } from '../../../shared/lib/memory/sceneWordsStore.js'
import { ensureWordAudio } from '../../../shared/lib/wordAudio/wordAudioEnsure.js'
import { localDate } from '../../../shared/lib/memory/dailyPick.js'
import { SCENE_VARS_WAIT_MS, SCENE_VARS_AUDIO_WAIT_MS } from '../../../shared/lib/memory/sceneVarsConfig.js'
import { sceneAudioCache, prefetchAllowed } from './sceneAudioCache.js'
import { pickUserValues, valueTexts, fillUserScene, sceneWordUrls, varsFingerprint, NO_VALUES } from './sceneUserFill.js'

// Слова пользователя для сцены-шаблона: выбрать из памяти → прогреть озвучку слов → запомнить на сессию (без UI).
//  · Решение (values) запоминается по «день | ключ сцены | отпечаток vars»: то же слово при повторном открытии, на другой
//    день — новое зерно. Сеть и ошибка («не удалось загрузить») в память НЕ кладутся — следующее открытие попробует снова.
//  · Параллельные просьбы об одной сцене делят один промис (3 слайда одной сцены = одна работа и один word_audio-запрос).
//  · Слова памяти грузит общий стор (sceneWordsStore.js): один запрос на сессию на все сцены.
//  · Бюджет ожидания budgetMs общий: озвучка слов ждёт только остаток после загрузки слов, не дольше audioWaitMs.
const decided = new Map() // ключ → values
const flights = new Map() // ключ → промис
const MAX_DECIDED = 300

export const userValuesKey = (scene, key, now = Date.now()) => `${localDate(now)}|${key ?? scene?.id ?? ''}|${varsFingerprint(scene)}`
export const peekUserValues = (scene, key, now) => decided.get(userValuesKey(scene, key, now)) ?? null
export function resetUserValues() { decided.clear(); flights.clear() }
onSceneWordsReset(resetUserValues) // вошёл другой пользователь — выбор слов прежнего не помним

const delay = ms => new Promise(r => setTimeout(r, ms))

// Подкачать озвучку слов в кэш сцен (маленькие mp3), чтобы реплика пошла без ожидания сети
function prefetchWords(urls) {
  if (!urls.length || !prefetchAllowed()) return
  for (const u of urls) sceneAudioCache.prefetch(u, { light: true })
}

// → Promise<{ values, cached }>; cached=false — слова не удалось получить (ошибка сети): показать запасное, решение не помнить
export function resolveUserValues(scene, {
  key = null, now = Date.now(), load = ensureSceneWords, ensureAudio = ensureWordAudio, prefetch = prefetchWords,
  budgetMs = SCENE_VARS_WAIT_MS, audioWaitMs = SCENE_VARS_AUDIO_WAIT_MS,
} = {}) {
  const k = userValuesKey(scene, key, now)
  if (decided.has(k)) return Promise.resolve({ values: decided.get(k), cached: true })
  if (flights.has(k)) return flights.get(k)
  const t0 = Date.now()
  const p = (async () => {
    let res
    try { res = await load() } catch { return { values: NO_VALUES, cached: false } }
    if (!res || res.error) return { values: NO_VALUES, cached: false }
    const values = pickUserValues(scene, res.words, key, localDate(now))
    const texts = valueTexts(values)
    if (texts.length) {
      const left = Math.max(0, budgetMs - (Date.now() - t0))
      await Promise.race([Promise.resolve(ensureAudio(texts)).catch(() => false), delay(Math.min(audioWaitMs, left))])
      prefetch(sceneWordUrls(fillUserScene(scene, values)))
    }
    if (decided.size >= MAX_DECIDED) decided.delete(decided.keys().next().value)
    decided.set(k, values)
    return { values, cached: true }
  })().finally(() => flights.delete(k))
  flights.set(k, p)
  return p
}

// Ожидание значений для одного экземпляра сцены (эффект хука): готово вовремя → onReady(); вышло время / слова не получены →
// onLost() (сцена остаётся с запасным словом и дальше не меняется). Ровно один из колбэков и не больше одного раза; cancel() гасит оба
export function startUserWait(scene, { key, now, waitMs = SCENE_VARS_WAIT_MS, resolve = resolveUserValues, onReady, onLost }) {
  let alive = true
  const timer = setTimeout(() => { if (alive) { alive = false; onLost() } }, waitMs)
  resolve(scene, { key, now, budgetMs: waitMs }).then(r => {
    if (!alive) return
    alive = false
    clearTimeout(timer)
    if (r?.cached) onReady()
    else onLost()
  }, () => {
    if (!alive) return
    alive = false
    clearTimeout(timer)
    onLost()
  })
  return () => { alive = false; clearTimeout(timer) }
}
