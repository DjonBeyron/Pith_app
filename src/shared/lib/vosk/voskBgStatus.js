// Состояние фоновой загрузки модели для админской строки диагностики (в пользовательском интерфейсе не показывается).
// Модуль-одиночка с подпиской (useSyncExternalStore). state: idle | check | cached | downloading | waiting | error | off | other
import { useSyncExternalStore } from 'react'
import { REASON_TEXT } from './voskBgPolicy.js'
import { fmtMb } from './voskDownload.js'

export const INITIAL_STATUS = { state: 'idle', pct: null, loaded: 0, total: null, reason: null, error: '', mode: null, attempt: 0 }
let snap = INITIAL_STATUS
const subs = new Set()

export const getBgStatus = () => snap
export function setBgStatus(patch) {
  snap = { ...snap, ...patch }
  subs.forEach(f => f())
}
export const resetBgStatus = () => setBgStatus({ ...INITIAL_STATUS })
export function subscribeBgStatus(fn) { subs.add(fn); return () => subs.delete(fn) }
/** Один раз сообщить, когда статус стал «в кэше» (переход, а не каждый шаг прогресса). Возвращает отписку. Для прогрева модели, если фоновая загрузка закончилась при открытой панели */
export function onBgCached(fn) {
  let was = snap.state === 'cached'
  return subscribeBgStatus(() => { const now = snap.state === 'cached'; const fire = now && !was; was = now; if (fire) fn() })
}
export const useBgStatus = () => useSyncExternalStore(subscribeBgStatus, getBgStatus)

/** Одна строка для админа. inCache — модель уже лежит в кэше (по peek), даже если фоновая загрузка в этой сессии ничего не качала */
export function bgStatusText(s, inCache = false) {
  const pct = s.pct != null ? `${s.pct}%` : fmtMb(s.loaded)
  if (s.state === 'downloading') return `качается ${pct}${s.mode ? ` (${s.mode === 'range' ? 'кусками' : s.mode === 'full' ? 'целиком' : 'докачка'})` : ''}`
  if (s.state === 'waiting') return `ждёт (причина: ${REASON_TEXT[s.reason] ?? s.reason ?? '—'})${s.loaded ? ` · скачано ${pct}` : ''}`
  if (s.state === 'error') return `ошибка: ${s.error || 'неизвестная'}${s.attempt ? ` (попытка ${s.attempt})` : ''}`
  if (s.state === 'off') return 'выключена'
  if (s.state === 'cached' || inCache) return 'в кэше'
  if (s.state === 'other') return 'ведёт другая вкладка'
  if (s.state === 'check') return 'проверка…'
  return 'ещё не запускалась'
}
