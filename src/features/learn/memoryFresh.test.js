import { describe, it, expect, afterEach, vi } from 'vitest'
import { flyToTab, sendWordToMemory, TARGET_FRAMES } from './memoryFresh.js'

// Полёт слова к вкладке «Память»: у нового пользователя кнопки на панели ещё нет в момент события —
// React рисует её чуть позже, поэтому цель ждём несколько кадров. Окружение без DOM — всё подменяем
function setup({ appearAfter = 0 } = {}) {
  const frames = []
  const target = { getBoundingClientRect: () => ({ left: 100, top: 700, width: 60, height: 50 }) }
  let calls = 0
  const body = { appendChild: vi.fn() }
  const animate = vi.fn(() => ({ finished: Promise.resolve() }))
  const clone = { style: {}, animate, remove: vi.fn() }
  vi.stubGlobal('document', {
    body,
    querySelector: () => (calls++ >= appearAfter ? target : null),
  })
  const win = { matchMedia: () => ({ matches: false }), dispatchEvent: vi.fn() }
  vi.stubGlobal('window', win)
  vi.stubGlobal('requestAnimationFrame', cb => { frames.push(cb); return frames.length })
  vi.stubGlobal('Event', class { constructor(t) { this.type = t } })
  const el = {
    animate: vi.fn(),
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 80, height: 30 }),
    cloneNode: () => clone,
  }
  const runFrame = () => frames.shift()?.()
  return { el, clone, animate, body, frames, runFrame, win }
}

describe('flyToTab', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('кнопка уже есть — летит сразу, без ожидания кадров', () => {
    const s = setup()
    flyToTab(s.el)
    expect(s.body.appendChild).toHaveBeenCalledWith(s.clone)
    expect(s.animate).toHaveBeenCalledTimes(1)
    expect(s.frames.length).toBe(0)
  })

  it('кнопки ещё нет (вкладка только появляется) — ждёт кадр и летит к ней', () => {
    const s = setup({ appearAfter: 2 })
    flyToTab(s.el) // поиск 1 — пусто
    expect(s.animate).not.toHaveBeenCalled()
    s.runFrame() // поиск 2 — пусто
    expect(s.animate).not.toHaveBeenCalled()
    s.runFrame() // поиск 3 — кнопка появилась
    expect(s.animate).toHaveBeenCalledTimes(1)
    const [keys] = s.animate.mock.calls[0]
    // центр цели (130, 725) минус центр плашки (50, 35)
    expect(keys[1].transform).toContain('translate(80px, 690px)')
  })

  it('плашку копируют сразу: к моменту появления кнопки оригинал может уже уйти с экрана', () => {
    const s = setup({ appearAfter: 1 })
    flyToTab(s.el)
    expect(s.body.appendChild).toHaveBeenCalledTimes(1)
    expect(s.clone.style.left).toBe('10px')
  })

  it('кнопка так и не появилась — копия убирается, без полёта и без вечного ожидания', () => {
    const s = setup({ appearAfter: 1000 })
    flyToTab(s.el)
    for (let i = 0; i < TARGET_FRAMES + 3; i++) s.runFrame()
    expect(s.animate).not.toHaveBeenCalled()
    expect(s.clone.remove).toHaveBeenCalledTimes(1)
    expect(s.frames.length).toBe(0)
  })

  it('«меньше движения» — не летит и ничего не копирует', () => {
    const s = setup()
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    flyToTab(s.el)
    expect(s.body.appendChild).not.toHaveBeenCalled()
  })
})

describe('sendWordToMemory', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('сначала сообщает «слово прилетело», потом запускает полёт', () => {
    const s = setup()
    vi.stubGlobal('localStorage', { setItem: vi.fn(), getItem: () => null })
    const order = []
    s.win.dispatchEvent = () => order.push('event')
    s.body.appendChild = () => order.push('fly')
    sendWordToMemory(s.el)
    expect(order).toEqual(['event', 'fly'])
  })
})
