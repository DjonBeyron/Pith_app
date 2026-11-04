import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import RaceCharge from './RaceCharge.jsx'
import { stretchAt, tailPx, pillLabel, STRETCH_MAX, STRETCH_END, TAIL_MIN_PX, TAIL_MAX_PX } from './raceCharge.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { extrasOf } from './raceWords.js'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'

vi.mock('../../shared/lib/deviceTier.js', () => ({ isWeakDevice: vi.fn(() => false) }))

// Заставка: шлейф «размытия движения» без filter и порядок слоёв (бар выше пилюль, пилюли выше фона, пилюля заходит под бар).
const css = readFileSync(new URL('../../styles/player/modules/race-charge.css', import.meta.url), 'utf8')
const rule = sel => { const i = css.indexOf(`${sel} {`); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)) }
const z = sel => Number(/z-index:\s*(\d+)/.exec(rule(sel))?.[1] ?? NaN)
const plan = (() => { const p = normalizePlan({ ...fixturePlan('three'), game: 'race' }); return { ...p, extraWords: extrasOf(p) } })()

describe('шлейф пилюли заставки', () => {
  it('растяжение: 1 на старте, пик STRETCH_MAX посередине, снова 1 к STRETCH_END и до прилёта', () => {
    expect(stretchAt(0)).toBe(1)
    expect(stretchAt(STRETCH_END / 2)).toBeCloseTo(STRETCH_MAX, 5)
    expect(stretchAt(STRETCH_END)).toBe(1); expect(stretchAt(1)).toBe(1)
    for (const u of [0.1, 0.3, 0.6, 0.8]) { expect(stretchAt(u)).toBeGreaterThanOrEqual(1); expect(stretchAt(u)).toBeLessThanOrEqual(STRETCH_MAX) }
  })
  it('хвост длиннее у быстрой пилюли, в пределах от TAIL_MIN_PX до TAIL_MAX_PX', () => {
    expect(tailPx(800, 1500)).toBeLessThan(tailPx(800, 700))
    expect(tailPx(800, 100000)).toBe(TAIL_MIN_PX); expect(tailPx(800, 1)).toBe(TAIL_MAX_PX)
  })
  it('длинное слово обрезается, короткое нет', () => { expect(pillLabel('learn')).toBe('learn'); expect(pillLabel('extraordinarily-long-word').length).toBe(16) })
  it('в CSS шлейф — только при data-trail, без filter; хвост и призраки без лишнего DOM (псевдоэлемент и box-shadow)', () => {
    expect(css).not.toMatch(/filter\s*:/)
    expect(rule('.raceCharge[data-trail] .raceChargePill')).toMatch(/box-shadow/)
    expect(rule('.raceCharge[data-trail] .raceChargePill::before')).toMatch(/linear-gradient\(to bottom/)
    expect(rule('.raceChargePill')).not.toMatch(/box-shadow/)
  })
})

describe('слои заставки: пилюля заходит под бар', () => {
  it('z-index: бар выше слоя пилюль, слой пилюль выше фона (0); слой обрезан по линии бара', () => {
    expect(z('.raceChargeBar')).toBeGreaterThan(z('.raceChargePills'))
    expect(z('.raceChargePills')).toBeGreaterThan(0)
    expect(rule('.raceChargePills')).toMatch(/clip-path:\s*inset\(calc\(env\(safe-area-inset-top, 0px\) \+ 16px\)/)
    expect(rule('.raceChargePill')).not.toMatch(/z-index/) // пилюля внутри слоя пилюль, своего z-index нет (иначе перебила бы бар)
  })
  describe('разметка', () => {
    const html = () => renderToStaticMarkup(createElement(RaceCharge, { plan, on: true }))
    it('пилюли лежат в слое .raceChargePills, бар — отдельный узел вне слоя; шлейф включён; у пилюли нет вложенных узлов', () => {
      const h = html()
      expect(h).toContain('data-trail="true"')
      const layer = h.slice(h.indexOf('data-testid="race-charge-pills"'))
      expect(h.indexOf('race-charge-bar')).toBeLessThan(h.indexOf('race-charge-pills')) // бар идёт до слоя и не внутри него
      expect(layer.match(/data-testid="race-charge-pill"/g).length).toBeGreaterThan(3)
      expect(h.match(/<span [^>]*race-charge-pill[^>]*>[^<]*<\/span>/g).length).toBe(layer.match(/data-testid="race-charge-pill"/g).length) // только текст внутри
      expect(layer.slice(0, layer.indexOf('</div>'))).not.toContain('race-charge-bar')
    })
    it('lite (слабое устройство): шлейфа нет', () => {
      isWeakDevice.mockReturnValueOnce(true)
      expect(html()).not.toContain('data-trail')
    })
  })
})
