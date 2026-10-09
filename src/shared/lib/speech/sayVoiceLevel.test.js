import { describe, it, expect } from 'vitest'
import { createVoiceLevel, squash, RING_GAIN, IDLE_LEVEL, SPEECH_LEVEL, DECAY_MS, FADE_MS, ATTACK_MS, jitter } from './sayVoiceLevel.js'

// Ручные тики: время передаётся явно, таймеров и rAF здесь нет
const T = 1000

describe('squash — чувствительность колец ×2 к прежним и сжатие динамики level^0.5', () => {
  it('усиление 4 (вдвое выше прежних ×2), корень, потолок 1, ноль и мусор → 0', () => {
    expect(RING_GAIN).toBe(4)
    expect(squash(0)).toBe(0)
    expect(squash(-1)).toBe(0)
    expect(squash(0.0625)).toBeCloseTo(0.5, 10)      // 0,0625×4 = 0,25 → √ = 0,5
    expect(squash(0.25)).toBe(1)                     // 0,25×4 = 1
    expect(squash(10)).toBe(1)
    let prev = 0
    for (let x = 0; x <= 0.5; x += 0.01) { const y = squash(x); expect(y).toBeGreaterThanOrEqual(prev); expect(y).toBeLessThanOrEqual(1); prev = y }
  })

  it('шёпот заметен: даже ровная «речь» без всплесков поднимает уровень выше 0,75 (корень сжимает динамику)', () => {
    expect(squash(SPEECH_LEVEL - IDLE_LEVEL)).toBeGreaterThan(0.75)
    expect(squash(0.02)).toBeGreaterThan(0.25) // совсем тихий всплеск тоже виден
  })
})

