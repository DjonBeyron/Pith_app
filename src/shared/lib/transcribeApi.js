const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const FUNCTION_URL      = `${SUPABASE_URL}/functions/v1/transcribe-audio`

const BASE_HEADERS = {
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  apikey:        SUPABASE_ANON_KEY,
}

/**
 * Transcribe audio via Groq Whisper (server-side key, never exposed to client).
 *
 * @param {{ file?: File, url?: string }} source
 *   Provide `file` for a local File/Blob (manual pick),
 *   or `url` for an already-uploaded R2 URL (batch mode).
 * @returns {Promise<Array<{ w: string, t: number }>>} wordTimings
 */
export async function transcribeAudio({ file, url }) {
  let body
  let extraHeaders = {}

  if (file) {
    const form = new FormData()
    form.append('file', file, file.name || 'audio.webm')
    body = form
    // Do NOT set Content-Type — browser adds multipart boundary automatically
  } else if (url) {
    body = JSON.stringify({ url })
    extraHeaders = { 'Content-Type': 'application/json' }
  } else {
    throw new Error('[transcribeAudio] provide either file or url')
  }

  const res = await fetch(FUNCTION_URL, {
    method:  'POST',
    headers: { ...BASE_HEADERS, ...extraHeaders },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[transcribeAudio] ${res.status}: ${text}`)
  }

  const { wordTimings, error } = await res.json()
  if (error) throw new Error(`[transcribeAudio] Groq error: ${error}`)
  return wordTimings ?? []
}
