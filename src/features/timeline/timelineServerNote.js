// Короткий статус блока «Таймлайн игры» в Админ → «Голос» (TimelineOpenButton.jsx): «последняя игра: … · на сервере N» — одной строкой рядом с кнопкой. Число игр на сервере НЕ запрашивается ради этой
// строки (строка app_settings весит до сотен КБ): экран таймлайна запоминает его при каждом чтении сервера (useTimelineServer → noteServerCount) в localStorage, блок показывает запомненное. Чистые функции.
import { hasScene } from './timelineStore.js'
import { clock } from './timelineFormat.js'

export const SERVER_COUNT_KEY = 'pithy.timeline.serverCount'
const two = n => String(n).padStart(2, '0')

/** Запомнить, сколько игр лежит на сервере (после чтения) */
export function noteServerCount(n, store = globalThis.localStorage) { try { store?.setItem(SERVER_COUNT_KEY, String(Math.max(0, Number(n) || 0))) } catch { /* без хранилища статус просто не запомнится */ } }
/** Запомненное число игр на сервере или null — сервер с этого устройства ещё не смотрели */
export function readServerCount(store = globalThis.localStorage) { try { const v = store?.getItem(SERVER_COUNT_KEY); return v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v) } catch { return null } }

/** Строка статуса: «последняя игра: 12:41, 2:49 · на сервере 3» / «в этом сеансе игр не было · на сервере — откроется на экране» */
export function statusLine(runs, serverCount) {
  const last = (runs ?? []).findLast?.(hasScene) ?? null
  const ev = last?.events ?? [], len = ev.length ? ev[ev.length - 1].t - ev[0].t : 0
  const at = last?.at ? new Date(last.at) : null
  const mine = last ? `последняя игра: ${at && !Number.isNaN(at.getTime()) ? `${two(at.getHours())}:${two(at.getMinutes())}, ` : ''}${clock(len)}` : 'в этом сеансе игр не было'
  return `${mine} · на сервере ${serverCount == null ? '— покажет экран' : serverCount}`
}