describe('синтетический уровень колец по событиям распознавания', () => {
  it('до audiostart уровень 0; audiostart → тишина (idle) = 0: «дыхание» колец добавляет sayRings.js, а не голос', () => {
    const v = createVoiceLevel()
    expect(v.ringLevel(T)).toBe(0)
    v.signal('audiostart', T)
    expect(v.ringLevel(T + 50)).toBe(0)
    expect(v.state()).toBe('idle')
  })

  it('soundstart — САМОЕ РАННЕЕ событие голоса: уровень ≥ 0,5 СРАЗУ (в тот же кадр), раньше speechstart/interim', () => {
    expect(ATTACK_MS).toBeGreaterThanOrEqual(40)
    expect(ATTACK_MS).toBeLessThanOrEqual(60)
    const v = createVoiceLevel()
    v.signal('audiostart', T)
    expect(v.ringLevel(T + 99)).toBe(0)
    v.signal('soundstart', T + 100) // speechstart/interim придут через 0,5–1,5 с — их здесь нет вовсе
    expect(v.ringLevel(T + 100)).toBeGreaterThanOrEqual(0.5)
    expect(v.ringLevel(T + 100 + ATTACK_MS)).toBeGreaterThanOrEqual(0.7)
    expect(v.state()).toBe('speaking')
  })

  it('soundstart до audiostart (state off) игнорируется; speechstart поднимает так же, как soundstart', () => {
    const v = createVoiceLevel()
    v.signal('soundstart', T)
    expect(v.ringLevel(T + 10)).toBe(0)
    const a = createVoiceLevel(); a.signal('audiostart', T); a.signal('soundstart', T + 50)
    const b = createVoiceLevel(); b.signal('audiostart', T); b.signal('speechstart', T + 50)
    expect(a.ringLevel(T + 200)).toBe(b.ringLevel(T + 200))
  })

  it('soundend — спад к тишине за ~DECAY_MS, а не обрыв; тишина = 0', () => {
    const v = createVoiceLevel()
    v.signal('audiostart', T); v.signal('soundstart', T + 50)
    const speech = v.ringLevel(T + 800)
    v.signal('soundend', T + 800)
    const soon = v.ringLevel(T + 800 + 30)
    const later = v.ringLevel(T + 800 + DECAY_MS * 8)
    expect(soon).toBeGreaterThan(later)
    expect(soon).toBeGreaterThan(speech * 0.5) // не провалился сразу
    expect(later).toBeLessThan(0.15)
    expect(v.state()).toBe('idle')
  })

  it('interim/final дают заметный всплеск (любой interim оживляет кольца), который затухает за ~DECAY_MS', () => {
    const v = createVoiceLevel()
    v.signal('audiostart', T)
    v.signal('interim', T + 1000) // голос без soundstart: interim сам включает «речь»
    expect(v.state()).toBe('speaking')
    expect(v.ringLevel(T + 1000 + ATTACK_MS)).toBeGreaterThan(0.7)
    const w = createVoiceLevel(); w.signal('audiostart', T); w.signal('soundstart', T); w.signal('soundend', T + 300)
    const quiet = w.ringLevel(T + 300 + DECAY_MS * 8)
    w.signal('final', T + 2000)
    expect(w.ringLevel(T + 2000 + ATTACK_MS)).toBeGreaterThan(quiet + 0.5)
  })

  it('speechend/end — плавное затухание к нулю за FADE_MS, затем isLive=false', () => {
    const v = createVoiceLevel()
    v.signal('audiostart', T)
    v.signal('speechstart', T + 50)
    v.signal('speechend', T + 1000)
    const a = v.ringLevel(T + 1000 + FADE_MS * 0.3)
    const b = v.ringLevel(T + 1000 + FADE_MS * 0.7)
    expect(a).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(0)
    expect(v.ringLevel(T + 1000 + FADE_MS + 1)).toBe(0)
    expect(v.isLive(T + 1000 + FADE_MS * 0.5)).toBe(true)
    expect(v.isLive(T + 1000 + FADE_MS + 1)).toBe(false)
  })

  it('результат без speechstart (iOS) тоже считается голосом; stop — сразу ноль; новый audiostart оживляет после затухания', () => {
    const v = createVoiceLevel()
    v.signal('audiostart', T)
    v.signal('final', T + 500)
    expect(v.state()).toBe('speaking')
    v.signal('end', T + 600)
    expect(v.ringLevel(T + 600 + FADE_MS + 5)).toBe(0)
    v.signal('audiostart', T + 2000)
    expect(v.state()).toBe('idle')
    v.signal('soundstart', T + 2100)
    expect(v.ringLevel(T + 2110)).toBeGreaterThan(0)
    v.signal('stop', T + 2200)
    expect(v.ringLevel(T + 2200)).toBe(0)
  })

  it('события до audiostart игнорируются; уровень всегда в 0..1 даже при частых всплесках; дрожание детерминировано', () => {
    const v = createVoiceLevel()
    v.signal('interim', T)
    expect(v.ringLevel(T + 10)).toBe(0)
    v.signal('audiostart', T)
    v.signal('soundstart', T)
    let max = 0
    for (let i = 0; i < 60; i++) {
      v.signal('interim', T + i * 25)
      const l = v.ringLevel(T + i * 25 + 5)
      expect(l).toBeGreaterThanOrEqual(0)
      expect(l).toBeLessThanOrEqual(1)
      max = Math.max(max, l)
    }
    expect(max).toBeGreaterThan(0.95) // громкая речь доходит до потолка
    expect(jitter(1234)).toBe(jitter(1234))
    for (let t = 0; t < 5000; t += 37) { const j = jitter(t); expect(j).toBeGreaterThan(0.84); expect(j).toBeLessThan(1.16) }
    const w = createVoiceLevel(); w.signal('audiostart', T); w.signal('speechstart', T)
    expect(w.ringLevel(T + 700)).toBe(sameAt(T + 700))
  })
})

function sameAt(t) {
  const v = createVoiceLevel(); v.signal('audiostart', T); v.signal('speechstart', T); return v.ringLevel(t)
}
