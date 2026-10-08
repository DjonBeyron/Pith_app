import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Цикл плавания без DOM: react подменён (эффект выполняется сразу), холст, rAF и события — фейки.
const react = vi.hoisted(() => ({ effects: [] }))
vi.mock('react', () => ({ useLayoutEffect: fn => { react.effects.push(fn) } }))

import { usePhraseBubbleFloat } from './usePhraseBubbleFloat.js'
import { buildGrid } from './phraseBubbleGrid.js'

function target(extra = {}) {
  const map = new Map()
  return {
    ...extra,
    addEventListener: (n, f) => { if (!map.has(n)) map.set(n, new Set()); map.get(n).add(f) },
    removeEventListener: (n, f) => map.get(n)?.delete(f),
    emit: n => map.get(n)?.forEach(f => f()),
    listeners: () => [...map.values()].reduce((a, s) => a + s.size, 0),
  }
}
let doc, win, draws
function fakeCanvas() {
  const ctx = { setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, arc() {}, fill() {} }
  ctx.fill = () => { draws.n++ }
  return { width: 300, height: 150, style: {}, classList: { contains: () => false }, getContext: () => ctx }
}
beforeEach(() => {
  react.effects = []
  draws = { n: 0 }
  doc = target({ visibilityState: 'visible' })
  win = target()
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', win)
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

function mount(regions = [{ x: 0, y: 0, w: 40, h: 20 }]) {
  const canvas = fakeCanvas()
  const onSleep = vi.fn()
  usePhraseBubbleFloat({
    live: true, unlocked: false, exploding: false, ready: true,
    canvasRef: { current: canvas }, bubblesRef: { current: buildGrid(40, 20, regions) },
    sizeRef: { current: { w: 68, h: 38, dpr: 1.5 } }, regionsRef: { current: regions },
    isMounted: () => true, idRef: { current: 9 }, fit: vi.fn(), onSleep,
  })
  const cleanup = react.effects[0]()
  return { canvas, onSleep, cleanup }
}

describe('usePhraseBubbleFloat: плавание и уход приложения в фон', () => {
  it('крутится по кадрам; blur останавливает rAF сразу, focus продолжает; отписка и уход холста', () => {
    const { canvas, onSleep, cleanup } = mount()
    const first = draws.n // кадр 0 нарисован до показа
    expect(first).toBe(1)
    vi.advanceTimersByTime(400)
    expect(draws.n).toBeGreaterThan(first)
    win.emit('blur')
    expect(vi.getTimerCount()).toBe(0)
    const frozen = draws.n
    vi.advanceTimersByTime(2000)
    expect(draws.n).toBe(frozen)
    win.emit('focus')
    vi.advanceTimersByTime(400)
    expect(draws.n).toBeGreaterThan(frozen)
    cleanup()
    expect(vi.getTimerCount()).toBe(0)
    expect(win.listeners() + doc.listeners()).toBe(0)
    expect(canvas.width).toBe(0) // холст ушёл — backing store освобождён
    expect(onSleep).toHaveBeenCalledTimes(1) // и картинка покоя снимается
  })

  it('страница уже скрыта: цикл не стартует, при возврате начинается', () => {
    doc.visibilityState = 'hidden'
    mount()
    vi.advanceTimersByTime(1000)
    expect(vi.getTimerCount()).toBe(0)
    doc.visibilityState = 'visible'
    doc.emit('visibilitychange')
    expect(vi.getTimerCount()).toBeGreaterThan(0)
  })

  it('холст перешёл во взрыв (класс Exploding): картинку покоя не снимаем и холст не трогаем', () => {
    const { canvas, onSleep, cleanup } = mount()
    canvas.classList.contains = c => c === 'phraseBubbleCanvasExploding'
    cleanup()
    expect(onSleep).not.toHaveBeenCalled()
    expect(canvas.width).toBe(300)
  })
})
