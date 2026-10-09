import { describe, it, expect } from 'vitest'
import { SAY_AUDIOSESSION_KEY, isSayAudioSessionOn, setSayAudioSessionOn, sayAudioSessionType } from './sayAudioSession.js'
import { sayReducer, initialSayState } from './sayFlow.js'

const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }
const broken = () => ({ getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') }, removeItem() { throw new Error('x') } })

describe('флаг админа «аудиосессия play-and-record для модуля» (pithy_say_audiosession_v1)', () => {
  it('по умолчанию ВЫКЛ; включение и выключение; тип для контроллера', () => {
    const st = memStore()
    expect(SAY_AUDIOSESSION_KEY).toBe('pithy_say_audiosession_v1')
    expect(isSayAudioSessionOn(st)).toBe(false)
    expect(sayAudioSessionType(st)).toBe(null)
    setSayAudioSessionOn(true, st)
    expect(isSayAudioSessionOn(st)).toBe(true)
    expect(sayAudioSessionType(st)).toBe('play-and-record')
    setSayAudioSessionOn(false, st)
    expect(isSayAudioSessionOn(st)).toBe(false)
  })
  it('localStorage недоступен — выкл, ничего не падает', () => {
    expect(isSayAudioSessionOn(broken())).toBe(false)
    expect(() => setSayAudioSessionOn(true, broken())).not.toThrow()
  })
  it('sayFlow: begin запоминает тип для админской плашки', () => {
    const s0 = initialSayState({ action: 'begin' })
    expect(sayReducer(s0, { type: 'begin', data: { phrase: 'hi' }, audioSession: 'play-and-record' }).audioSession).toBe('play-and-record')
    expect(sayReducer(s0, { type: 'begin', data: { phrase: 'hi' } }).audioSession).toBe(null)
  })
})
