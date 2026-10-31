import { describe, it, expect } from 'vitest'
import { synthNote, noteBuffer, dropNoteBuffers, COUNT_RMS, COUNT_PEAK } from './rehearsalCountdownSynth.js'
import { countdownPlan, COUNT_NOTE_MS } from './rehearsalCountdown.js'
import { TARGET_RMS } from '../player/modules/rotate-phone/wordLaneNotes.js'

const rms = a => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length)
const peak = a => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0)

// Ноты отсчёта синтезируются сразу в AudioBuffer: слышно на динамике iPhone (громче нот награды) и готово к первой ноте
describe('синтез нот отсчёта', () => {
  const plan = countdownPlan()
  it('длина — длина ноты плана; мягкий вход и затухание до нуля; пик не выше COUNT_PEAK', () => {
    for (const n of plan) {
      const a = synthNote(n, 22050)
      expect(a).toHaveLength(Math.floor((22050 * COUNT_NOTE_MS) / 1000))
      expect(Math.abs(a[0])).toBeLessThan(0.01); expect(Math.abs(a.at(-1))).toBeLessThan(0.02)
      expect(peak(a)).toBeLessThanOrEqual(COUNT_PEAK + 1e-6); expect(peak(a)).toBeGreaterThan(0.3)
    }
  })
  it('громкость: RMS нот около COUNT_RMS (последняя громче по level), в разы громче нот награды (TARGET_RMS 2600/32768 при громкости 0,5)', () => {
    const [a, b, c] = plan.map(n => synthNote(n, 44100))
    expect(rms(a)).toBeCloseTo(COUNT_RMS, 2); expect(rms(b)).toBeCloseTo(COUNT_RMS, 2)
    expect(rms(c)).toBeGreaterThan(rms(a)); expect(rms(c)).toBeLessThanOrEqual(COUNT_PEAK)
    const reward = (TARGET_RMS / 32768) * 0.5
    expect(rms(a) / reward).toBeGreaterThan(4)
  })
  it('частота основного тона — по плану (до — ми — соль): нулей у до больше, чем у ничего, и растёт вверх по ступеням', () => {
    const zeros = x => x.reduce((k, v, i) => k + (i && Math.sign(v) !== Math.sign(x[i - 1]) ? 1 : 0), 0)
    const [a, b, c] = plan.map(n => zeros(synthNote(n, 44100)))
    expect(b).toBeGreaterThan(a); expect(c).toBeGreaterThan(b)
  })
  it('noteBuffer: AudioBuffer на частоте контекста, один раз на ноту и частоту; ошибка контекста — null', () => {
    dropNoteBuffers()
    let made = 0
    const ctx = { sampleRate: 8000, createBuffer: (ch, len, rate) => { made += 1; const d = new Float32Array(len); return { length: len, sampleRate: rate, getChannelData: () => d } } }
    const b0 = noteBuffer(ctx, plan[0])
    expect(b0.sampleRate).toBe(8000); expect(b0.length).toBe(Math.floor((8000 * COUNT_NOTE_MS) / 1000)); expect(peak(b0.getChannelData(0))).toBeGreaterThan(0.3)
    expect(noteBuffer(ctx, plan[0])).toBe(b0); expect(made).toBe(1)
    expect(noteBuffer({ sampleRate: 8000, createBuffer() { throw new Error('нет') } }, plan[1])).toBeNull()
    expect(noteBuffer(null, plan[1])).toBeNull()
    dropNoteBuffers()
  })
})
