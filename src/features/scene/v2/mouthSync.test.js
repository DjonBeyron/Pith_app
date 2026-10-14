import { describe, it, expect, vi } from 'vitest'
import { createMouthSync, STALL_MS, HIDDEN_POLL_MS, WEAK_POLL_MS } from './mouthSync.js'

const timings = [
  { word: 'Раз', start: 0.1, end: 0.4 },
  { word: 'два', start: 0.5, end: 0.8 },
]

// Поддельный <audio> и ручные rAF/таймеры/часы
function harness({ pollMs = 0, hidden = false } = {}) {
  const audio = { currentTime: 0, paused: false, seeking: false, readyState: 4 }
  let frame = null
  let timer = null
  let wall = 0
  const shapes = []
  const sync = createMouthSync(audio, timings, s => shapes.push(s), {
    raf: f => { frame = f; return 1 }, caf: () => { frame = null },
    timers: { setTimeout: (f, ms) => { timer = { f, ms }; return 7 }, clearTimeout: () => { timer = null } },
    now: () => wall, pollMs, isHidden: () => hidden,
  })
  const step = (t, dt = 16) => { wall += dt; audio.currentTime = t; const f = frame ?? timer?.f; frame = null; timer = null; f?.() }
  return { audio, sync, shapes, step, pending: () => frame !== null || timer !== null, timerMs: () => timer?.ms ?? null, setHidden: h => { hidden = h } }
}

describe('mouthSync — рот по currentTime', () => {
  it('start сразу применяет визему и опрашивает через rAF только пока активен; stop закрывает рот', () => {
    const h = harness()
    h.audio.currentTime = 0.2
    h.sync.start()
    expect(h.shapes).toEqual(['open'])
    expect(h.pending()).toBe(true)
    h.step(0.45)   // пауза между словами
    expect(h.shapes.at(-1)).toBe('closed')
    h.step(0.6)
    expect(h.shapes.at(-1)).toBe('open')
    h.sync.stop()
    expect(h.shapes.at(-1)).toBe('closed')
    expect(h.pending()).toBe(false)
    expect(h.sync.isActive()).toBe(false)
  })

  it('пауза/перемотка/нет данных/время стоит (stall) → закрыт; пошло время → снова по словам', () => {
    const h = harness()
    h.audio.currentTime = 0.2
    h.sync.start()
    h.audio.paused = true
    h.step(0.2)
    expect(h.shapes.at(-1)).toBe('closed')
    h.audio.paused = false
    h.audio.readyState = 1
    h.step(0.2)
    expect(h.shapes.at(-1)).toBe('closed')
    h.audio.readyState = 4
    h.step(0.25)
    expect(h.shapes.at(-1)).toBe('open')
    // буферизация: currentTime не растёт дольше STALL_MS
    h.step(0.25, STALL_MS / 2)
    expect(h.shapes.at(-1)).toBe('open')
    h.step(0.25, STALL_MS)
    expect(h.shapes.at(-1)).toBe('closed')
    h.step(0.3)
    expect(h.shapes.at(-1)).toBe('open')
    h.audio.seeking = true
    h.step(0.35)
    expect(h.shapes.at(-1)).toBe('closed')
  })

  it('слабое устройство — редкий setTimeout вместо rAF; скрытая вкладка — опрос раз в 250 мс', () => {
    const weak = harness({ pollMs: WEAK_POLL_MS })
    weak.sync.start()
    expect(weak.timerMs()).toBe(WEAK_POLL_MS)
    const hid = harness({ hidden: true })
    hid.sync.start()
    expect(hid.timerMs()).toBe(HIDDEN_POLL_MS)
    hid.setHidden(false)
    hid.step(0.2)
    expect(hid.timerMs()).toBeNull() // снова rAF
    expect(hid.pending()).toBe(true)
  })

  it('setTimings меняет ритм на лету (длительность файла стала известна); повторный start/stop — тихо', () => {
    const h = harness()
    h.sync.start()
    h.sync.start()
    h.sync.setTimings([{ word: 'x', start: 0, end: 5 }])
    h.step(2)
    expect(h.shapes.at(-1)).toBe('open')
    h.sync.stop(); h.sync.stop()
    expect(h.shapes.filter(s => s === 'closed').length).toBe(2) // start(t=0: пауза) + stop
    expect(vi.fn()).toBeDefined()
  })
})
