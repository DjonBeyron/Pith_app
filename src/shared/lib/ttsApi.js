import { authHeaders } from './r2.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const TTS_URL   = `${SUPABASE_URL}/functions/v1/tts-elevenlabs`
const QUOTA_URL = `${SUPABASE_URL}/functions/v1/elevenlabs-quota`

/**
 * Генерирует голосовое из текста через ElevenLabs (edge function tts-elevenlabs,
 * только админ — в Authorization уходит JWT сессии, см. authHeaders).
 * Возвращает готовый File (mp3) — дальше заводится в ноду тем же путём, что
 * и ручная загрузка файла (см. NodeAudioTts.jsx), плюс тайминги слов, которые
 * ElevenLabs отдаёт сразу вместе с аудио.
 *
 * voice — необязательно (сцены «два кота»: свой голос у каждого персонажа):
 * { voiceId?, modelId?, voiceSettings?: { stability, similarity_boost, speed } }.
 * Без него — голос из серверного секрета ELEVENLABS_VOICE_ID, как у аудио-нод.
 *
 * @param {string} text
 * @param {{ voiceId?: string, modelId?: string, voiceSettings?: object }} [voice]
 * @returns {Promise<{ file: File, wordTimings: Array<{ w: string, t: number, e?: number }>, voiceId?: string }>}
 */
export async function generateSpeech(text, voice = null) {
  const body = { text }
  if (voice?.voiceId) body.voiceId = voice.voiceId
  if (voice?.modelId) body.modelId = voice.modelId
  if (voice?.voiceSettings) body.voiceSettings = voice.voiceSettings

  const res = await fetch(TTS_URL, {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[generateSpeech] ${res.status}: ${body}`)
  }

  const { audioBase64, contentType, wordTimings, voiceId, error } = await res.json()
  if (error) throw new Error(`[generateSpeech] ${error}`)

  const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
  const blob  = new Blob([bytes], { type: contentType || 'audio/mpeg' })
  const file  = new File([blob], `tts-${Date.now()}.mp3`, { type: blob.type })

  return { file, wordTimings: wordTimings ?? [], voiceId }
}

/** Остаток бесплатного лимита символов ElevenLabs за текущий период. */
export async function getElevenLabsQuota() {
  const res = await fetch(QUOTA_URL, {
    method:  'GET',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`[getElevenLabsQuota] ${res.status}`)

  const { used, limit, error } = await res.json()
  if (error) throw new Error(`[getElevenLabsQuota] ${error}`)
  return { used, limit }
}
