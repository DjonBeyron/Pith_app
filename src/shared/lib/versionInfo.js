// Простая строка версии для админки (шапка и «Быстрый старт»): «3.2.1905 · 09.10.2026 20:15» — версия приложения и дата/время сборки.
// Время сборки — ISO (UTC) из vite.config.js (define __BUILD_TIME__; в dev — время старта dev-сервера). Ничего не пишем в localStorage.
import { APP_VERSION } from './version.js'

const pad = n => String(n).padStart(2, '0')

/** ISO / миллисекунды → «ДД.ММ.ГГГГ ЧЧ:ММ» в ЛОКАЛЬНОЙ таймзоне устройства; пусто или не дата → «—» */
export function formatStamp(value) {
  if (value == null || value === '') return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Данные для показа: версия приложения и время сборки (ISO; нет — null) */
export function readVersionInfo({ version = APP_VERSION, buildTime = typeof __BUILD_TIME__ === 'undefined' ? null : __BUILD_TIME__ } = {}) {
  return { version, buildTime }
}

/** «3.2.1905 · 09.10.2026 20:15»; времени сборки нет (или не дата) — только версия */
export function versionLine({ version, buildTime }) {
  const stamp = buildTime ? formatStamp(buildTime) : '—'
  return stamp === '—' ? `${version}` : `${version} · ${stamp}`
}
