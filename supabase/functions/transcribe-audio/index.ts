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

Deno.serve(async (req) => {
  console.log('[transcribe-audio] incoming', { method: req.method })

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405 })

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
      audioBlob = file
      fileName  = file.name || 'audio.webm'
      console.log('[transcribe-audio] file mode', { fileName, size: file.size })
    } else {
      // Batch / R2-URL mode
      const body = await req.json()
      const { url } = body
      if (!url) return json({ error: '"url" field is required in JSON body' }, 400)
      console.log('[transcribe-audio] url mode', { url })
      const resp = await fetch(url)
      if (!resp.ok) return json({ error: `Failed to fetch audio from URL: ${resp.status}` }, 502)
      audioBlob = await resp.blob()
      fileName  = url.split('/').pop()?.split('?')[0] ?? 'audio.webm'
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
