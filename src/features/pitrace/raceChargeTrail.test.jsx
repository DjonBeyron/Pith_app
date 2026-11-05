import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import RaceCharge from './RaceCharge.jsx'
import { pillLabel } from './raceCharge.js'
import { stretchAt, STRETCH_MAX, tailAngle, tailFrames, pathX, TAIL_MAX, PATH_FRAMES } from './raceChargePath.js'
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
  it('в CSS хвост — отдельный узел .raceChargeTail ПОД пилюлей: от середины пилюли, прямоугольный, мягкий градиент, без filter / box-shadow / --tail', () => {
    expect(css).not.toMatch(/filter\s*:/); expect(css).not.toMatch(/box-shadow/); expect(css).not.toContain('--tail'); expect(css).not.toContain('.raceChargePill::before')
    const tail = rule('.raceChargeTail')
    expect(tail).toMatch(/linear-gradient\(to bottom, color-mix\(in srgb, var\(--c\) \d+%, transparent\), transparent\)/); expect(tail).toMatch(/border-radius:\s*0;/); expect(tail).toMatch(/left:\s*0;/); expect(tail).toMatch(/right:\s*0;/) // хвост прямоугольный: ширина пилюли (с рамкой)
    expect(tail).toMatch(/top:\s*0;/) // v3.3.117: от верхних углов пилюли (трапеция clip-path, raceChargePath.TAIL_POLY)
    expect(tail).toMatch(/transform-origin:\s*50% 0;/) // точка крепления — верх хвоста: rotate вращает вокруг неё
    const h = Number(/height:\s*(\d+)%/.exec(tail)?.[1]); expect((h - 100) / 100).toBeLessThanOrEqual(1.2) // ниже пилюли выступает не больше 1,2 её высоты
    expect(rule('.raceChargePill')).toMatch(/position:\s*relative;/) // пилюля выше хвоста (идёт после него в DOM, свой слой)
    const peaks = [...css.slice(css.indexOf('@keyframes raceTail')).split('}')[0].matchAll(/opacity:\s*([\d.]+)/g)].map(m => Number(m[1]))
    expect(Math.max(...peaks)).toBeLessThanOrEqual(0.35); expect(peaks.at(-1)).toBe(0) // прозрачность ≤ 0,35 и ноль к прилёту
    expect(rule('.raceChargePill')).not.toMatch(/box-shadow/)
  })
  it('наклон хвоста: по касательной к синусоиде, знак меняется вместе с направлением синусоиды, на старте и прилёте без перекоса', () => {
    const dist = 700, up = [], down = []
    for (let k = 1; k < 30; k++) { const t = k / 30; up.push(tailAngle(0, dist, 1, t)); down.push(tailAngle(0, dist, -1, t)) }
    expect(up.some(a => a > 0.01)).toBe(true); expect(up.some(a => a < -0.01)).toBe(true) // синусоида идёт то вправо, то влево: наклон то в одну сторону, то в другую
    up.forEach((a, i) => expect(down[i]).toBeCloseTo(-a, 10)) // зеркальная волна (sign −1) — зеркальный наклон
    expect(tailAngle(0, dist, 1, 0.02)).toBeGreaterThan(0) // первая полуволна вправо (sign +1) — хвост отклоняется влево-вниз: положительный rotate по часовой
    expect(tailAngle(0, dist, -1, 0.02)).toBeLessThan(0)
    // знак угла = знак горизонтальной скорости (производной x(t))
    const vx = (sign, t) => (pathX(0, sign, t + 1e-4) - pathX(0, sign, t - 1e-4)) / 2e-4
    for (let k = 1; k < 30; k++) { const t = k / 30; if (Math.abs(vx(1, t)) > 1) expect(Math.sign(tailAngle(0, dist, 1, t))).toBe(Math.sign(vx(1, t))) }
    // пилюля уходит вправо (dx > 0, без волны) — угол положительный, влево — отрицательный; всегда в пределах ±TAIL_MAX
    expect(tailAngle(120, dist, 0, 0.5)).toBeGreaterThan(0); expect(tailAngle(-120, dist, 0, 0.5)).toBeLessThan(0)
    for (let k = 0; k <= 30; k++) { expect(Math.abs(tailAngle(300, dist, 1, k / 30))).toBeLessThanOrEqual(TAIL_MAX + 1e-9); expect(Number.isFinite(tailAngle(300, dist, 1, k / 30))).toBe(true) }
    const f = tailFrames({ dx: 50, dist, sign: 1 }); expect(f.length).toBe(PATH_FRAMES + 1); expect(f[0].offset).toBe(0); expect(f.at(-1).offset).toBe(1); expect(f.every(x => /^-?[\d.]+rad$/.test(x.rotate))).toBe(true)
  })
})

describe('слои заставки: пилюля заходит под бар', () => {
  it('z-index: бар выше слоя пилюль, слой пилюль выше фона (0); слой обрезан по линии бара', () => {
    expect(z('.raceChargeBar')).toBeGreaterThan(z('.raceChargePills'))
    expect(z('.raceChargePills')).toBeGreaterThan(0)
    expect(rule('.raceChargePills')).toMatch(/clip-path:\s*inset\(calc\(env\(safe-area-inset-top, 0px\) \+ 28px\)/) // верх среза = середина бара (бар: top 25 px + 3 px)
    expect(rule('.raceChargePill')).not.toMatch(/z-index/); expect(rule('.raceChargeFly')).not.toMatch(/z-index/) // пилюля внутри слоя пилюль, своего z-index нет (иначе перебила бы бар)
  })
  describe('разметка', () => {
    const html = () => renderToStaticMarkup(createElement(RaceCharge, { plan, on: true }))
    it('пилюли лежат в слое .raceChargePills, бар — отдельный узел вне слоя; шлейф включён: хвост РАНЬШЕ пилюли в узле полёта (под ней)', () => {
      const h = html()
      expect(h).toContain('data-trail="true"')
      const layer = h.slice(h.indexOf('data-testid="race-charge-pills"'))
      expect(h.indexOf('race-charge-bar')).toBeLessThan(h.indexOf('race-charge-pills')) // бар идёт до слоя и не внутри него
      const flies = layer.match(/class="raceChargeFly"/g)
      expect(flies.length).toBeGreaterThan(3)
      expect(layer.match(/data-testid="race-charge-tail"/g).length).toBe(flies.length) // по хвосту на пилюлю
      expect(layer.match(/<span class="raceChargePill">[^<]*<\/span>/g).length).toBe(flies.length) // в самой пилюле только текст
      expect(layer.indexOf('raceChargeTail')).toBeLessThan(layer.indexOf('raceChargePill')) // хвост раньше пилюли в DOM: лежит под ней
      expect(layer.slice(0, layer.indexOf('</div>'))).not.toContain('race-charge-bar')
    })
    it('lite (слабое устройство): шлейфа нет', () => {
      isWeakDevice.mockReturnValueOnce(true)
      const h = html(); expect(h).not.toContain('data-trail'); expect(h).not.toContain('race-charge-tail')
    })
  })
})
