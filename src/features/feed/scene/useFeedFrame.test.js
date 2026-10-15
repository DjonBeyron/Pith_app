import { describe, it, expect, vi, afterEach } from 'vitest'
import { applyFeedFrame } from './useFeedFrame.js'

// Без DOM: «элемент» с размером, padding'ами (нижняя панель / safe-area сверху) и style.setProperty
function fakeEl(w, h, paddingBottom, paddingTop) {
  const vars = {}
  vi.stubGlobal('getComputedStyle', () => ({ paddingBottom: `${paddingBottom}px`, paddingTop: `${paddingTop}px` }))
  return { clientWidth: w, clientHeight: h, style: { setProperty: (k, v) => { vars[k] = v } }, vars }
}
afterEach(() => vi.unstubAllGlobals())

describe('applyFeedFrame — кадр в CSS-переменные корня слайда-сцены', () => {
  it('меряет слайд и padding (панель, safe-area), пишет переменные без React', () => {
    const el = fakeEl(390, 664, 40, 0)
    const r = applyFeedFrame(el)
    expect(r.warnings).toEqual([])
    expect(el.vars['--sf-k']).toBe('1')
    expect(el.vars['--sf-ty']).toBe(`${r.ty}px`)
    expect(parseFloat(el.vars['--sf-ty'])).toBeLessThan(0) // верх сцены уходит за край: слайд ниже 9:16
    expect(el.vars['--pause-y']).toMatch(/px$/)
  })

  it('кадр сцены (feedFrame) меняет переменные; нулевой размер — ничего не пишет', () => {
    const el = fakeEl(390, 844, 74, 47)
    applyFeedFrame(el, { scale: 1.3, x: 0.1, y: 0, anchor: 'bottom' })
    expect(el.vars['--sf-k']).toBe('1.3')
    expect(el.vars['--sf-tx']).toBe('39px')
    const empty = fakeEl(0, 0, 0, 0)
    expect(applyFeedFrame(empty)).toBeNull()
    expect(empty.vars).toEqual({})
  })
})
