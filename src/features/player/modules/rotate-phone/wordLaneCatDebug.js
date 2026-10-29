import { pLog } from '../../../../shared/lib/debug.js'

// Журнал реплик кота для «Скачать отладку» (useWordLaneDebug): когда кот говорит, а рот «не двигается», по файлу видно, играла ли дорожка рта.
// События (kind → поля): cat-speak { id, ms, trackLen, empty, up } — реплика началась (trackLen 0 / empty — дорожки не было, рот шёл запасным «жеванием»; up — голова уже торчала);
// cat-speak-end { id, ms, played, shapes, micBlocked, why } — реплика кончилась (played — сколько мс прошло, shapes — сколько раз реально сменилась форма рта, micBlocked — сколько раз микрофонный рот пытался перебить и был отброшен);
// cat-line-silent { id, reason } — реплика показана только подписью (reason: no-url — не озвучена, no-slot — звук не подготовлен): рот не двигался, потому что звука нет.
// Приёмник ставит журнал игры (arm/disarm); без отладки событие идёт только в короткий журнал плеера (pLog) — раз на реплику, не на кадр. Чистый модуль без DOM.
let sink = null

/** Приёмник событий (kind, data) или null; зовёт журнал игры при включённой отладке */
export function setCatDebug(fn) { sink = typeof fn === 'function' ? fn : null }

export function catDebug(kind, data = {}) {
  try { pLog(`[cat] ${kind} ${JSON.stringify(data)}`) } catch { /* журнал не мешает игре */ }
  try { sink?.(kind, data) } catch { /* отладка не мешает игре */ }
}
