import { onTrack } from '../analytics/track.js'
import { loadLevelProfile, saveLevelProfile } from '../../api/levelApi.js'
import { applySignal, emptyLevel } from './levelModel.js'
import { loadLevel, saveLevel, clearLevel } from './levelStore.js'
import { signalFromEvent } from './levelSignals.js'
import { effectiveDifficulty } from './effectiveDifficulty.js'

// Состояние уровня приложения (A2, без React): события журнала → сигналы → applySignal.
// Локальная копия (levelStore.js) пишется на каждый сигнал, на сервер уровень уходит с задержкой
// SERVER_SAVE_MS либо при сворачивании страницы. Читают: ранжирование ленты (getLevel →
// buildRankCtx), хуки (subscribeLevel). Подключает оболочка: useLevelTracking.js.
export const SERVER_SAVE_MS = 20000

let level = null // ленивая загрузка: до startLevelTracking уровень — локальная копия
let lookup = { difficultyOf: () => null } // сложность модулей ленты (setModuleLookup)
let userId = '' // '' — гость
let off = null // отписка от onTrack, null — слежение выключено
let timer = null
let pending = false // есть изменения, не ушедшие на сервер
let inflight = null // { user, promise } — идущая загрузка профиля
const listeners = new Set()

export function getLevel() {
  level ??= loadLevel()
  return level
}

export function subscribeLevel(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function setLevel(next) {
  level = next
  for (const fn of listeners) { try { fn(next) } catch { /* слушатель не должен ломать уровень */ } }
}

// Сложность модулей ленты: { difficultyOf(moduleId) → 1|2|3|null }; лента зовёт при обновлении списка
export function setModuleLookup(next) {
  lookup = next ?? { difficultyOf: () => null }
}

// Таблица сложности из списка модулей ленты (effectiveDifficulty: голоса от minVotes, иначе сложность админа);
// ни того, ни другого — сложность не известна → null
export function lookupFromModules(modules, minVotes = 0) {
  const map = new Map()
  for (const m of modules ?? []) {
    const d = effectiveDifficulty(m, minVotes)
    if (m.id && d) map.set(m.id, d)
  }
  return { difficultyOf: id => map.get(id) ?? null }
}

function flushServer() {
  clearTimeout(timer)
  timer = null
  if (!pending || !userId) return
  pending = false
  saveLevelProfile(getLevel()).catch(() => { pending = true })
}

function scheduleServerSave() {
  if (!userId) return
  pending = true
  if (!timer) timer = setTimeout(flushServer, SERVER_SAVE_MS)
}

function handleEvent(name, props) {
  const signal = signalFromEvent(name, props, lookup)
  if (!signal) return
  const next = applySignal(getLevel(), signal)
  if (next === getLevel()) return // неоднозначный сигнал — уровень не менялся
  setLevel(next)
  saveLevel(next)
  scheduleServerSave()
}

// Голос сложности (useFeedSocial): отдельного события в журнале нет (имя нужно вносить в белый список app_event_names)
export const reportDifficultyVote = (moduleId, value) => handleEvent('feed_difficulty_vote', { module_id: moduleId, value })

const hasObs = l => l.ear.n + l.vocab.n > 0

// Читает профиль. Вошёл, а на сервере пусто, но локально уже есть наблюдения гостя — переносим их на сервер
async function syncProfile(user) {
  const before = getLevel()
  const fetched = await loadLevelProfile()
  // Пока грузили, пришли сигналы (есть наблюдения) — локальный уровень свежее серверного, его и отправим.
  // Объект мог смениться и без сигналов (параллельная загрузка «гость → вошедший» успела записать пустой профиль):
  // тогда слать на сервер нечего — начальные 0.5/0.35 без единого наблюдения не должны затирать профиль
  if (level !== before && hasObs(level)) { scheduleServerSave(); return }
  if (user && !hasObs(fetched) && hasObs(before)) {
    saveLevelProfile(before).catch(() => { pending = true; scheduleServerSave() }) // перенос гостя
    return
  }
  setLevel(fetched)
  saveLevel(fetched)
}

function reload(user) {
  if (inflight?.user === user) return inflight.promise
  const promise = syncProfile(user).catch(() => {}).finally(() => { if (inflight?.promise === promise) inflight = null })
  inflight = { user, promise }
  return promise
}

// Пользователь сменился (useLevelTracking): вход — перечитать профиль, выход — сбросить уровень устройства
export function setLevelUser(id) {
  const next = id || ''
  if (next === userId) return Promise.resolve()
  const prev = userId
  flushServer()
  userId = next
  if (!next) {
    if (prev) { clearLevel(); setLevel(emptyLevel()) } // следующий гость не наследует чужой уровень
    return Promise.resolve()
  }
  return reload(next)
}

// difficultyOf — сложность модуля (можно не передавать: лента задаст через setModuleLookup);
// userId — кто сейчас вошёл ('' — гость), чтобы загрузка профиля знала про перенос гостя
export function startLevelTracking({ difficultyOf, userId: id } = {}) {
  if (off) return Promise.resolve()
  if (difficultyOf) setModuleLookup({ difficultyOf })
  userId = id || ''
  off = onTrack(handleEvent)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flushServer)
  }
  return reload(userId)
}

function onVisibility() {
  if (document.visibilityState === 'hidden') flushServer()
}

export function stopLevelTracking() {
  off?.()
  off = null
  flushServer()
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', flushServer)
  }
}

// Только для тестов: чистое состояние
export function _resetLevelFeed() {
  stopLevelTracking()
  clearTimeout(timer)
  level = null; timer = null; userId = ''; pending = false; inflight = null
  lookup = { difficultyOf: () => null }
  listeners.clear()
}
