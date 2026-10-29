import { authHeaders, uploadToR2 } from './r2.js'
import { hashFile } from './fileHash.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const TTS_URL = `${SUPABASE_URL}/functions/v1/tts-elevenlabs`

export const SFX_DEFAULT_PROMPT = 'short cute kitten meow, single soft "mew", rising pitch, no background noise'
export const SFX_DEFAULT_SECONDS = 0.6

/** Текст ошибки для админа: из тела ответа функции достаём error; нет ключа, лимит и т. п. приходят строкой "ElevenLabs error 401: …" */
function failText(status, bodyText) {
  let msg = bodyText
  try { msg = JSON.parse(bodyText)?.error ?? bodyText } catch { /* не JSON — оставляем как есть */ }
  return `Не удалось сгенерировать (${status}): ${String(msg).slice(0, 300)}`
}

/** Ответ функции tts-elevenlabs (kind:'sfx') → { bytes: ArrayBuffer, contentType }. Бросает Error с понятным текстом (нет ключа, лимит, старая версия функции без режима sfx) */
export async function parseSfxResponse(res) {
  if (!res.ok) throw new Error(failText(res.status, await res.text()))
  const data = await res.json()
  if (data?.error) throw new Error(`Не удалось сгенерировать: ${data.error}`)
  // Старая версия функции режима sfx не знает: прочитала бы описание как текст для озвучки (и потратила символы) — kind в ответе нет
  if (data?.kind !== 'sfx' || !data.audioBase64) throw new Error('Функция tts-elevenlabs ещё не обновлена до режима sfx: задеплой её (Actions → Deploy Supabase functions → tts-elevenlabs)')
  const bin = atob(data.audioBase64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes: bytes.buffer, contentType: data.contentType || 'audio/mpeg' }
}

/** Звуковой эффект по описанию через ElevenLabs sound-generation (edge function tts-elevenlabs, kind:'sfx', только админ). Возвращает mp3 как ArrayBuffer */
export async function generateSfx(text, { seconds = SFX_DEFAULT_SECONDS, influence = 0.5 } = {}) {
  const res = await fetch(TTS_URL, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ kind: 'sfx', text, duration_seconds: seconds, prompt_influence: influence }),
  })
  return parseSfxResponse(res)
}

/** Нормализованный WAV (Uint8Array) → R2 тем же путём, что остальные файлы (r2-upload-url). Имя sfx-meow-<хэш>.wav; возвращает публичный url */
export async function uploadSfxWav(wav) {
  const blob = new Blob([wav], { type: 'audio/wav' })
  const hash = (await hashFile(blob)).slice(0, 12)
  return uploadToR2(new File([blob], `sfx-meow-${hash}.wav`, { type: 'audio/wav' }))
}
