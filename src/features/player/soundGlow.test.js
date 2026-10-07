import { describe, it, expect, beforeEach, vi } from 'vitest'

// sounds.js — пустышка: нам нужна только подписка onSoundPlayed
const listeners = new Set()
vi.mock('../../shared/lib/sounds.js', () => ({
  onSoundPlayed: cb => { listeners.add(cb); return () => listeners.delete(cb) },
}))
const { startUiSoundGlow, soundImpulse, SOUND_GLOW_AMP, DEFAULT_SOUND_SEC } = await import('./soundGlow.js')
const { subscribeAudioLevel, hasPlayingSources, _audioLevelTestHooks } = await import('./audioLevel.js')

let queue = []
const hooks = _audioLevelTestHooks({ raf: cb => { queue.push(cb); return 1 }, caf: () => { queue = [] }, hidden: () => false })
const frame = now => { const cbs = queue; queue = []; cbs.forEach(cb => cb(now)) }
const fire = (name, dur) => listeners.forEach(cb => cb(name, dur))

beforeEach(() => { hooks.reset(); queue = []; listeners.clear(); vi.useFakeTimers() })

describe('soundImpulse: огибающая импульса', () => {
  it('быстрый вход, тело ≤ amp, спад к нулю к концу, после — 0', () => {
    expect(soundImpulse(0, 0.6, 0.7)).toBe(0)
    expect(soundImpulse(0.04, 0.6, 0.7)).toBeGreaterThan(0.3)
    for (let t = 0.05; t < 0.6; t += 0.01) expect(soundImpulse(t, 0.6, 0.7)).toBeLessThanOrEqual(0.7)
    expect(soundImpulse(0.59, 0.6, 0.7)).toBeLessThan(0.1)
    expect(soundImpulse(0.6, 0.6, 0.7)).toBe(0)
    expect(soundImpulse(-1, 0.6, 0.7)).toBe(0)
    expect(soundImpulse(0.1, 0, 0.7)).toBe(0)
  })

  it('амплитуды заданы для всех звуков интерфейса', () => {
    for (const n of ['message-in', 'answer-correct', 'answer-wrong', 'pin-message', 'typing-1', 'typing-2', 'xp-gain', 'level-up', 'lesson-locked']) {
      expect(SOUND_GLOW_AMP[n]).toBeGreaterThan(0)
      expect(SOUND_GLOW_AMP[n]).toBeLessThanOrEqual(1)
    }
    expect(SOUND_GLOW_AMP['answer-correct']).toBeGreaterThan(SOUND_GLOW_AMP['message-in'])
  })
})

describe('startUiSoundGlow: звук интерфейса → источник уровня', () => {
  it('старт звука публикует импульс на длительность файла и снимает его после', () => {
    let clock = 1000
    const stop = startUiSoundGlow(() => clock)
    const got = []
    subscribeAudioLevel((l, a) => got.push([l, a]))
    fire('answer-correct', 0.5)
    expect(hasPlayingSources()).toBe(true)
    clock = 1060; frame(1060)
    expect(got.at(-1)[1]).toBe(true)
    expect(got.at(-1)[0]).toBeGreaterThan(0.1)
    vi.advanceTimersByTime(600)
    expect(hasPlayingSources()).toBe(false)
    expect(got.at(-1)).toEqual([0, false])
    stop()
  })

  it('без метаданных (0 с) — импульс на длительность по умолчанию; повтор того же звука переставляет таймер', () => {
    const stop = startUiSoundGlow(() => 0)
    subscribeAudioLevel(() => {})
    fire('message-in', 0)
    vi.advanceTimersByTime(DEFAULT_SOUND_SEC * 1000 - 50)
    expect(hasPlayingSources()).toBe(true)
    fire('message-in', 0)
    vi.advanceTimersByTime(DEFAULT_SOUND_SEC * 1000 - 50)
    expect(hasPlayingSources()).toBe(true)  // второй старт продлил источник
    vi.advanceTimersByTime(200)
    expect(hasPlayingSources()).toBe(false)
    stop()
  })

  it('снятие подписки гасит висящие импульсы и отписывается от sounds.js', () => {
    const stop = startUiSoundGlow(() => 0)
    subscribeAudioLevel(() => {})
    fire('level-up', 2)
    expect(hasPlayingSources()).toBe(true)
    stop()
    expect(hasPlayingSources()).toBe(false)
    expect(listeners.size).toBe(0)
    fire('level-up', 2)
    expect(hasPlayingSources()).toBe(false)
  })
})
