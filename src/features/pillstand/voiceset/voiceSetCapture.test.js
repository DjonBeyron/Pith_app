import { describe, it, expect, vi, afterEach } from 'vitest'
import { primeCapture } from './voiceSetCapture.js'
import { closeKeptCapture, keptCapture } from '../../../shared/lib/vosk/voskCapture.js'
import { createVoiceSetRun } from './voiceSetRun.js'
import { createMemoryStore } from './voiceSetStore.js'

// Контекст захвата «заранее» — в нажатии (на iPhone созданный позже остаётся 'suspended'); диагностика захвата для журнала сбоев микрофона.
function FakeCtx() {
  this.state = 'suspended'; this.sampleRate = 48000
  this.resume = vi.fn(() => { this.state = 'running'; return Promise.resolve() })
  this.close = vi.fn(() => { this.state = 'closed'; return Promise.resolve() })
  this.addEventListener = () => {}
}

describe('захват «заранее» и диагностика', () => {
  afterEach(() => { closeKeptCapture('тест', () => {}) })

  it('primeCapture: контекст создан и продолжен прямо в вызове, остаётся один на игру без пользователей', () => {
    expect(primeCapture({ Ctx: FakeCtx })).toBe('running')
    expect(keptCapture()).toEqual({ state: 'running', users: 0 })
    expect(primeCapture({ Ctx: FakeCtx })).toBe('running') // второй вызов берёт тот же
    expect(keptCapture().users).toBe(0)
  })
  it('primeCapture: нет AudioContext — не падает', () => {
    expect(primeCapture({ Ctx: null })).toBe(null)
  })
  it('diag: состояние контекста и сколько мс нет кусков звука', () => {
    let t = 0
    const cap = { rate: 48000, gain: 1, state: () => 'interrupted', lastAt: () => 100, stop() {}, resume() {} }
    const run = createVoiceSetRun({ store: createMemoryStore(), plan: [], meta: {}, now: () => t, getStream: () => ({}), capture: () => cap, describe: () => ({}) })
    expect(run.diag()).toEqual({ ctx: null, since: null })
    run.open(); t = 1750
    expect(run.diag()).toEqual({ ctx: 'interrupted', since: 1650 })
  })
})
