import { generateSpeech } from '../../../../shared/lib/ttsApi.js'
import { uploadToR2, deleteFromR2 } from '../../../../shared/lib/r2.js'
import { probeAudioDuration } from '../../../../shared/lib/audioUtils.js'
import {
  voiceSpec, audioHash, timingsFromTts, durationMsFromTimings, DEFAULT_VOICE_ID, AUDIO_FIELDS,
} from '../../../scene/v2/sceneVoice.js'

// Генерация озвучки одной реплики: ElevenLabs (tts-elevenlabs, только админ — JWT в
// authHeaders) → mp3 в R2 (uploadToR2 → r2-upload-url, как файлы уроков) → поля реплики
// { audioUrl, wordTimings, audioMeta }. Зависимости (tts/upload/remove/probeDuration)
// подменяются в тестах — сети там нет. Та же механика, что у NodeAudioTts.jsx, только
// результат не File в ноде, а поля сцены.

export const defaultDeps = {
  tts: (text, voice) => generateSpeech(text, voice),
  upload: file => uploadToR2(file),
  remove: url => deleteFromR2(url),
  probeDuration: file => {
    const url = URL.createObjectURL(file)
    return probeAudioDuration(url).finally(() => URL.revokeObjectURL(url))
  },
}

// voiceSpec персонажа → параметры запроса tts-elevenlabs ('default' → голос секрета, voiceId не шлём)
export function ttsRequest(spec) {
  const req = { modelId: spec.model, voiceSettings: { stability: spec.stability, similarity_boost: spec.similarity, speed: spec.speed } }
  if (spec.voiceId && spec.voiceId !== DEFAULT_VOICE_ID) req.voiceId = spec.voiceId
  return req
}

// → patch { audioUrl, wordTimings, audioMeta: { hash, voiceId, durationMs } }
export async function generateLineAudio(text, character, deps = defaultDeps) {
  const clean = String(text ?? '').trim()
  if (!clean) throw new Error('пустая реплика')
  const spec = voiceSpec(character)
  const { file, wordTimings: raw, voiceId } = await deps.tts(clean, ttsRequest(spec))
  let durationSec = null
  try { durationSec = await deps.probeDuration?.(file) } catch { /* длительность возьмём из таймингов */ }
  const wordTimings = timingsFromTts(raw, durationSec)
  const audioUrl = await deps.upload(file)
  const audioMeta = { hash: audioHash(clean, spec), voiceId: voiceId || spec.voiceId }
  const durationMs = durationMsFromTimings(wordTimings, durationSec)
  if (durationMs !== null) audioMeta.durationMs = durationMs
  const patch = { audioUrl, audioMeta }
  if (wordTimings.length) patch.wordTimings = wordTimings
  return patch
}

// Файл реплики index больше никому в сцене не нужен? (кэш по hash делит один файл между репликами)
export function isOrphanUrl(timeline, url, exceptIndex) {
  if (!url) return false
  return !timeline.some((l, i) => i !== exceptIndex && l?.audioUrl === url)
}

// Удалить файл из R2, если на него не ссылается другая реплика. Best effort: ошибка
// удаления не мешает (файл-сирота останется в бакете, ссылки на него уже нет)
export async function removeOrphan(timeline, url, exceptIndex, deps = defaultDeps) {
  if (!isOrphanUrl(timeline, url, exceptIndex)) return false
  try { await deps.remove(url); return true } catch (e) { console.warn('[sceneVoice] не удалось удалить файл в R2', url, e); return false }
}

// Patch для actions.updateLine, снимающий озвучку (updateLine удаляет поля по null)
export const clearAudioPatch = () => Object.fromEntries(AUDIO_FIELDS.map(k => [k, null]))

// Длительность для бейджа: «2,4 с»
export function fmtDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return ''
  return `${(ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с`
}
