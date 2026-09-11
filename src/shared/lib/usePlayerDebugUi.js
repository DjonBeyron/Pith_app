import { useSyncExternalStore } from 'react'
import { getPlayerDebugUi, savePlayerDebugUi } from '../api/appSettingsApi.js'

// Видят ли НЕ-админы диагностический набор в шапке урока: кнопку «⬇ лог» и
// номер версии. Сама настройка лежит в базе (app_settings.player_debug_ui) —
// она про чужие устройства. Здесь только её доставка в интерфейс.
//
// Зачем зеркало в localStorage: шапка рисуется в первый же кадр урока, а ответ
// сервера приходит позже. Без зеркала кнопка выскакивала бы через полсекунды
// после открытия — ровно то моргание, от которого мы избавлялись весь день.
// Значение с прошлого сеанса даёт правильный первый кадр, а пришедший ответ
// молча уточняет его (и перерисовывает, только если оно и правда изменилось).

const LS = 'pithy_player_debug_ui_v1'

function readLs() {
  try { return localStorage.getItem(LS) === '1' } catch { return false }
}

function writeLs(on) {
  try {
    if (on) localStorage.setItem(LS, '1')
    else localStorage.removeItem(LS)
  } catch { /* приватный режим — переживём, сервер всё равно источник правды */ }
}

let value = readLs()
let loaded = false          // ответ сервера в этом сеансе уже получен
let inflight = null         // чтобы три вызова не сделали три запроса
const subs = new Set()

function apply(on) {
  writeLs(on)
  if (on === value) return
  value = on
  subs.forEach(fn => fn())
}

// Прогрев: зовём один раз на старте приложения, чтобы к открытию урока ответ
// уже был. Ошибку не бросает — без настройки шапка просто останется как есть.
export function prefetchPlayerDebugUi() {
  if (loaded || inflight) return inflight
  inflight = getPlayerDebugUi()
    .then(on => {
      loaded = true
      if (on !== null) apply(on) // null — запрос не удался, зеркало не трогаем
    })
    .catch(() => {})
    .finally(() => { inflight = null })
  return inflight
}

// Переключение из админки: пишем в базу, и только после подтверждения сервера
// (savePlayerDebugUi бросает, если RLS отсекла запись) меняем то, что видно
export async function setPlayerDebugUi(on) {
  await savePlayerDebugUi(on)
  loaded = true
  apply(!!on)
}

export function getPlayerDebugUiValue() { return value }

function subscribe(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

export function usePlayerDebugUi() {
  return useSyncExternalStore(subscribe, getPlayerDebugUiValue, () => false)
}
