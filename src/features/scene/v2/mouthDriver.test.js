import { describe, it, expect, vi } from 'vitest'
import { createMouthDriver, setMouth, MOUTH_CYCLE, MOUTH_STEP_MS } from './mouthDriver.js'

// Таймеры руками: tick() — один шаг интервала
function fakeTimers() {
  let fn = null
  let id = 0
  return {
    setInterval: vi.fn(f => { fn = f; return ++id }),
    clearInterval: vi.fn(() => { fn = null }),
    tick: () => fn?.(),
    active: () => fn !== null,
  }
}

// DOM-подобный элемент: считаем, сколько раз реально трогали атрибут
function fakeEl() {
  const attrs = { 'data-mouth': 'closed' }
  return {
    writes: 0,
    getAttribute: k => attrs[k],
    setAttribute(k, v) { attrs[k] = v; this.writes += 1 },
    attrs,
  }
}

describe('mouthDriver', () => {
  it('start открывает рот и крутит цикл; stop закрывает и глушит таймер', () => {
    const t = fakeTimers()
    const shapes = []
    const d = createMouthDriver(s => shapes.push(s), t)
    d.start()
    expect(shapes).toEqual(['open'])
    t.tick(); t.tick(); t.tick(); t.tick()
    expect(shapes).toEqual(['open', 'half', 'closed', 'half', 'open'])
    expect(t.setInterval).toHaveBeenCalledWith(expect.any(Function), MOUTH_STEP_MS)
    d.stop()
    expect(shapes.at(-1)).toBe('closed')
    expect(t.active()).toBe(false)
    d.stop() // повторно — тихо
    expect(shapes.length).toBe(6)
  })

  it('onWord сбрасывает цикл в «открыто» и перезапускает интервал; вне start — игнор', () => {
    const t = fakeTimers()
    const shapes = []
    const d = createMouthDriver(s => shapes.push(s), t)
    d.onWord()
    expect(shapes).toEqual([])
    d.start()
    t.tick() // half
    d.onWord()
    expect(shapes).toEqual(['open', 'half', 'open'])
    expect(t.clearInterval).toHaveBeenCalledTimes(1)
    t.tick()
    expect(shapes.at(-1)).toBe(MOUTH_CYCLE[1])
    expect(d.isActive()).toBe(true)
  })

  it('setMouth пишет в DOM-атрибут и не трогает его, если форма та же (нет лишних записей)', () => {
    const el = fakeEl()
    setMouth(el, 'closed')
    expect(el.writes).toBe(0)
    setMouth(el, 'open')
    setMouth(el, 'open')
    expect(el.writes).toBe(1)
    expect(el.attrs['data-mouth']).toBe('open')
    setMouth(null, 'half') // элемента ещё нет — не падаем
  })

  it('драйвер + setMouth: за полный цикл речи ни одного вызова React-состояния — только атрибуты', () => {
    const t = fakeTimers()
    const el = fakeEl()
    const setState = vi.fn()
    const d = createMouthDriver(s => setMouth(el, s), t)
    d.start()
    for (let i = 0; i < 8; i++) t.tick()
    d.onWord()
    d.stop()
    expect(el.writes).toBeGreaterThan(5)
    expect(setState).not.toHaveBeenCalled()
    expect(el.attrs['data-mouth']).toBe('closed')
  })
})
