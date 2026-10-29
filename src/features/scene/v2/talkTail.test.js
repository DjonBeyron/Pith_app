import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Хук без DOM-среды: useLayoutEffect выполняет тело сразу, useRef — обычный объект; cleanup собираем руками
const hooks = vi.hoisted(() => ({ cleanups: [], refs: new Map(), n: 0 }))
vi.mock('react', () => ({
  useRef: init => { const k = hooks.n++; if (!hooks.refs.has(k)) hooks.refs.set(k, { current: init }); return hooks.refs.get(k) },
  useLayoutEffect: fn => { const c = fn(); if (typeof c === 'function') hooks.cleanups.push(c) },
}))

const { startTail, cancelTail, TAIL_CLASS, TAIL_MS } = await import('./talkTail.js')
const { useTalkTail } = await import('./useTalkTail.js')

// Элемент с classList и ручными таймерами
function fakeEl() {
  const classes = new Set()
  return { classes, classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) } }
}
function fakeTimers() {
  const list = []
  let id = 0
  return {
    list,
    setTimeout: (fn, ms) => { list.push({ id: ++id, fn, ms }); return id },
    clearTimeout: i => { const k = list.findIndex(x => x.id === i); if (k >= 0) list.splice(k, 1) },
    fire: () => { const [x] = list.splice(0, 1); x.fn() },
  }
}

describe('talkTail: усы доезжают до покоя, а не обрываются', () => {
  it('startTail ставит is-tail и снимает его через TAIL_MS — дольше перехода амплитуды (0,3 с), чтобы анимация пропадала уже на нуле', () => {
    const el = fakeEl(); const t = fakeTimers()
    startTail(el, t)
    expect(el.classes.has(TAIL_CLASS)).toBe(true)
    expect(t.list.map(x => x.ms)).toEqual([TAIL_MS])
    expect(TAIL_MS).toBeGreaterThan(300)
    t.fire()
    expect(el.classes.has(TAIL_CLASS)).toBe(false)
  })

  it('повторный startTail продлевает хвост (один таймер), cancelTail снимает класс и таймер сразу', () => {
    const el = fakeEl(); const t = fakeTimers()
    startTail(el, t); startTail(el, t)
    expect(t.list).toHaveLength(1)
    cancelTail(el)
    expect(el.classes.has(TAIL_CLASS)).toBe(false)
    expect(t.list).toHaveLength(0)
    expect(() => cancelTail(el)).not.toThrow()
    expect(() => cancelTail(null)).not.toThrow()
    expect(startTail(null)).toBeTypeOf('function')
  })

  it('возврат из startTail — отмена', () => {
    const el = fakeEl(); const t = fakeTimers()
    const cancel = startTail(el, t)
    cancel()
    expect(el.classes.has(TAIL_CLASS)).toBe(false)
    expect(t.list).toHaveLength(0)
  })
})

describe('useTalkTail (кот сцены)', () => {
  function run(el, talking, enabled = true) {
    hooks.n = 0
    useTalkTail({ current: el }, talking, enabled)
  }
  function fresh() { hooks.cleanups.length = 0; hooks.refs.clear() }

  it('true → false: хвост ставится в том же коммите; снова true — хвост отменён (cleanup), анимация продолжается', () => {
    fresh()
    const el = fakeEl()
    run(el, false)
    expect(el.classes.has(TAIL_CLASS)).toBe(false)         // молчал с начала — хвоста нет, лишней работы нет
    run(el, true)
    expect(el.classes.has(TAIL_CLASS)).toBe(false)
    run(el, false)
    expect(el.classes.has(TAIL_CLASS)).toBe(true)          // речь кончилась — усы доезжают
    hooks.cleanups.pop()()                                 // следующий запуск эффекта: заговорил снова
    expect(el.classes.has(TAIL_CLASS)).toBe(false)
    cancelTail(el)
  })

  it('enabled=false (lite, флаг v2 выключен, статика): ничего не делает даже после речи', () => {
    fresh()
    const el = fakeEl()
    run(el, true, false)
    run(el, false, false)
    expect(el.classes.has(TAIL_CLASS)).toBe(false)
  })
})

describe('подключение к сцене', () => {
  it('Cat в SceneRenderer получает хвост только в live + animV2 + не lite; ссылка на <g> сохраняется рядом с onEl', () => {
    const src = readFileSync(fileURLToPath(new URL('./SceneRenderer.jsx', import.meta.url)), 'utf8')
    expect(src).toContain('useTalkTail(gRef, talking, tail)')
    expect(src).toContain('const tailOn = live && animV2 && !isLite')
    expect(src).toContain('ref={el => { gRef.current = el; onEl(who, el) }}')
    expect(src.match(/tail=\{tailOn\}/g)).toHaveLength(2) // оба кота
  })
})
