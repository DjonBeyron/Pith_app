// Состояние фоновой загрузки модели для админской строки диагностики (в пользовательском интерфейсе не показывается).
// Модуль-одиночка с подпиской (useSyncExternalStore). state: idle | check | cached | downloading | waiting | error | off | other
import { useSyncExternalStore } from 'react'
import { REASON_TEXT } from './voskBgPolicy.js'
import { fmtMb } from './voskDownload.js'

export const INITIAL_STATUS = { state: 'idle', pct: null, loaded: 0, total: null, reason: null, error: '', mode: null, attempt: 0 }

/** Одно хранилище статуса фоновой загрузки: get / set / reset / subscribe / onCached. Английская модель — основное (ниже), русская — отдельное (lang 'ru'), чтобы их загрузки не путали статус друг друга */
export function createBgStatus() {
  let snap = INITIAL_STATUS
  const subs = new Set()
  const get = () => snap
  const set = patch => { snap = { ...snap, ...patch }; subs.forEach(f => f()) }
  const subscribe = fn => { subs.add(fn); return () => subs.delete(fn) }
  /** Один раз сообщить, когда статус стал «в кэше» (переход, а не каждый шаг прогресса). Возвращает отписку */
  const onCached = fn => {
    let was = snap.state === 'cached'
    return subscribe(() => { const now = snap.state === 'cached'; const fire = now && !was; was = now; if (fire) fn() })
  }
  return { get, set, reset: () => set({ ...INITIAL_STATUS }), subscribe, onCached }
}

const main = createBgStatus()
const ru = createBgStatus()
/** Хранилище статуса по языку модели: 'ru' — русская, иначе английская */
export const bgStatusOf = (lang = 'en') => (lang === 'ru' ? ru : main)

export const getBgStatus = main.get
export const setBgStatus = main.set
export const resetBgStatus = main.reset
export const subscribeBgStatus = main.subscribe
/** Один раз сообщить, когда статус стал «в кэше» (lang — какая модель). Возвращает отписку. Для прогрева модели, если фоновая загрузка закончилась при открытой панели */
export const onBgCached = (fn, lang = 'en') => bgStatusOf(lang).onCached(fn)
export const useBgStatus = (lang = 'en') => { const st = bgStatusOf(lang); return useSyncExternalStore(st.subscribe, st.get) }

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
