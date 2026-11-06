// Приёмник событий аудиосессии и глушения микрофона игры («Повтори за диктором») для «Скачать отладку». Ставит пробник доступов и звука (wordLaneDebugProbe.install), снимает uninstall;
// пока приёмника нет, события никуда не идут. Модули gameMicSession / gameMicHold знают только об этом файле, а не об отладке игры (shared не зависит от features).
// Виды: audio-session { mode, why, requested, ok, as (тип сессии после попытки; поле не называем type: оно занято видом записи журнала), prev, supported } — смена navigator.audioSession.type; mic-hold { on, mode, enabled, muted, readyState, tracks, depth, why } — глушение/возврат дорожки.
import { gameJournal } from './gameJournal.js'

// В журнал игры (gameJournal.js — «Скачать журнал» в шестерёнке) уходят события жизни звука, даже когда приёмника отладки нет: по ним разбирают «немое после сворачивания».
// Состояние игрового контекста (game-ctx) не дублируем — его строка «[game-audio] AudioContext игры → …» уже идёт через pLog; звуки нот и плашки — слишком часто и не про причину.
export const JOURNAL_KINDS = new Set(['audio-interrupt', 'audio-life', 'audio-restart', 'audio-session', 'audio-warm', 'mic-hold', 'start-mark'])
let sink = null

/** Приёмник (kind, data) или null */
export function setGameAudioSink(fn) { sink = typeof fn === 'function' ? fn : null }

/** Записать событие; отладка никогда не мешает игре */
export function gameAudioNote(kind, data = {}) {
  try { sink?.(kind, data) } catch { /* отладка не мешает игре */ }
  if (JOURNAL_KINDS.has(kind)) gameJournal.note(kind, data)
}
