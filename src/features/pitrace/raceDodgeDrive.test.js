import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createDodgeDrive, measureHead, PEEK_MS } from './raceDodgeDrive.js'
import { HEAD_TOP, leadOf } from './raceDodge.js'

// Привод «Пит уворачивается» на поддельной голове (в тестах нет DOM): класс слежения, переменная --wl-dx у svg, data-dodge, журнал «[dodge]», подъём головы; CSS — только transform / opacity-семейство
function fakeCat({ catX = '' } = {}) {
  const vars = {}
  const svg = { style: { setProperty: (k, v) => { vars[k] = v } } }
  const cls = new Set()
  const cat = {
    dataset: {}, style: { getPropertyValue: () => catX },
    classList: { add: c => cls.add(c), contains: c => cls.has(c) },
    querySelector: () => svg, parentElement: null, offsetWidth: 0, offsetHeight: 0,
  }
  return { cat, vars, cls }
}
const pill = (y, o = {}) => ({ id: 'a', lane: 0, y, speed: 1, state: 'fly', ...o })
const atDodge = HEAD_TOP - leadOf(1) - 10 + 0.5

describe('raceDodgeDrive', () => {
  it('нет головы — привода нет', () => {
    expect(createDodgeDrive({ cat: null })).toBeNull()
  })
  it('начинает с места, где голова торчит (--cat-x), без перехода', () => {
    const { cat, vars, cls } = fakeCat({ catX: '73' })
    createDodgeDrive({ cat, log: () => {} })
    expect(cls.has('wlCat--track')).toBe(true)
    expect(cat.dataset.dodge).toBe('set')
    expect(vars['--wl-dx']).toBe('46.00%') // (73 − 50) / 50 ширины головы
  })
  it('переезд → уворот (одна строка журнала) → возврат', () => {
    const { cat, vars } = fakeCat()
    const log = vi.fn(), peek = vi.fn()
    const d = createDodgeDrive({ cat, log, peek, now: () => 0 })
    d.step([pill(20)], 0)
    expect(cat.dataset.dodge).toBe('track')
    expect(vars['--wl-dx']).toBe('-46.00%')
    d.step([pill(atDodge)], 100)
    d.step([pill(atDodge + 1)], 116)
    expect(cat.dataset.dodge).toBe('out')
    expect(cat.dataset.dir).toBe('r')
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toMatch(/^\[dodge\] дорожка 1, .*скорость ×1\.00, вправо/)
    expect(peek).toHaveBeenCalledWith(PEEK_MS)
    d.step([], 900)
    expect(cat.dataset.dodge).toBe('back')
    expect(cat.dataset.dodgeX).toBe('27')
  })
  it('следующая ступень продолжает с прежнего места; stop в стороне — возврат', () => {
    const { cat } = fakeCat()
    createDodgeDrive({ cat, log: () => {} }).step([pill(20, { lane: 2 })], 0)
    const d2 = createDodgeDrive({ cat, log: () => {} })
    expect(cat.dataset.dodge).toBe('track') // класс уже стоит — «set» не повторяется
    d2.step([pill(atDodge, { lane: 2 })], 0)
    expect(cat.dataset.dodge).toBe('out')
    d2.stop()
    expect(cat.dataset.dodge).toBe('back')
  })
  it('measureHead: без размеров — средние', () => {
    expect(measureHead({ parentElement: null })).toEqual({ headW: 50, headTop: HEAD_TOP })
    const stage = { offsetWidth: 375, offsetHeight: 812 }
    const m = measureHead({ parentElement: stage, offsetWidth: 187.5, offsetHeight: 159.5 })
    expect(m.headW).toBe(50)
    expect(m.headTop).toBeCloseTo(81.1, 1)
  })
})

describe('word-lane-cat-dodge.css', () => {
  const css = readFileSync(new URL('../../styles/player/modules/word-lane-cat-dodge.css', import.meta.url), 'utf8')
  it('подключён из word-lane.css', () => {
    expect(readFileSync(new URL('../../styles/player/modules/word-lane.css', import.meta.url), 'utf8')).toMatch(/@import '\.\/word-lane-cat-dodge\.css';/)
  })
  it('без filter; анимируются только transform / rotate / scale', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toMatch(/filter\s*:/)
    for (const m of rules.matchAll(/transition:\s*([^;]+);/g)) if (m[1].trim() !== 'none') expect(m[1]).toMatch(/^transform /)
    for (const kf of rules.matchAll(/@keyframes\s+\w+\s*\{([\s\S]*?)\}\s*\}/g)) {
      const props = [...kf[1].matchAll(/([a-z-]+)\s*:/g)].map(x => x[1])
      expect(props.every(p => ['rotate', 'scale'].includes(p))).toBe(true)
    }
  })
  it('слабое устройство и reduced-motion — без пружины', () => {
    expect(css).toMatch(/scn--lite\[data-dodge='out'\][^{]*\{ transition: none; animation: none; \}/)
    expect(css).toMatch(/prefers-reduced-motion: reduce/)
  })
})
