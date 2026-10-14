import { useSyncExternalStore } from 'react'
import { loadFeedSignals, saveFeedSignals, rollbackFeedSignals } from '../../api/feedSignalsApi.js'
import { DEFAULT_CONFIG, normalizeConfig } from './feedConfig.js'

// Клиентский стор конфига движка ленты — то же устройство, что у globalBoolSetting.js:
// зеркало в localStorage (первая сборка ленты не ждёт сервер), один prefetch на
// старте (ShellV2), подписка через useSyncExternalStore. Ошибка сети / нет строки
// → DEFAULT_CONFIG (engine 'legacy') — приложение ведёт себя как раньше.
const LS = 'pithy_feed_signals_v1'

function readLs() {
  try { return normalizeConfig(JSON.parse(localStorage.getItem(LS) ?? 'null')) } catch { return normalizeConfig(DEFAULT_CONFIG) }
}
function writeLs(cfg) {
  try { localStorage.setItem(LS, JSON.stringify(cfg)) } catch { /* приватный режим */ }
}

let value = readLs()
let loaded = false
let inflight = null
const subs = new Set()

function apply(cfg) {
  const next = normalizeConfig(cfg)
  writeLs(next)
  if (JSON.stringify(next) === JSON.stringify(value)) return
  value = next
  subs.forEach(fn => fn())
}

export function prefetchFeedSignals() {
  if (loaded || inflight) return inflight
  inflight = loadFeedSignals()
    .then(cfg => { loaded = true; if (cfg) apply(cfg) })
    .catch(() => {})
    .finally(() => { inflight = null })
  return inflight
}

// Перечитать принудительно (админка после чужого сохранения)
export function refreshFeedSignals() { loaded = false; return prefetchFeedSignals() }

export const getFeedSignals = () => value
const subscribe = fn => { subs.add(fn); return () => subs.delete(fn) }
export const useFeedSignals = () => useSyncExternalStore(subscribe, getFeedSignals, getFeedSignals)

// Админ: сохранить и сразу применить у себя (остальные получат при следующем старте)
export async function setFeedSignals(config, meta) {
  const saved = await saveFeedSignals(config, meta)
  loaded = true
  apply(saved)
  return saved
}

export async function rollbackFeedSignalsTo(updatedAt, meta) {
  const saved = await rollbackFeedSignals(updatedAt, meta)
  apply(saved)
  return saved
}

// Для тестов
export function _resetFeedSignalsStore() { value = normalizeConfig(DEFAULT_CONFIG); loaded = false; inflight = null }
