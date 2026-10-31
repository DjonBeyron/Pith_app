import { describe, it, expect } from 'vitest'
import { COUNT_FREQS, COUNT_STEP_MS, COUNT_NOTE_MS, COUNT_TAIL_MS, countdownPlan, countdownMs, stageTiming } from './rehearsalCountdown.js'
import { makeNoteWav, wavRms } from '../player/modules/rotate-phone/wordLaneNotes.js'

// Отсчёт тремя нотами перед разминкой и дублем (решение владельца 2026-10-31): план нот и раскладка стадии по времени
describe('план отсчёта', () => {
  it('три коротких ноты до — ми — соль с паузой 0,5 с; последняя чуть громче', () => {
    const p = countdownPlan()
    expect(p).toHaveLength(3)
    expect(p.map(n => n.freq)).toEqual([523.25, 659.25, 783.99]); expect(p.map(n => n.freq)).toEqual(COUNT_FREQS)
    expect(p.map(n => n.at)).toEqual([0, COUNT_STEP_MS, 2 * COUNT_STEP_MS]); expect(COUNT_STEP_MS).toBe(500)
    expect(p.every(n => n.ms === COUNT_NOTE_MS && n.ms < COUNT_STEP_MS)).toBe(true) // отрывистые: звук кончается до следующей ноты
    expect(p.map(n => n.k)).toEqual([0, 1, 2]); expect(p[2].level).toBeGreaterThan(p[0].level)
  })
  it('длительность: от первой ноты до конца последней и хвоста; шаг и длину ноты можно задать', () => {
    expect(countdownMs()).toBe(2 * COUNT_STEP_MS + COUNT_NOTE_MS + COUNT_TAIL_MS)
    expect(countdownMs(countdownPlan({ step: 400, ms: 100 }), 0)).toBe(900)
    expect(countdownMs([])).toBe(0)
  })
  it('ноты — обычные WAV «лесенки» игры (makeNoteWav): короткие, 16 бит, равны по энергии', () => {
    const wavs = countdownPlan().map(n => makeNoteWav(n.freq, n.ms, n.level))
    for (const w of wavs) { expect(String.fromCharCode(...w.slice(0, 4))).toBe('RIFF'); expect(w.length).toBe(44 + Math.floor((22050 * COUNT_NOTE_MS) / 1000) * 2) }
    expect(wavRms(wavs[2]) / wavRms(wavs[0])).toBeCloseTo(1.2, 1)
  })
})

describe('раскладка стадии со счётом', () => {
  const o = { lead: 250, pause: 600, lineMs: 2000, minMs: 1700 }
  const C = countdownMs()
  it('after (разминка): реплика Пита, потом три ноты, потом первое слово', () => {
    const t = stageTiming({ ...o, order: 'after' })
    expect(t.lineAt).toBe(270); expect(t.countAt).toBe(270 + 2000 + 600); expect(t.holdMs).toBe(t.countAt + C)
  })
  it('before (дубль): три ноты, потом «поехали», потом запись', () => {
    const t = stageTiming({ ...o, order: 'before', lineMs: 450 })
    expect(t.countAt).toBe(250); expect(t.lineAt).toBe(250 + C); expect(t.holdMs).toBe(250 + C + 450 + 600)
  })
  it('Пит ещё договаривает прошлую реплику — всё сдвигается на busyMs; плашка не короче minMs', () => {
    for (const order of ['after', 'before']) expect(stageTiming({ ...o, order, busyMs: 1500 }).holdMs - stageTiming({ ...o, order }).holdMs).toBe(1500)
    expect(stageTiming({ order: 'before', hasLine: false, minMs: 9000 }).holdMs).toBe(9000)
  })
  it('без счёта — как раньше: реплика через lead + 20 мс, плашка держится до конца реплики и паузы; без реплики — minMs', () => {
    expect(stageTiming({ ...o })).toEqual({ countAt: null, lineAt: 270, holdMs: 250 + 2000 + 600 })
    expect(stageTiming({ ...o, hasLine: false })).toEqual({ countAt: null, lineAt: null, holdMs: 1700 })
  })
  it('счёт без реплики: ноты сразу после lead, реплики нет', () => {
    for (const order of ['after', 'before']) expect(stageTiming({ order, hasLine: false, lead: 250 })).toMatchObject({ countAt: 250, lineAt: null, holdMs: 250 + C })
  })
})
