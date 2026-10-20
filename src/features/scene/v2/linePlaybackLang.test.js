import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectLang, pickVoiceFor, pickRuVoice, speakFallback } from './linePlayback.js'

// Запасной синтез устройства: язык по тексту (en-US для английского оригинала, ru-RU для перевода) и голос того же языка
const voices = [
  { name: 'Milena', lang: 'ru-RU', voiceURI: 'ru1', localService: true },
  { name: 'Google русский', lang: 'ru_RU', voiceURI: 'ru2', localService: false },
  { name: 'Google UK English Female', lang: 'en-GB', voiceURI: 'en-gb', localService: false },
  { name: 'Samantha', lang: 'en-US', voiceURI: 'en-us', localService: true },
]
let spoken
beforeEach(() => {
  spoken = []
  globalThis.window = {
    speechSynthesis: { getVoices: () => voices, cancel: vi.fn(), speak: vi.fn(u => spoken.push(u)) },
    SpeechSynthesisUtterance: function Utt(text) { this.text = text },
  }
})
afterEach(() => { delete globalThis.window })

describe('detectLang', () => {
  it('латиница → en-US, кириллица → ru-RU, смешанное — по большинству, пусто → en-US', () => {
    expect(detectLang('Can I have cheese, please?')).toBe('en-US')
    expect(detectLang('Можно мне сыр?')).toBe('ru-RU')
    expect(detectLang('Можно мне cheese, пожалуйста?')).toBe('ru-RU')
    expect(detectLang('')).toBe('en-US')
    expect(detectLang('12 !')).toBe('en-US')
  })
})

describe('pickVoiceFor', () => {
  it('английский: голос en, точное en-US важнее en-GB; русский: ru и ru_RU', () => {
    expect(pickVoiceFor('en-US').voiceURI).toBe('en-us')
    expect(pickVoiceFor('ru-RU').voiceURI).toBe('ru1')           // локальный русский
    expect(pickRuVoice().voiceURI).toBe('ru1')
  })
  it('точный voiceId действует только внутри языка; нет голоса языка → null (таймер), а не чужой язык', () => {
    expect(pickVoiceFor('en-US', 'en-gb').voiceURI).toBe('en-gb')
    expect(pickVoiceFor('en-US', 'ru1').voiceURI).toBe('en-us')   // русский голос для английского текста не берём
    globalThis.window.speechSynthesis.getVoices = () => [voices[0]]
    expect(pickVoiceFor('en-US')).toBeNull()
  })
  it('нет speechSynthesis → null', () => {
    delete globalThis.window
    expect(pickVoiceFor('en-US')).toBeNull()
  })
})

describe('speakFallback — язык реплики', () => {
  it('по умолчанию синтез устройства выключен (SCENE_DEVICE_SYNTH=false): без synth:true — таймер, speak не зовётся', () => {
    const onMode = vi.fn()
    const cancel = speakFallback('Can I have cheese, please?', { pitch: 1, rate: 1 }, { sound: true, onMode })
    expect(onMode).toHaveBeenCalledWith('timer')
    expect(spoken).toHaveLength(0)
    cancel()
  })
  const noTimers = { setInterval: () => 1, clearInterval: () => {} }
  it('английский текст: u.lang en-US и английский голос (раньше было жёстко ru-RU)', () => {
    const cancel = speakFallback('Can I have cheese, please?', { pitch: 1, rate: 1 }, { sound: true, synth: true, onMode: () => {} })
    expect(spoken).toHaveLength(1)
    expect(spoken[0].lang).toBe('en-US')
    expect(spoken[0].voice.voiceURI).toBe('en-us')
    cancel()
  })
  it('перевод по-русски: ru-RU и русский голос; явный lang важнее определения', () => {
    speakFallback('Можно мне сыр, пожалуйста?', { pitch: 1, rate: 1 }, { sound: true, synth: true })
    expect(spoken[0].lang).toBe('ru-RU')
    expect(spoken[0].voice.lang).toMatch(/^ru/)
    speakFallback('Hello', { pitch: 1, rate: 1 }, { sound: true, synth: true, lang: 'ru-RU' })
    expect(spoken[1].lang).toBe('ru-RU')
  })
  it('нет голоса нужного языка → таймер (onMode timer), синтез не вызывается', () => {
    globalThis.window.speechSynthesis.getVoices = () => [voices[0]]
    const onMode = vi.fn()
    const cancel = speakFallback('Hello there', { rate: 1 }, { sound: true, synth: true, onMode })
    expect(onMode).toHaveBeenCalledWith('timer')
    expect(spoken).toHaveLength(0)
    cancel()
    void noTimers
  })
})
