import { pLog } from '../../../../shared/lib/debug.js'
import { sceneTrace, scenePush } from '../../../../shared/lib/sceneTrace.js'

// Журнал реплик кота для «Скачать отладку» (useWordLaneDebug): когда кот говорит, а рот «не двигается», по файлу видно, играла ли дорожка рта.
// События (kind → поля): cat-speak { id, ms, trackLen, empty, up } — реплика началась (trackLen 0 / empty — дорожки не было, рот шёл запасным «жеванием»; up — голова уже торчала);
// cat-speak-end { id, ms, played, shapes, micBlocked, why } — реплика кончилась (played — сколько мс прошло, shapes — сколько раз реально сменилась форма рта, micBlocked — сколько раз микрофонный рот пытался перебить и был отброшен);
// cat-line-silent { id, reason } — реплика показана только подписью (reason: no-url — не озвучена, no-slot — звук не подготовлен): рот не двигался, потому что звука нет.
// cat-voice { id, source, slot, play, error, playMs, activation, as, sinceTap, sinceSettle, interrupts, waitedMs, why } — как реплика озвучена и звучала ли (wordLaneCatVoiceLog.js; первые 15 с игры) — из него экспорт строит «Почему первая реплика тихая».
// Приёмник ставит журнал игры (arm/disarm); без отладки событие идёт только в короткий журнал плеера (pLog) — раз на реплику, не на кадр. Чистый модуль без DOM.
let sink = null

/** Приёмник событий (kind, data) или null; зовёт журнал игры при включённой отладке */
export function setCatDebug(fn) { sink = typeof fn === 'function' ? fn : null }

/** quiet: только в журнал игры — в журнал плеера строку пишет сам вызывающий (читаемую, как «[cat-voice] …»), JSON рядом был бы дублем */
export function catDebug(kind, data = {}, { quiet = false } = {}) {
  if (!quiet) { try { pLog(`[cat] ${kind} ${JSON.stringify(data)}`) } catch { /* журнал не мешает игре */ } }
  if (kind === 'cat-speak') sceneTrace.speak(data); else if (kind === 'cat-speak-end') sceneTrace.end(data); else if (kind === 'cat-line-silent') scenePush('line-silent', { id: data?.id, reason: data?.reason }) // трасса сцены («Таймлайн игры», sceneTrace.js): начало / конец речи Пита; запись не бросает
  try { sink?.(kind, data) } catch { /* отладка не мешает игре */ }
}
