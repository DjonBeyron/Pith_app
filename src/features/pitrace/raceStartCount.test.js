import { describe, it, expect } from 'vitest'
import { countdownPlan, countdownMs, stageTiming, SOFT_STEP_MS, SOFT_NOTE_MS, COUNT_STEP_MS, COUNT_NOTE_MS } from '../rehearsal/rehearsalCountdown.js'
import { synthNote, noteBuffer, dropNoteBuffers, COUNT_RMS, SOFT_ATTACK_S, SOFT_GAIN } from '../rehearsal/rehearsalCountdownSynth.js'
import { plateCueMs } from '../rehearsal/rehearsalConveyorCue.js'
import { buildRaceStages } from './raceStages.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

// Старт гонки: после race_start и объявления первого этапа (бар заставки заполнен) — три нежные ноты (шаг 600 мс, нота 1,1 с, −6 дБ), первая пилюля выезжает после них.
const rms = a => Math.sqrt([...a].reduce((s, v) => s + v * v, 0) / a.length)
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })

describe('нежный отсчёт: расписание', () => {
  it('soft: шаг 600 мс, нота 1,1 с, ноты помечены soft; обычный отсчёт не изменился (500 / 750)', () => {
    const p = countdownPlan({ soft: true })
    expect(p.map(n => n.at)).toEqual([0, 600, 1200]); expect(p.every(n => n.ms === 1100 && n.soft)).toBe(true)
    expect([SOFT_STEP_MS, SOFT_NOTE_MS]).toEqual([600, 1100])
    const n = countdownPlan()
    expect(n.map(x => x.at)).toEqual([0, 500, 1000]); expect(n.every(x => x.ms === 750 && !x.soft)).toBe(true); expect([COUNT_STEP_MS, COUNT_NOTE_MS]).toEqual([500, 750])
    expect(countdownMs(p)).toBe(1200 + 1100 + 200); expect(countdownMs(p)).toBeGreaterThan(countdownMs(n))
  })
  it('стадия «после»: Пит договорил реплику → ноты → стадия держится до конца третьей ноты (первая пилюля — после)', () => {
    const t = stageTiming({ order: 'after', lineMs: 2000, plan: countdownPlan({ soft: true }) })
    expect(t.countAt).toBeGreaterThan(t.lineAt + 2000)
    expect(t.holdMs).toBeGreaterThanOrEqual(t.countAt + 1200 + 1100) // третья нота звучит 1,1 с
    expect(plateCueMs({ order: 'after', timing: t, soft: true }) - t.countAt).toBe(1200 + 1100)
    expect(plateCueMs({ order: 'after', timing: t }) - t.countAt).toBe(1000 + 750) // без soft — обычный сигнал
  })
  it('в стадиях гонки отсчёт есть у ПЕРВОЙ плашки (count: after, soft) и ни у одной другой; один раунд — то же', () => {
    for (const round of [undefined, 'stages', 'sprint', 'catch', 'climb', 'descent']) {
      const { stages } = buildRaceStages({ plan: { ...plan, round } })
      expect(stages[0].type).toBe('announce'); expect(stages[0].count).toBe('after'); expect(stages[0].soft).toBe(true)
      expect(stages.slice(1).filter(s => s.count || s.soft)).toHaveLength(0)
    }
  })
})

describe('нежный отсчёт: синтез', () => {
  const soft = countdownPlan({ soft: true })[0], hard = countdownPlan()[0]
  it('чистый синус, мягкая атака 40 мс, громкость на 6 дБ тише обычной, пик не растёт', () => {
    const a = synthNote(soft, 44100), b = synthNote(hard, 44100)
    expect(a.length).toBe(Math.floor(44100 * 1.1)); expect(SOFT_ATTACK_S).toBe(0.04)
    expect(rms(a) / rms(b)).toBeCloseTo(SOFT_GAIN, 2); expect(20 * Math.log10(rms(a) / rms(b))).toBeCloseTo(-6, 0)
    expect(rms(a)).toBeCloseTo(COUNT_RMS * SOFT_GAIN * (soft.level ?? 1), 3)
    const att = Math.floor(44100 * 0.04)
    expect(Math.max(...[...a.slice(0, Math.floor(att / 4))].map(Math.abs))).toBeLessThan(Math.max(...[...a.slice(att, att + 400)].map(Math.abs)) * 0.35) // к 10 мс звук ещё вдвое-втрое тише пика атаки
    expect(Math.max(...[...a].map(Math.abs))).toBeLessThanOrEqual(0.9)
  })
  it('чистый синус: на частоте 2-й гармоники энергии почти нет (у обычной ноты есть)', () => {
    const energy = (arr, f) => { let re = 0, im = 0; arr.forEach((v, i) => { const ph = (2 * Math.PI * f * i) / 44100; re += v * Math.cos(ph); im += v * Math.sin(ph) }); return Math.hypot(re, im) / arr.length }
    const a = synthNote(soft, 44100), b = synthNote(hard, 44100)
    expect(energy(a, soft.freq * 2) / energy(a, soft.freq)).toBeLessThan(0.05); expect(energy(b, hard.freq * 2) / energy(b, hard.freq)).toBeGreaterThan(0.2)
  })
  it('буферы нежных и обычных нот кэшируются раздельно', () => {
    dropNoteBuffers()
    const ctx = { sampleRate: 44100, createBuffer: (c, len) => { const d = new Float32Array(len); return { len, copyToChannel: x => d.set(x), getChannelData: () => d } } }
    const s1 = noteBuffer(ctx, soft), h1 = noteBuffer(ctx, hard)
    expect(s1).not.toBe(h1); expect(s1.len).toBeGreaterThan(h1.len); expect(noteBuffer(ctx, soft)).toBe(s1); expect(noteBuffer(ctx, hard)).toBe(h1)
    dropNoteBuffers()
  })
})
