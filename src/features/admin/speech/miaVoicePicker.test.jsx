import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import MiaVoicePicker from './MiaVoicePicker.jsx'
import { voiceOf, setMiaVoice, loadMiaVoice, miaVoiceChosen, MIA_VOICE_KEY, isFreeVoice } from '../../pitrace/mia/miaVoice.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('выбор голоса Мии', () => {
  it('бесплатный = premade; без списка — подсказка про право Voices: Read и текущий голос из секрета', () => {
    expect(isFreeVoice({ category: 'premade' })).toBe(true); expect(isFreeVoice({ category: 'professional' })).toBe(false); expect(isFreeVoice(null)).toBe(false)
    const h = renderToStaticMarkup(createElement(MiaVoicePicker, { deps: { get: async () => null } }))
    expect(h).toContain('data-testid="mia-voice-load"'); expect(h).toContain('Выбрать голос Мии'); expect(h).toContain('Voices: Read'); expect(h).toContain('ELEVENLABS_VOICE_ID_MIA')
  })
  it('выбранный голос уходит в запрос озвучки реплик Мии; у реплик Пита голоса нет; null сбрасывает на секрет', () => {
    setMiaVoice({ voiceId: 'abc12345XYZ', name: 'Sarah' })
    expect(voiceOf('mia_push')).toMatchObject({ account: 'mia', voiceId: 'abc12345XYZ' }); expect(voiceOf('pit_back_1')).toBeNull()
    setMiaVoice(null); expect(voiceOf('mia_push').voiceId).toBeUndefined(); expect(miaVoiceChosen()).toBeNull()
  })
  it('loadMiaVoice читает настройку race_mia_voice; сбой чтения — голос из секрета', async () => {
    expect(MIA_VOICE_KEY).toBe('race_mia_voice')
    expect(await loadMiaVoice(async k => (k === 'race_mia_voice' ? { voiceId: 'v12345678', name: 'Alice' } : null))).toEqual({ voiceId: 'v12345678', name: 'Alice' })
    expect(await loadMiaVoice(async () => { throw new Error('нет доступа') })).toEqual({ voiceId: 'v12345678', name: 'Alice' }) // прежнее значение не стёрто сбоем
    setMiaVoice(null)
  })
  it('таблица озвучки показывает выбор голоса; сервер отдаёт список голосов (kind voices) без лишнего', () => {
    expect(read('./RaceMiaVoice.jsx')).toContain('<MiaVoicePicker')
    const srv = read('../../../../supabase/functions/tts-elevenlabs/index.ts')
    expect(srv).toContain('kind === "voices"'); expect(srv).toContain('api.elevenlabs.io/v1/voices'); expect(srv).toContain('preview_url'); expect(srv).toContain('category')
    expect(read('../../../shared/lib/ttsApi.js')).toContain("kind: 'voices'")
  })
})
