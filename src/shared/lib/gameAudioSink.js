// Приёмник событий аудиосессии и глушения микрофона игры («Повтори за диктором») для «Скачать отладку». Ставит пробник доступов и звука (wordLaneDebugProbe.install), снимает uninstall;
// пока приёмника нет, события никуда не идут. Модули gameMicSession / gameMicHold знают только об этом файле, а не об отладке игры (shared не зависит от features).
// Виды: audio-session { mode, why, requested, ok, as (тип сессии после попытки; поле не называем type: оно занято видом записи журнала), prev, supported } — смена navigator.audioSession.type; mic-hold { on, mode, enabled, muted, readyState, tracks, depth, why } — глушение/возврат дорожки.
let sink = null

/** Приёмник (kind, data) или null */
export function setGameAudioSink(fn) { sink = typeof fn === 'function' ? fn : null }

/** Записать событие; отладка никогда не мешает игре */
export function gameAudioNote(kind, data = {}) {
  try { sink?.(kind, data) } catch { /* отладка не мешает игре */ }
}
