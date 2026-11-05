import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import RaceCharge from './RaceCharge.jsx'
import { pillLabel } from './raceCharge.js'
import { stretchAt, STRETCH_MAX } from './raceChargePath.js'
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
  it('растяжение: 1 на старте и к прилёту, не выше 1,08 на всём пути, пик в первой половине', () => {
    expect(STRETCH_MAX).toBeLessThanOrEqual(1.08)
    expect(stretchAt(0)).toBe(1); expect(stretchAt(1)).toBe(1)
    let peak = 0, at = 0
    for (let u = 0; u <= 1.0001; u += 0.01) { const v = stretchAt(u); expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(1.08 + 1e-9); if (v > peak) { peak = v; at = u } }
    expect(peak).toBeGreaterThan(1.07); expect(at).toBeLessThan(0.5); expect(stretchAt(0.9)).toBeLessThan(stretchAt(0.5))
  })
  it('длинное слово обрезается, короткое нет', () => { expect(pillLabel('learn')).toBe('learn'); expect(pillLabel('extraordinarily-long-word').length).toBe(16) })
  it('в CSS шлейф — только при data-trail, без filter, без призраков (box-shadow) и без --tail: один мягкий хвост-градиент', () => {
    expect(css).not.toMatch(/filter\s*:/); expect(css).not.toMatch(/box-shadow/); expect(css).not.toContain('--tail')
    const tail = rule('.raceCharge[data-trail] .raceChargePill::before')
    expect(tail).toMatch(/linear-gradient\(to bottom, color-mix\(in srgb, var\(--c\) \d+%, transparent\), transparent\)/); expect(tail).toMatch(/border-radius:\s*0 0 999px 999px/)
    expect(Number(/height:\s*(\d+)%/.exec(tail)?.[1])).toBeLessThanOrEqual(120) // хвост не выше 1,2 высоты пилюли
    const peaks = [...css.slice(css.indexOf('@keyframes raceTail')).split('}')[0].matchAll(/opacity:\s*([\d.]+)/g)].map(m => Number(m[1]))
    expect(Math.max(...peaks)).toBeLessThanOrEqual(0.35); expect(peaks.at(-1)).toBe(0) // прозрачность ≤ 0,35 и ноль к прилёту
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
