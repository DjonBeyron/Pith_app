import { describe, it, expect, beforeEach, vi } from 'vitest'

// sounds.js — пустышка: нам нужна только подписка onSoundPlayed
const listeners = new Set()
vi.mock('../../shared/lib/sounds.js', () => ({
  onSoundPlayed: cb => { listeners.add(cb); return () => listeners.delete(cb) },
}))
const { startUiSoundGlow, soundImpulse, SOUND_GLOW_AMP, SOUND_GLOW_PROFILE, SOUND_GLOW_IGNORED, DEFAULT_SOUND_SEC, MAX_SOUND_SEC } = await import('./soundGlow.js')
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

  it('амплитуды и полосы заданы для звуков интерфейса, кроме исключённых', () => {
    for (const n of ['answer-correct', 'answer-wrong', 'pin-message', 'xp-gain', 'level-up', 'lesson-locked']) {
      expect(SOUND_GLOW_AMP[n]).toBeGreaterThan(0)
      expect(SOUND_GLOW_AMP[n]).toBeLessThanOrEqual(1)
      expect(typeof SOUND_GLOW_PROFILE[n]).toBe('string')
    }
    expect(SOUND_GLOW_AMP['level-up']).toBeGreaterThan(SOUND_GLOW_AMP['pin-message'])
    expect(SOUND_GLOW_PROFILE['answer-wrong']).toBe('ui-low')
    expect(SOUND_GLOW_PROFILE['xp-gain']).toBe('ui-high')
    expect(SOUND_GLOW_PROFILE['level-up']).toBe('ui-all')
  })

  it('приход сообщения и «печатает» исключены: нет ни амплитуды, ни профиля', () => {
    expect([...SOUND_GLOW_IGNORED].sort()).toEqual(['message-in', 'typing-1', 'typing-2'])
    for (const n of SOUND_GLOW_IGNORED) { expect(SOUND_GLOW_AMP[n]).toBeUndefined(); expect(SOUND_GLOW_PROFILE[n]).toBeUndefined() }
  })
})

describe('startUiSoundGlow: звук интерфейса → источник уровня', () => {
  it('старт звука публикует импульс на длительность файла и снимает его после', () => {
    let clock = 1000
    const stop = startUiSoundGlow(() => clock)
    const got = []
    subscribeAudioLevel((l, a) => got.push([l, a]))
    fire('answer-correct', 0.4)
    expect(hasPlayingSources()).toBe(true)
    clock = 1060; frame(1060)
    expect(got.at(-1)[1]).toBe(true)
    expect(got.at(-1)[0]).toBeGreaterThan(0.1)
    vi.advanceTimersByTime(500)
    expect(hasPlayingSources()).toBe(false)
    expect(got.at(-1)).toEqual([0, false])
    stop()
  })

  it('message-in, typing-1 и typing-2 не публикуют импульс вообще', () => {
    const stop = startUiSoundGlow(() => 0)
    subscribeAudioLevel(() => {})
    for (const n of ['message-in', 'typing-1', 'typing-2']) {
      fire(n, 0.3)
      expect(hasPlayingSources()).toBe(false)
      expect(queue.length).toBe(0)   // цикл свечения даже не запускался
    }
    fire('xp-gain', 0.3)             // остальные звуки — как раньше
    expect(hasPlayingSources()).toBe(true)
    stop()
  })

  it('без метаданных (0 с) — импульс на длительность по умолчанию; повтор того же звука переставляет таймер', () => {
    const stop = startUiSoundGlow(() => 0)
    subscribeAudioLevel(() => {})
    fire('xp-gain', 0)
    vi.advanceTimersByTime(DEFAULT_SOUND_SEC * 1000 - 50)
    expect(hasPlayingSources()).toBe(true)
    fire('xp-gain', 0)
    vi.advanceTimersByTime(DEFAULT_SOUND_SEC * 1000 - 50)
    expect(hasPlayingSources()).toBe(true)  // второй старт продлил источник
    vi.advanceTimersByTime(200)
    expect(hasPlayingSources()).toBe(false)
    stop()
  })

  it('импульс не дольше 0.45 с даже у длинного файла (level-up 2 с)', () => {
    expect(MAX_SOUND_SEC).toBeLessThanOrEqual(0.45)
    const stop = startUiSoundGlow(() => 0)
    subscribeAudioLevel(() => {})
    fire('level-up', 2.0)
    vi.advanceTimersByTime(MAX_SOUND_SEC * 1000 + 50)
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
