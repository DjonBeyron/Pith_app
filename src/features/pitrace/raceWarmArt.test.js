import { describe, it, expect, beforeEach } from 'vitest'
import { collectGameArt, collectGameArtSoft, warmGameArt, resetGameArt, START_DELAY_MS, CHUNK } from './raceWarmArt.js'

const U1 = "data:image/svg+xml,%3Csvg width='30'%3E%3C/svg%3E", U2 = "data:image/svg+xml,%3Csvg width='90'%3E%3C/svg%3E"
const rule = (selectorText, cssText) => ({ selectorText, cssText, cssRules: [] }) // как в Chromium: у обычного правила cssRules есть, но пуст
const sheet = (...rules) => ({ cssRules: rules })

describe('прогрев картинок-узоров игры', () => {
  beforeEach(() => resetGameArt())
  it('берёт только SVG из правил игры, в том числе из @media и из переменных, без повторов', () => {
    const sheets = [sheet(
      rule('.wl[data-race] .wlTurn[data-cat="mia"]::before', `x { background-image: url("${U1}"); }`),
      { cssRules: [rule('.wlTurn', `x { --wl-plate-tex: url("${U2}"); }`), rule('.wlTurn:hover', `x { --t: url("${U2}"); }`)] },
      rule('.shell-nav', `x { background: url("${U1}x"); }`), // не игра
      rule('.wlPill', 'x { color: red; }'),
    )]
    expect(collectGameArt(sheets)).toEqual([U1, U2])
  })
  it('не падает на закрытой таблице стилей', () => {
    const bad = { get cssRules() { throw new Error('SecurityError') } }
    expect(collectGameArt([bad, sheet(rule('.wl', `x { a: url("${U1}") }`))])).toEqual([U1])
  })
  it('грузит и декодирует по одной с паузой и только один раз', async () => {
    const made = [], waits = []
    const make = () => { const im = { decode: async () => {}, set src(v) { this.u = v } }; made.push(im); return im }
    const sheets = [sheet(rule('.wlTurn', `x { a: url("${U1}"); b: url("${U2}") }`))]
    expect(await warmGameArt({ sheets, make, wait: async ms => { waits.push(ms) }, idle: async () => {}, gap: 7 })).toBe(2)
    expect(made.map(m => m.u)).toEqual([U1, U2])
    expect(waits).toEqual([START_DELAY_MS, 7, 7])
    expect(await warmGameArt({ sheets, make })).toBe(0)
  })
  it('картинка, которая не декодировалась, не ломает прогрев', async () => {
    const make = () => ({ decode: async () => { throw new Error('bad') }, set src(v) { this.u = v } })
    expect(await warmGameArt({ sheets: [sheet(rule('.wl', `x { a: url("${U1}") }`))], make, wait: async () => {}, idle: async () => {} })).toBe(0)
  })
  it('таблицы читаются порциями: пауза после каждых CHUNK правил, результат тот же', async () => {
    const filler = Array.from({ length: CHUNK * 2 + 10 }, () => rule('.shell-nav', 'x { color: red; }'))
    const sheets = [sheet(...filler, rule('.wlTurn', `x { a: url("${U1}") }`), { cssRules: [rule('.wl', `x { a: url("${U2}") }`)] })]
    let pauses = 0
    expect(await collectGameArtSoft(sheets, async () => { pauses++ })).toEqual([U1, U2])
    expect(pauses).toBeGreaterThanOrEqual(2)
    expect(collectGameArt(sheets)).toEqual([U1, U2])
  })
})
