import { describe, it, expect, vi, beforeEach } from 'vitest'

const uploadToR2 = vi.fn()
vi.mock('./r2.js', () => ({ authHeaders: async () => ({ Authorization: 'Bearer t' }), uploadToR2: (...a) => uploadToR2(...a) }))

const { parseSfxResponse, generateSfx, uploadSfxWav, SFX_DEFAULT_PROMPT, SFX_DEFAULT_SECONDS } = await import('./sfxApi.js')

const b64 = bytes => btoa(String.fromCharCode(...bytes))
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })

beforeEach(() => { uploadToR2.mockReset(); vi.unstubAllGlobals() })

describe('разбор ответа tts-elevenlabs (kind: sfx)', () => {
  it('успех: base64 → байты mp3 и тип', async () => {
    const r = await parseSfxResponse(reply(200, { kind: 'sfx', audioBase64: b64([1, 2, 3, 255]), contentType: 'audio/mpeg' }))
    expect(Array.from(new Uint8Array(r.bytes))).toEqual([1, 2, 3, 255])
    expect(r.contentType).toBe('audio/mpeg')
  })

  it('нет ключа/лимит ElevenLabs: текст ошибки из тела показывается как есть', async () => {
    await expect(parseSfxResponse(reply(502, { error: 'ElevenLabs error 401: {"detail":{"status":"invalid_api_key"}}' }))).rejects.toThrow(/401.*invalid_api_key/)
    await expect(parseSfxResponse(reply(500, { error: 'ELEVENLABS_API_KEY secret не настроен' }))).rejects.toThrow(/не настроен/)
    await expect(parseSfxResponse(reply(502, 'quota exceeded (not json)'))).rejects.toThrow(/quota exceeded/)
  })

  it('200 с полем error — тоже ошибка', async () => {
    await expect(parseSfxResponse(reply(200, { error: 'лимит' }))).rejects.toThrow(/лимит/)
  })

  it('старая версия функции (нет kind: sfx, пришла озвучка) — подсказка задеплоить', async () => {
    await expect(parseSfxResponse(reply(200, { audioBase64: b64([1]), contentType: 'audio/mpeg', wordTimings: [] }))).rejects.toThrow(/Deploy Supabase functions/)
  })
})

describe('generateSfx / uploadSfxWav', () => {
  it('шлёт kind: sfx, описание, длительность и prompt_influence с токеном админа', async () => {
    const fetchMock = vi.fn(async () => reply(200, { kind: 'sfx', audioBase64: b64([9]), contentType: 'audio/mpeg' }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await generateSfx(SFX_DEFAULT_PROMPT, { seconds: 0.8, influence: 0.4 })
    expect(new Uint8Array(r.bytes)[0]).toBe(9)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/functions\/v1\/tts-elevenlabs$/)
    expect(init.method).toBe('POST'); expect(init.headers.Authorization).toBe('Bearer t')
    expect(JSON.parse(init.body)).toEqual({ kind: 'sfx', text: SFX_DEFAULT_PROMPT, duration_seconds: 0.8, prompt_influence: 0.4 })
  })

  it('значения по умолчанию: 0,6 с, запрос про котёнка', async () => {
    const fetchMock = vi.fn(async () => reply(200, { kind: 'sfx', audioBase64: b64([1]) }))
    vi.stubGlobal('fetch', fetchMock)
    await generateSfx('x')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).duration_seconds).toBe(SFX_DEFAULT_SECONDS)
    expect(SFX_DEFAULT_SECONDS).toBe(0.6)
    expect(SFX_DEFAULT_PROMPT).toContain('kitten meow')
  })

  it('uploadSfxWav грузит wav в R2 файлом sfx-meow-<хэш>.wav и возвращает публичный url', async () => {
    uploadToR2.mockResolvedValue('https://cdn.example/chat/abc.wav')
    const url = await uploadSfxWav(new Uint8Array([82, 73, 70, 70, 1, 2, 3]))
    expect(url).toBe('https://cdn.example/chat/abc.wav')
    const file = uploadToR2.mock.calls[0][0]
    expect(file.name).toMatch(/^sfx-meow-[0-9a-f]{12}\.wav$/)
    expect(file.type).toBe('audio/wav')
  })
})
