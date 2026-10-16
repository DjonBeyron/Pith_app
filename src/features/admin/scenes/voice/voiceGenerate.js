import { generateSpeech } from '../../../../shared/lib/ttsApi.js'
import { uploadToR2, deleteFromR2 } from '../../../../shared/lib/r2.js'
import { probeAudioDuration } from '../../../../shared/lib/audioUtils.js'
import {
  voiceSpec, translationVoiceSpec, audioHash, timingsFromTts, durationMsFromTimings, DEFAULT_VOICE_ID, AUDIO_SETS,
} from '../../../scene/v2/sceneVoice.js'
import { segmentUrls } from '../../../scene/v2/sceneVarsSegments.js'

// Генерация озвучки одной реплики: ElevenLabs (tts-elevenlabs, только админ — JWT в
// authHeaders) → mp3 в R2 (uploadToR2 → r2-upload-url, как файлы уроков) → нейтральный patch
// { audioUrl, wordTimings, audioMeta }. Один путь для двух наборов (sceneVoice.AUDIO_SETS):
// оригинал — text голосом персонажа, перевод — translation голосом перевода
// (translationVoiceSpec); в поля набора patch переводит voicePlan.toSetPatch. Зависимости
// (tts/upload/remove/probeDuration) подменяются в тестах — сети там нет.

export const defaultDeps = {
  tts: (text, voice) => generateSpeech(text, voice),
  upload: file => uploadToR2(file),
  remove: url => deleteFromR2(url),
  probeDuration: file => {
    const url = URL.createObjectURL(file)
    return probeAudioDuration(url).finally(() => URL.revokeObjectURL(url))
  },
}

// voiceSpec → параметры запроса tts-elevenlabs ('default' → голос секрета, voiceId не шлём)
export function ttsRequest(spec) {
  const req = { modelId: spec.model, voiceSettings: { stability: spec.stability, similarity_boost: spec.similarity, speed: spec.speed } }
  if (spec.voiceId && spec.voiceId !== DEFAULT_VOICE_ID) req.voiceId = spec.voiceId
  return req
}

// Текст + голос → нейтральный patch { audioUrl, wordTimings, audioMeta: { hash, voiceId, durationMs } }
export async function generateAudio(text, spec, deps = defaultDeps) {
  const clean = String(text ?? '').trim()
  if (!clean) throw new Error('пустая реплика')
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

// Оригинал: text голосом персонажа
export function generateLineAudio(text, character, deps = defaultDeps) {
  return generateAudio(text, voiceSpec(character), deps)
}

// Перевод: translation голосом перевода (персонаж → сцена → голос проекта)
export function generateTranslationAudio(translation, character, scene, deps = defaultDeps) {
  return generateAudio(translation, translationVoiceSpec(character, scene), deps)
}

// Набор → генерация по реплике (useSceneVoice/useVoiceAll)
export function generateSetAudio(set, line, character, scene, deps = defaultDeps) {
  return set === 'translation' ? generateTranslationAudio(line?.translation, character, scene, deps) : generateLineAudio(line?.text, character, deps)
}

// Файл больше никому в сцене не нужен? Кэш по hash делит один файл между репликами и наборами,
// поэтому смотрим url обоих наборов у всех реплик, кроме самого (exceptIndex, exceptSet)
// (файлы частей реплик-шаблонов, segments, тоже считаются ссылками)
export function isOrphanUrl(timeline, url, exceptIndex, exceptSet = 'original') {
  if (!url) return false
  return !timeline.some((l, i) => segmentUrls(l).includes(url) || Object.entries(AUDIO_SETS).some(([set, s]) => !(i === exceptIndex && set === exceptSet) && l?.[s.url] === url))
}

// Файл части шаблона: timeline — УЖЕ с новыми segments реплики; удаляем из R2, если нигде не используется
export async function removeOrphanIn(timeline, url, deps = defaultDeps) {
  if (!isOrphanUrl(timeline, url, -1)) return false
  try { await deps.remove(url); return true } catch (e) { console.warn('[sceneVoice] не удалось удалить файл в R2', url, e); return false }
}

// Пункт плана → нейтральный patch: часть шаблона (item.seg) — её текст голосом персонажа, иначе набор реплики целиком
export function generateItemAudio(item, scene, deps = defaultDeps) {
  const character = scene.characters?.[item.who]
  if (item.seg !== undefined) return generateLineAudio(item.text, character, deps)
  return generateSetAudio(item.set, scene.timeline[item.index], character, scene, deps)
}

// Удалить файл из R2, если на него не ссылается другая реплика. Best effort: ошибка
// удаления не мешает (файл-сирота останется в бакете, ссылки на него уже нет)
export async function removeOrphan(timeline, url, exceptIndex, deps = defaultDeps, exceptSet = 'original') {
  if (!isOrphanUrl(timeline, url, exceptIndex, exceptSet)) return false
  try { await deps.remove(url); return true } catch (e) { console.warn('[sceneVoice] не удалось удалить файл в R2', url, e); return false }
}

// Patch для actions.updateLine, снимающий озвучку набора (updateLine удаляет поля по null)
export const clearAudioPatch = (set = 'original') => {
  const s = AUDIO_SETS[set] ?? AUDIO_SETS.original
  return { [s.url]: null, [s.timings]: null, [s.meta]: null }
}

// Длительность для бейджа: «2,4 с»
export function fmtDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return ''
  return `${(ms / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} с`
}
