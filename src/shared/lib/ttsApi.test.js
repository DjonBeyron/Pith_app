import { readFileSync as fsSync } from 'node:fs'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./r2.js', () => ({ authHeaders: async () => ({ Authorization: 'Bearer t', 'Content-Type': 'application/json' }) }))
import { generateSpeech, getElevenLabsQuota } from './ttsApi.js'

const ok = data => ({ ok: true, json: async () => data, text: async () => '' })
let calls
beforeEach(() => { calls = []; globalThis.fetch = vi.fn(async (url, init) => { calls.push({ url, init }); return ok(url.includes('quota') ? { used: 10, limit: 10000 } : { audioBase64: btoa('x'), contentType: 'audio/mpeg', wordTimings: [] }) }) })

describe('второй аккаунт ElevenLabs (голос Мии)', () => {
  it('generateSpeech: account mia уходит в запрос вместе с голосом; без него поля нет', async () => {
    await generateSpeech('привет', { account: 'mia', voiceId: 'VOICE12345', voiceSettings: { stability: 0.4 } })
    const b = JSON.parse(calls[0].init.body)
    expect(b).toMatchObject({ text: 'привет', account: 'mia', voiceId: 'VOICE12345', voiceSettings: { stability: 0.4 } })
    await generateSpeech('привет')
    expect(JSON.parse(calls[1].init.body).account).toBeUndefined()
  })
  it('getElevenLabsQuota: ?account=mia только для Мии', async () => {
    await getElevenLabsQuota(); await getElevenLabsQuota('mia')
    expect(calls[0].url).toMatch(/elevenlabs-quota$/); expect(calls[1].url).toMatch(/elevenlabs-quota\?account=mia$/)
  })
  it('серверные функции читают секреты Мии и не трогают основной ключ без account', () => {
    const tts = fsSync('supabase/functions/tts-elevenlabs/index.ts', 'utf8')
    expect(tts).toContain('ELEVENLABS_API_KEY_MIA'); expect(tts).toContain('ELEVENLABS_VOICE_ID_MIA'); expect(tts).toContain('account === "mia"')
    expect(fsSync('supabase/functions/elevenlabs-quota/index.ts', 'utf8')).toContain('ELEVENLABS_API_KEY_MIA')
  })
})
