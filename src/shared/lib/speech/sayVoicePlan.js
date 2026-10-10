// Что уходит в чат на одну попытку «Сказать фразу»: голосовое с текстом или только текст. Чистое решение planVoice + takeVoice (кладёт клип в реестр сессии и пишет причину в pLog и админскую диагностику).
//  - режим ноды выключен (data.voiceReply !== true) → только текст (off);
//  - распознавало не Vosk (системное, Firefox, Vosk не готов) → ТОЛЬКО ТЕКСТ (system): второй getUserMedia рядом с webkitSpeechRecognition вызывал «глухоту» — компромисс владельца;
//  - Vosk, но клипа нет или он битый (тишина, слишком коротко, ошибка сборки) → только текст, пузырь без пустого плеера (no-audio / silent / short / empty / error);
//  - клип не вошёл в реестр (слишком большой, нет blob-URL) → только текст (limit).
import { putSayVoice } from './sayVoiceStore.js'
import { setVoiceAttempt } from './sayVoiceLast.js'
import { pLog } from '../debug.js'

/** { voice: boolean, reason } — reason: ok | off | system | no-audio | <audio.reason> */
export function planVoice({ voiceOn, engine, audio }) {
  if (!voiceOn) return { voice: false, reason: 'off' }
  if (engine !== 'vosk') return { voice: false, reason: 'system' }
  if (!audio) return { voice: false, reason: 'no-audio' }
  if (!audio.ok || !audio.blob) return { voice: false, reason: audio.reason || 'error' }
  return { voice: true, reason: 'ok' }
}

/** Положить клип попытки в реестр. → { id: string | null, reason }. Не бросает; всегда записывает итог в sayVoiceLast */
export function takeVoice({ voiceOn, engine, audio }, { put = putSayVoice, log = msg => pLog(`[say-voice] ${msg}`) } = {}) {
  const plan = planVoice({ voiceOn, engine, audio })
  let id = null
  let reason = plan.reason
  if (plan.voice) {
    try { id = put(audio.blob, { durationMs: audio.durationMs, peaks: audio.peaks }) } catch { id = null }
    if (!id) reason = 'limit'
  }
  setVoiceAttempt(id ? { ok: true, ms: audio.durationMs, reason: 'ok' } : { ok: false, reason })
  if (voiceOn) log(id ? `голосовое: записано ${(audio.durationMs / 1000).toFixed(1)} с${audio.truncated ? ' (обрезано потолком)' : ''}` : `только текст: ${reason}`)
  return { id, reason }
}
