import { authHeaders } from './r2.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const TTS_URL   = `${SUPABASE_URL}/functions/v1/tts-elevenlabs`
const QUOTA_URL = `${SUPABASE_URL}/functions/v1/elevenlabs-quota`

/**
 * Генерирует голосовое из текста через ElevenLabs (edge function tts-elevenlabs).
 * Возвращает готовый File (mp3) — дальше заводится в ноду тем же путём, что
 * и ручная загрузка файла (см. NodeAudioTts.jsx), плюс тайминги слов, которые
 * ElevenLabs отдаёт сразу вместе с аудио.
 *
 * @param {string} text
 * @returns {Promise<{ file: File, wordTimings: Array<{ w: string, t: number }> }>}
 */
export async function generateSpeech(text) {
  const res = await fetch(TTS_URL, {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ text }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[generateSpeech] ${res.status}: ${body}`)
  }

  const { audioBase64, contentType, wordTimings, error } = await res.json()
  if (error) throw new Error(`[generateSpeech] ${error}`)

  const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
  const blob  = new Blob([bytes], { type: contentType || 'audio/mpeg' })
  const file  = new File([blob], `tts-${Date.now()}.mp3`, { type: blob.type })

  return { file, wordTimings: wordTimings ?? [] }
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
