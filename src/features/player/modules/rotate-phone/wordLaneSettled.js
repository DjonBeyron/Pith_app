// Реестр «файл прогрева обработан» для ворот запуска игры (wordLaneGate.js) и счётчика «Готовлю звук… 7/15» на карточке. Файл обработан, когда он скачан и декодирован/измерен (ok) или когда скачать/декодировать
// не вышло (fail) — ворота не должны ждать то, что уже не придёт. Пишет wordLaneFetch.js; подписчики (onSettled) получают сигнал на каждый обработанный файл. clearSettled() — игра закрыта (буферы отпущены).
const state = new Map() // адрес → 'ok' | 'fail'
const subs = new Set()

export function settle(url, result) {
  if (state.get(url) === result) return
  state.set(url, result)
  for (const cb of [...subs]) { try { cb(url, result) } catch { /* подписчик не должен ломать загрузку */ } }
}
/** 'ok' | 'fail' | null (ещё не обработан) */
export const settledOf = url => state.get(url) ?? null
export const isSettled = url => state.has(url)
/** Подписка на каждый обработанный файл. → отписка */
export function onSettled(cb) { subs.add(cb); return () => subs.delete(cb) }
export function clearSettled() { state.clear() }
