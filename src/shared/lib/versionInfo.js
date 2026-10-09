// Версия приложения с датой сборки и моментом, когда эта версия ВПЕРВЫЕ запущена на устройстве (показывается в админке: шапка и «Быстрый старт»).
// Время сборки — ISO (UTC) из vite.config.js (define __BUILD_TIME__; в dev — время старта dev-сервера). Запись «впервые на устройстве» живёт в
// localStorage: `pithy_version_seen_v1` {version, buildTime, firstSeenAt}; при смене версии новая запись пишется поверх, старая уходит в
// `pithy_version_prev_v1`. Чистые функции (store и время передаются снаружи); noteVersionSeen() зовётся один раз при старте (main.jsx).
import { APP_VERSION } from './version.js'

export const SEEN_KEY = 'pithy_version_seen_v1'
export const PREV_KEY = 'pithy_version_prev_v1'

const pad = n => String(n).padStart(2, '0')

/** ISO / миллисекунды → «ДД.ММ.ГГГГ ЧЧ:ММ» в ЛОКАЛЬНОЙ таймзоне устройства; пусто или не дата → «—» */
export function formatStamp(value) {
  if (value == null || value === '') return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const clean = r => {
  if (!r || typeof r !== 'object' || typeof r.version !== 'string' || !r.version) return null
  return { version: r.version, buildTime: typeof r.buildTime === 'string' ? r.buildTime : null, firstSeenAt: Number.isFinite(r.firstSeenAt) ? r.firstSeenAt : null }
}

/**
 * Новая запись «версия запущена на этом устройстве». seen — прошлая запись (или null). Та же версия — запись не меняется (момент первого запуска сохраняется);
 * другая версия (или записи не было) — новая запись с firstSeenAt = now, а прошлая возвращается как prev.
 * @returns {{ seen: object, prev: object|null, changed: boolean }}
 */
export function updateSeen(seen, { version, buildTime = null, now }) {
  const old = clean(seen)
  if (old && old.version === version) return { seen: old, prev: null, changed: false }
  return { seen: { version, buildTime, firstSeenAt: now }, prev: old, changed: true }
}

const readJson = (store, key) => { try { return clean(JSON.parse(store.getItem(key))) } catch { return null } }

/**
 * Старт приложения: отметить, что эта версия запущена. Возвращает { seen, prev } — prev = предыдущая версия (из `pithy_version_prev_v1`), если была.
 * Хранилище недоступно (приватный режим) — считаем «впервые сейчас», ничего не падает
 */
export function noteVersionSeen({ version = APP_VERSION, buildTime = typeof __BUILD_TIME__ === 'undefined' ? null : __BUILD_TIME__, now = Date.now(), store = globalThis.localStorage } = {}) {
  let seenRaw = null
  try { seenRaw = readJson(store, SEEN_KEY) } catch { /* нет доступа */ }
  const r = updateSeen(seenRaw, { version, buildTime, now })
  try {
    if (r.changed) {
      store.setItem(SEEN_KEY, JSON.stringify(r.seen))
      if (r.prev) store.setItem(PREV_KEY, JSON.stringify(r.prev))
    }
  } catch { /* запись не удалась — покажем то, что есть */ }
  return { seen: r.seen, prev: r.prev ?? readJson(store ?? {}, PREV_KEY) }
}

/** Данные для показа: версия, время сборки (ISO), когда впервые запущена здесь, предыдущая версия. Без отметки при старте — firstSeenAt: null */
export function readVersionInfo({ version = APP_VERSION, buildTime = typeof __BUILD_TIME__ === 'undefined' ? null : __BUILD_TIME__, store = globalThis.localStorage } = {}) {
  let seen = null
  let prev = null
  try { seen = readJson(store, SEEN_KEY); prev = readJson(store, PREV_KEY) } catch { /* нет доступа */ }
  const same = seen && seen.version === version
  return { version, buildTime, firstSeenAt: same ? seen.firstSeenAt : null, prevVersion: prev && prev.version !== version ? prev.version : null }
}

/** «Версия 3.2.1904 · собрана 09.10.2026 20:15 · на этом устройстве с 09.10.2026 20:31 (было 3.2.1903)»; куска без данных нет */
export function versionLine({ version, buildTime, firstSeenAt, prevVersion }) {
  const parts = [`Версия ${version}`]
  if (buildTime) parts.push(`собрана ${formatStamp(buildTime)}`)
  if (firstSeenAt != null) parts.push(`на этом устройстве с ${formatStamp(firstSeenAt)}${prevVersion ? ` (было ${prevVersion})` : ''}`)
  return parts.join(' · ')
}
