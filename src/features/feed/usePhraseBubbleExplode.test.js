import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Сквозная проверка хука взрыва без DOM: react подменён (хуки выполняются сразу), холсты, rAF и события — фейки.
const react = vi.hoisted(() => ({ refs: [], cursor: 0, effects: [] }))
vi.mock('react', () => ({
  useRef: init => (react.refs[react.cursor] ??= { current: init }, react.refs[react.cursor++]),
  useLayoutEffect: fn => { react.effects.push(fn) },
}))

import { usePhraseBubbleExplode } from './usePhraseBubbleExplode.js'
import { buildGrid } from './phraseBubbleGrid.js'
import { spoilerStats } from './spoilerStats.js'
import { MARGIN_X, MARGIN_Y } from './phraseBubbleConsts.js'
import { EXPLODE_MARGIN } from './phraseBubbleDraw.js'

const word = (x, w) => ({ x, y: 0, w, h: 20 })
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
// Холст-пустышка: пишет вызовы рисования
function fakeCanvas(log = []) {
  const ctx = {
    clearRect: () => log.push('clear'), drawImage: () => log.push('image'), setTransform() {}, beginPath() {}, moveTo() {},
    rect: () => log.push('p'), arc: () => log.push('p'), fill() {},
  }
  return { width: 300, height: 150, style: {}, getContext: () => ctx, log }
}

let sprites, doc, win
beforeEach(() => {
  react.refs = []; react.cursor = 0; react.effects = []
  sprites = []
  doc = target({ visibilityState: 'visible', createElement: () => { const c = fakeCanvas(); sprites.push(c); return c } })
  win = target()
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', win)
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

// Монтирование хука: на каждый «рендер» первый (безусловный) эффект идёт заново, эффект взрыва — один раз
function mount(extra = {}) {
  const grid = buildGrid(160, 20, [word(0, 40), word(60, 40), word(120, 40)])
  const p = {
    exploding: true, explode: true, floatRef: { current: fakeCanvas() }, blastRef: { current: fakeCanvas() },
    bubblesRef: { current: grid }, sizeRef: { current: { w: 160 + MARGIN_X * 2, h: 20 + MARGIN_Y * 2, dpr: 1.5 } },
    idRef: { current: 7 }, setUnlocked: vi.fn(), setRevealed: vi.fn(), onUnlock: vi.fn(), ...extra,
  }
  let cleanup = null
  const render = props => {
    react.cursor = 0; react.effects = []
    usePhraseBubbleExplode({ ...p, ...props })
    react.effects[0]()
    if (!cleanup) cleanup = react.effects[1]()
  }
  render()
  return { p, render, unmount: () => cleanup?.() }
}
const run = ms => vi.advanceTimersByTime(ms)

describe('usePhraseBubbleExplode: холст взрыва живёт только на время взрыва', () => {
  it('холст взрыва — dpr 1 с запасом 120px, холст плавания освобождён; в конце всё обнулено и облачка сняты', () => {
    const { p } = mount()
    const blast = p.blastRef.current
    expect(blast.width).toBe(160 + EXPLODE_MARGIN * 2)
    expect(blast.height).toBe(20 + EXPLODE_MARGIN * 2)
    expect(p.floatRef.current.width).toBe(0)
    expect(p.setUnlocked).toHaveBeenCalledWith(true)
    expect(p.onUnlock).toHaveBeenCalledTimes(1)
    expect(spoilerStats()).toMatch(/gpu≈0\.[1-9]\d MB/) // идёт взрыв: холст взрыва 400×260×4 ≈ 0.40 MB в оценке
    run(3000)
    expect(p.setRevealed).toHaveBeenCalledWith(true)
    expect(blast.width).toBe(0)
    expect(blast.height).toBe(0)
    expect(p.bubblesRef.current).toEqual([])
    expect(spoilerStats()).toMatch(/gpu≈0\.00 MB/)
    expect(vi.getTimerCount()).toBe(0) // ни rAF, ни страховочного таймера
    expect(win.listeners() + doc.listeners()).toBe(0) // подписка снята
  })

  it('облачка по очереди: живые — спрайты dpr 1 под частицами; запущенное облачко освобождает свой спрайт', () => {
    const { p, render } = mount({ explode: 1 })
    const log = p.blastRef.current.log
    // Первый кадр: два живых облачка (спрайты) рисуются ДО частиц первого
    const firstParticle = log.indexOf('p')
    expect(log.slice(0, firstParticle).filter(x => x === 'image')).toHaveLength(2)
    expect(sprites).toHaveLength(2)
    expect(sprites.every(c => c.width > 0)).toBe(true)
    run(100)
    render({ explode: 2 })
    run(40)
    expect(sprites.filter(c => c.width === 0)).toHaveLength(1) // второе облачко запущено — его спрайт освобождён
    render({ explode: 3 })
    run(40)
    expect(sprites.every(c => c.width === 0)).toBe(true)
    run(3000)
    expect(p.setRevealed).toHaveBeenCalledWith(true)
  })

  it('приложение ушло в фон: ни rAF, ни таймеров, холст и спрайты освобождены; вернулись — облачка сняты', () => {
    const { p } = mount({ explode: 1 })
    run(100)
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    win.emit('blur') // шторка iOS: только window blur
    expect(vi.getTimerCount()).toBe(0)
    expect(p.blastRef.current.width).toBe(0)
    expect(sprites.every(c => c.width === 0)).toBe(true)
    expect(p.setRevealed).not.toHaveBeenCalled()
    run(5000)
    expect(p.setRevealed).not.toHaveBeenCalled() // в фоне ничего не крутится
    win.emit('focus')
    expect(p.setRevealed).toHaveBeenCalledWith(true)
    expect(win.listeners() + doc.listeners()).toBe(0)
  })

  it('команда пришла в уже скрытом приложении: анимации нет, текст открыт, облачка сняты таймером', () => {
    doc.visibilityState = 'hidden'
    const { p } = mount()
    expect(p.setUnlocked).toHaveBeenCalledWith(true)
    expect(p.blastRef.current.width).toBe(0)
    run(1)
    expect(p.setRevealed).toHaveBeenCalledWith(true)
  })

  it('размонтирование посреди взрыва снимает всё: таймеры, подписки, холст', () => {
    const { p, unmount } = mount()
    run(100)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    expect(win.listeners() + doc.listeners()).toBe(0)
    expect(p.blastRef.current.width).toBe(0)
  })
})
