import { describe, it, expect, vi } from 'vitest'
import { createStartTrace, TRACE_WINDOW_MS } from './gameStartTrace.js'

// Хронология старта звука: время шагов от тапа, окно «начала игры» 15 с, прогрев закончен только после ready
describe('gameStartTrace', () => {
  it('до тапа: тапа нет, окна нет, прогрев «не нужен» (считается законченным)', () => {
    const t = createStartTrace({ now: () => 0, note: vi.fn() })
    expect(t.sinceTap()).toBeNull()
    expect(t.inWindow()).toBe(false)
    expect(t.warmed()).toBe(true)
    t.mark('mic') // без тапа — тихо ничего
    expect(t.since('mic')).toBeNull()
  })

  it('тап → шаги → ready: время от тапа и от шага; warmed только после ready; всё уходит в журнал как start-mark', () => {
    let now = 1000
    const note = vi.fn()
    const t = createStartTrace({ now: () => now, note })
    t.begin()
    expect(t.warmed()).toBe(false)
    now = 1400; t.mark('mic', { mic: 'granted' })
    now = 1900; t.mark('settle', { activation: false })
    now = 2100
    expect(t.sinceTap()).toBe(1100)
    expect(t.since('settle')).toBe(200)
    t.mark('ready', { words: 'ready' })
    expect(t.warmed()).toBe(true)
    expect(note.mock.calls.map(c => [c[0], c[1].name, c[1].sinceTap])).toEqual([['start-mark', 'tap', 0], ['start-mark', 'mic', 400], ['start-mark', 'settle', 900], ['start-mark', 'ready', 1100]])
    expect(note.mock.calls[1][1]).toMatchObject({ mic: 'granted' })
  })

  it('окно: ровно TRACE_WINDOW_MS после тапа; новый тап начинает с нуля', () => {
    let now = 0
    const t = createStartTrace({ now: () => now, note: vi.fn() })
    t.begin()
    now = TRACE_WINDOW_MS; expect(t.inWindow()).toBe(true)
    now = TRACE_WINDOW_MS + 1; expect(t.inWindow()).toBe(false)
    t.begin(); expect(t.inWindow()).toBe(true); expect(t.since('mic')).toBeNull()
    t.setNeedsTap(true); expect(t.needsTap()).toBe(true)
    t.begin(); expect(t.needsTap()).toBe(false)
    t.reset(); expect(t.phase()).toBe('idle')
  })
})
