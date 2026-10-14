import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const R2_PUBLIC_BASE    = Deno.env.get('R2_PUBLIC_BASE') ?? ''
// Лимит файла Groq Whisper (free tier) — 25 МБ
const MAX_BYTES = 25 * 1024 * 1024

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const GROQ_URL     = 'https://api.groq.com/openai/v1/audio/transcriptions'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// Только залогиненный админ (как в tts-elevenlabs): иначе любой с anon-ключом
// из клиентского бандла жёг бы квоту Groq.
async function requireAdmin(req: Request): Promise<Response | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Unauthorized' }, 401)
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error } = await sb.auth.getUser()
  if (error || !user) return json({ error: 'Unauthorized' }, 401)
  const { data: profile } = await sb
    .from('user_profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return json({ error: 'Forbidden: admin only' }, 403)
  return null
}

// url допустим только https и только с хоста R2_PUBLIC_BASE (SSRF-защита).
// Сравнение по точному hostname из разобранного URL; IP/localhost отсекаются,
// т.к. не совпадают с доменом бакета; userinfo и нестандартный порт запрещены.
function checkAudioUrl(raw: unknown): URL {
  if (typeof raw !== 'string') throw new Error('"url" must be a string')
  let allowedHost: string
  try { allowedHost = new URL(R2_PUBLIC_BASE).hostname.toLowerCase() }
  catch { throw new Error('R2_PUBLIC_BASE is not configured') }
  let u: URL
  try { u = new URL(raw) } catch { throw new Error('Invalid url') }
  if (u.protocol !== 'https:')            throw new Error('Only https urls are allowed')
  if (u.username || u.password)           throw new Error('Credentials in url are not allowed')
  if (u.port && u.port !== '443')         throw new Error('Custom port is not allowed')
  if (u.hostname.toLowerCase() !== allowedHost) throw new Error('Host is not allowed')
  return u
}

// Читает поток с ограничением размера (Content-Length может отсутствовать/лгать).
async function readLimited(resp: Response): Promise<Blob> {
  const len = Number(resp.headers.get('content-length') ?? 0)
  if (len > MAX_BYTES) throw new Error('Audio is too large (max 25 MB)')
  if (!resp.body) throw new Error('Empty response body')
  const reader = resp.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) { await reader.cancel(); throw new Error('Audio is too large (max 25 MB)') }
    chunks.push(value)
  }
  return new Blob(chunks)
}

Deno.serve(async (req) => {
  console.log('[transcribe-audio] incoming', { method: req.method })

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers: CORS })

  const denied = await requireAdmin(req)
  if (denied) return denied

  if (!GROQ_API_KEY) {
    console.error('[transcribe-audio] GROQ_API_KEY not set')
    return json({ error: 'GROQ_API_KEY secret is not configured' }, 500)
  }

  let audioBlob: Blob
  let fileName = 'audio.webm'

  try {
    const ct = req.headers.get('content-type') ?? ''

    if (ct.includes('multipart/form-data')) {
      // Manual file pick — raw audio bytes
      const form = await req.formData()
      const file = form.get('file') as File | null
      if (!file) return json({ error: '"file" field is required in form data' }, 400)
      if (file.size > MAX_BYTES) return json({ error: 'Audio is too large (max 25 MB)' }, 413)
      audioBlob = file
      fileName  = file.name || 'audio.webm'
      console.log('[transcribe-audio] file mode', { fileName, size: file.size })
    } else {
      // Batch / R2-URL mode
      const body = await req.json()
      if (!body?.url) return json({ error: '"url" field is required in JSON body' }, 400)
      const u = checkAudioUrl(body.url)
      console.log('[transcribe-audio] url mode', { host: u.hostname, path: u.pathname })
      // redirect: 'error' — редирект на другой хост = отказ
      const resp = await fetch(u.toString(), { redirect: 'error' })
      if (!resp.ok) return json({ error: `Failed to fetch audio from URL: ${resp.status}` }, 502)
      audioBlob = await readLimited(resp)
      fileName  = u.pathname.split('/').pop() || 'audio.webm'
    }
  } catch (e) {
    console.error('[transcribe-audio] input parse error:', (e as Error).message)
    return json({ error: (e as Error).message }, 400)
  }

  // ── Forward to Groq Whisper ─────────────────────────────────────
  try {
    const groqForm = new FormData()
    groqForm.append('file',                      audioBlob, fileName)
    groqForm.append('model',                     'whisper-large-v3-turbo')
    groqForm.append('response_format',           'verbose_json')
    groqForm.append('timestamp_granularities[]', 'word')

    console.log('[transcribe-audio] calling Groq...')
    const groqRes = await fetch(GROQ_URL, {
      method:  'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body:    groqForm,
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      console.error('[transcribe-audio] Groq error:', groqRes.status, errText)
      return json({ error: `Groq API error ${groqRes.status}: ${errText}` }, 502)
    }

    const result = await groqRes.json()
    console.log('[transcribe-audio] Groq OK, words:', result.words?.length ?? 0)

    // Clean punctuation wrappers, round to 1 decimal, filter empty
    const wordTimings = (result.words ?? [])
      .map((w: { word: string; start: number }) => ({
        w: w.word.replace(/^[\s«»""''"'.,!?;:]+|[\s«»""''"'.,!?;:]+$/g, '').trim(),
        t: Math.round(w.start * 10) / 10,
      }))
      .filter((wt: { w: string }) => wt.w.length > 0)

    return json({ wordTimings, text: result.text ?? '' })

  } catch (e) {
    console.error('[transcribe-audio] unexpected error:', (e as Error).message)
    return json({ error: (e as Error).message }, 500)
  }
})
