import { describe, it, expect } from 'vitest'
import { createVoiceLevel, boost, GAIN, KNEE, IDLE_LEVEL, SPEECH_LEVEL, DECAY_MS, FADE_MS, ATTACK_MS, jitter } from './sayVoiceLevel.js'

// Ручные тики: время передаётся явно, таймеров и rAF здесь нет
const T = 1000

describe('boost — усиление ×2 с мягким ограничением до 1', () => {
  it('тихий уровень удваивается, громкий не превышает 1 и растёт монотонно', () => {
    expect(GAIN).toBe(2)
    expect(boost(0)).toBe(0)
    expect(boost(0.1)).toBeCloseTo(0.2, 10)
    expect(boost(0.3)).toBeCloseTo(0.6, 10)
    let prev = 0
    for (let x = 0; x <= 3; x += 0.05) {
      const y = boost(x)
      expect(y).toBeGreaterThanOrEqual(prev)
      expect(y).toBeLessThanOrEqual(1)
      prev = y
    }
    expect(boost(5)).toBeLessThanOrEqual(1)
    expect(boost(5)).toBeGreaterThan(0.99)
  })

  it('кривая гладкая на колене: без скачка и излома', () => {
    expect(boost(KNEE / GAIN)).toBeCloseTo(KNEE, 10)
    const a = boost(KNEE / GAIN - 0.001), b = boost(KNEE / GAIN + 0.001)
    expect(Math.abs(b - a)).toBeLessThan(0.005)
  })

  it('отрицательное и мусор → 0', () => {
    expect(boost(-1)).toBe(0)
  })
})

describe('синтетический уровень голоса по событиям распознавания', () => {
  it('до audiostart уровень 0; audiostart → тихий idle (слушаем, голоса нет), он выше прежних 0,16', () => {
    const v = createVoiceLevel()
    expect(v.level(T)).toBe(0)
    v.signal('audiostart', T)
    const l = v.level(T + 50)
    expect(l).toBeGreaterThan(boost(IDLE_LEVEL) * 0.8)
    expect(l).toBeLessThan(boost(IDLE_LEVEL) * 1.2)
    expect(boost(IDLE_LEVEL)).toBeGreaterThan(0.2) // «пол» поднят: был 0,16
    expect(v.state()).toBe('idle')
  })

  it('soundstart — САМОЕ РАННЕЕ событие голоса: уровень выходит на «речь» за ~ATTACK_MS (40–60 мс), раньше speechstart/interim', () => {
    expect(ATTACK_MS).toBeGreaterThanOrEqual(40)
    expect(ATTACK_MS).toBeLessThanOrEqual(60)
    const v = createVoiceLevel()
    v.signal('audiostart', T)
    const idle = v.level(T + 10)
    v.signal('soundstart', T + 100) // speechstart/interim придут через 0,5–1,5 с — их здесь нет вовсе
    const spoken = v.level(T + 100 + ATTACK_MS + 5)
    expect(spoken).toBeGreaterThan(idle + 0.3)
    expect(spoken).toBeGreaterThan(boost(SPEECH_LEVEL) * 0.8)
    expect(v.state()).toBe('speaking')
    // уже через ~половину атаки уровень заметно вырос
    const v2 = createVoiceLevel()
    v2.signal('audiostart', T); v2.signal('soundstart', T + 100)
    expect(v2.level(T + 100 + ATTACK_MS / 2)).toBeGreaterThan(boost(IDLE_LEVEL) * 1.3)
  })

  it('soundstart до audiostart (state off) игнорируется; speechstart поднимает так же, как soundstart', () => {
    const v = createVoiceLevel()
    v.signal('soundstart', T)
    expect(v.level(T + 10)).toBe(0)
    const a = createVoiceLevel(); a.signal('audiostart', T); a.signal('soundstart', T + 50)
    const b = createVoiceLevel(); b.signal('audiostart', T); b.signal('speechstart', T + 50)
    expect(a.level(T + 200)).toBe(b.level(T + 200))
  })

  it('soundend — спад к idle за ~DECAY_MS, а не обрыв', () => {
    const v = createVoiceLevel()
    v.signal('audiostart', T); v.signal('soundstart', T + 50)
    const speech = v.level(T + 800)
    v.signal('soundend', T + 800)
    const soon = v.level(T + 800 + 30)
    const later = v.level(T + 800 + DECAY_MS * 5)
    expect(soon).toBeGreaterThan(later)
    expect(soon).toBeGreaterThan(speech * 0.6) // не провалился сразу
    expect(later).toBeLessThan(boost(IDLE_LEVEL) * 1.25)
    expect(later).toBeGreaterThan(boost(IDLE_LEVEL) * 0.75) // и не ниже пола idle
    expect(v.state()).toBe('idle')
  })

  it('interim/final дают всплеск (нарастает за ATTACK_MS), который затухает за ~DECAY_MS', () => {
    const v = createVoiceLevel()
    v.signal('audiostart', T)
    v.signal('speechstart', T + 100)
    const calm = v.level(T + 1000)
    v.signal('interim', T + 1000)
    const burst = v.level(T + 1000 + ATTACK_MS)
    const later = v.level(T + 1000 + DECAY_MS * 5)
    expect(burst).toBeGreaterThan(calm + 0.05)
    expect(later).toBeLessThan(burst - 0.05)
    expect(later).toBeLessThan(calm * 1.2)
    v.signal('final', T + 2000)
    expect(v.level(T + 2000 + ATTACK_MS)).toBeGreaterThan(calm + 0.05)
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

  it('события до audiostart (state off) игнорируются; уровень всегда в 0..1 даже при частых всплесках; дрожание детерминировано', () => {
    const v = createVoiceLevel()
    v.signal('interim', T)
    expect(v.level(T + 10)).toBe(0)
    v.signal('audiostart', T)
    v.signal('soundstart', T)
    let max = 0
    for (let i = 0; i < 60; i++) {
      v.signal('interim', T + i * 25)
      const l = v.level(T + i * 25 + 5)
      expect(l).toBeGreaterThanOrEqual(0)
      expect(l).toBeLessThanOrEqual(1)
      max = Math.max(max, l)
    }
    expect(max).toBeGreaterThan(0.9) // с усилением ×2 громкая речь доходит почти до потолка
    expect(jitter(1234)).toBe(jitter(1234))
    for (let t = 0; t < 5000; t += 37) { const j = jitter(t); expect(j).toBeGreaterThan(0.84); expect(j).toBeLessThan(1.16) }
    const w = createVoiceLevel(); w.signal('audiostart', T); w.signal('speechstart', T)
    expect(w.level(T + 700)).toBe(sameAt(T + 700))
  })
})

function sameAt(t) {
  const v = createVoiceLevel(); v.signal('audiostart', T); v.signal('speechstart', T); return v.level(t)
}
