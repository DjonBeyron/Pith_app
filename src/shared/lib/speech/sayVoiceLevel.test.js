import { describe, it, expect } from 'vitest'
import { createVoiceLevel, IDLE_LEVEL, SPEECH_LEVEL, DECAY_MS, FADE_MS, RISE_MS, jitter } from './sayVoiceLevel.js'

// Ручные тики: время передаётся явно, таймеров и rAF здесь нет
const T = 1000

describe('синтетический уровень голоса по событиям распознавания', () => {
  it('до audiostart уровень 0; audiostart → тихий idle (слушаем, голоса нет)', () => {
    const v = createVoiceLevel()
    expect(v.level(T)).toBe(0)
    v.signal('audiostart', T)
    const l = v.level(T + 50)
    expect(l).toBeGreaterThan(IDLE_LEVEL * 0.8)
    expect(l).toBeLessThan(IDLE_LEVEL * 1.2)
    expect(v.state()).toBe('idle')
  })

  it('speechstart поднимает уровень до «речи», выше idle', () => {
    const v = createVoiceLevel()
    v.signal('audiostart', T)
    const idle = v.level(T + 10)
    v.signal('speechstart', T + 100)
    const spoken = v.level(T + 100 + RISE_MS + 20)
    expect(spoken).toBeGreaterThan(idle + 0.15)
    expect(spoken).toBeGreaterThan(SPEECH_LEVEL * 0.8)
  })

  it('interim/final дают всплеск, который затухает за ~DECAY_MS', () => {
    const v = createVoiceLevel()
    v.signal('audiostart', T)
    v.signal('speechstart', T + 100)
    const calm = v.level(T + 1000)
    v.signal('interim', T + 1000)
    const burst = v.level(T + 1000)
    const later = v.level(T + 1000 + DECAY_MS * 4)
    expect(burst).toBeGreaterThan(calm + 0.2)
    expect(later).toBeLessThan(burst - 0.2)
    expect(later).toBeLessThan(calm * 1.2)
    v.signal('final', T + 2000)
    expect(v.level(T + 2000)).toBeGreaterThan(calm + 0.2)
  })

  it('speechend/end — плавное затухание к нулю за FADE_MS, затем isLive=false', () => {
    const v = createVoiceLevel()
    v.signal('audiostart', T)
    v.signal('speechstart', T + 50)
    v.signal('speechend', T + 1000)
    const a = v.level(T + 1000 + FADE_MS * 0.3)
    const b = v.level(T + 1000 + FADE_MS * 0.7)
    expect(a).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(0)
    expect(v.level(T + 1000 + FADE_MS + 1)).toBe(0)
    expect(v.isLive(T + 1000 + FADE_MS * 0.5)).toBe(true)
    expect(v.isLive(T + 1000 + FADE_MS + 1)).toBe(false)
  })

  it('результат без speechstart (iOS) тоже считается голосом; stop — сразу ноль; новый audiostart оживляет после затухания', () => {
    const v = createVoiceLevel()
    v.signal('audiostart', T)
    v.signal('final', T + 500)
    expect(v.state()).toBe('speaking')
    v.signal('end', T + 600)
    expect(v.level(T + 600 + FADE_MS + 5)).toBe(0)
    v.signal('audiostart', T + 2000)
    expect(v.level(T + 2010)).toBeGreaterThan(0)
    v.signal('stop', T + 2100)
    expect(v.level(T + 2100)).toBe(0)
  })

  it('события до audiostart (state off) игнорируются; уровень всегда в 0..1; дрожание детерминировано', () => {
    const v = createVoiceLevel()
    v.signal('interim', T)
    expect(v.level(T + 10)).toBe(0)
    v.signal('audiostart', T)
    v.signal('speechstart', T)
    for (let i = 0; i < 20; i++) { v.signal('interim', T + i * 40); const l = v.level(T + i * 40 + 5); expect(l).toBeGreaterThanOrEqual(0); expect(l).toBeLessThanOrEqual(1) }
    expect(jitter(1234)).toBe(jitter(1234))
    for (let t = 0; t < 5000; t += 37) { const j = jitter(t); expect(j).toBeGreaterThan(0.84); expect(j).toBeLessThan(1.16) }
    const w = createVoiceLevel(); w.signal('audiostart', T); w.signal('speechstart', T)
    expect(w.level(T + 700)).toBe(createVoiceLevelSame(T + 700))
  })
})

function createVoiceLevelSame(t) {
  const v = createVoiceLevel(); v.signal('audiostart', T); v.signal('speechstart', T); return v.level(t)
}
