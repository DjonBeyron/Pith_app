import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ played: null, subs: new Set() }))
vi.mock('./sounds.js', () => ({
  playSound: vi.fn(),
  onSoundPlayed: cb => { h.subs.add(cb); return () => h.subs.delete(cb) },
}))
import { playSound } from './sounds.js'
import { playCorrectWithVoice, VOICE_START_AT } from './correctVoiceScheduler.js'

const started = (name, dur) => [...h.subs].forEach(cb => cb(name, dur))

describe('верный ответ: звук интерфейса, потом озвучка', () => {
  beforeEach(() => { vi.useFakeTimers(); h.subs.clear(); playSound.mockClear() })
  afterEach(() => vi.useRealTimers())

  it('звук играет сразу, озвучка стартует на 65% его длительности, а не раньше', () => {
    const voice = vi.fn()
    playCorrectWithVoice('тест', voice)
    expect(playSound).toHaveBeenCalledWith('answer-correct', 'тест')
    expect(voice).not.toHaveBeenCalled()
    started('answer-correct', 1)
    vi.advanceTimersByTime(1000 * VOICE_START_AT - 1)
    expect(voice).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(voice).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(voice).toHaveBeenCalledTimes(1)
    expect(h.subs.size).toBe(0)
  })

  it('длительность неизвестна — короткая запасная пауза; чужой звук игнорируется', () => {
    const voice = vi.fn()
    playCorrectWithVoice('тест', voice)
    started('message-in', 2)
    started('answer-correct', 0)
    vi.advanceTimersByTime(400)
    expect(voice).toHaveBeenCalledTimes(1)
  })

  it('звук не пошёл (тишина, выключен) — озвучка всё равно стартует, не зависает', () => {
    const voice = vi.fn()
    playCorrectWithVoice('тест', voice)
    vi.advanceTimersByTime(700)
    expect(voice).toHaveBeenCalledTimes(1)
  })

  it('cancel снимает озвучку; без startVoice — только звук', () => {
    const voice = vi.fn()
    const cancel = playCorrectWithVoice('тест', voice)
    cancel()
    vi.advanceTimersByTime(2000)
    expect(voice).not.toHaveBeenCalled()
    expect(h.subs.size).toBe(0)
    playCorrectWithVoice('тест', null)
    expect(playSound).toHaveBeenCalledTimes(2)
    expect(h.subs.size).toBe(0)
  })
})
