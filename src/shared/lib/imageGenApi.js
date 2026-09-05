import { authHeaders } from './r2.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const GENERATE_URL = `${SUPABASE_URL}/functions/v1/generate-image`

/**
 * Генерирует картинку из текстового промпта через Gemini API (edge function
 * generate-image). Возвращает готовый File (png/jpeg) — дальше заводится в
 * ноду тем же путём, что и ручная загрузка файла (см. NodeImageGen.jsx).
 *
 * @param {string} prompt
 * @returns {Promise<File>}
 */
export async function generateImage(prompt) {
  const res = await fetch(GENERATE_URL, {
    method:  'POST',
    headers: await authHeaders(),
    body:    JSON.stringify({ prompt }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[generateImage] ${res.status}: ${body}`)
  }

  const { imageBase64, contentType, error } = await res.json()
  if (error) throw new Error(`[generateImage] ${error}`)

  const bytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0))
  const ext   = (contentType || 'image/png').includes('jpeg') ? 'jpg' : 'png'
  const blob  = new Blob([bytes], { type: contentType || 'image/png' })
  return new File([blob], `gen-${Date.now()}.${ext}`, { type: blob.type })
}
