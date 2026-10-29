import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createPool, POOL } from './wordLanePool.js'
import { ENTER_Y, EXIT_Y } from './wordLaneTimeline.js'
import { FLIGHT_MS } from './wordLaneMotion.js'
import { riseFrames, startRise, flightY, RISE_DELAY_MS, RISE_MS, RISE_END_Y, RISE_WAVE_PX, RISE_SCALE, RISE_FADE_FROM, risePosition } from './wordLaneRise.js'

// Взлёт заполненной пилюли ученика (wordLaneRise.js, pool.rise): кадры анимации, пауза и длительность, возврат в пул после finish, движок
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
afterEach(() => { vi.restoreAllMocks() })

function fakeStyle() { const props = {}; return { props, setProperty(k, v) { props[k] = v } } }
function fakeEl(parts = {}, extra = {}) {
  const attrs = new Map()
  return { style: fakeStyle(), dataset: {}, parts, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) ?? null, has: k => attrs.has(k), animate: () => ({ currentTime: 0, cancel: vi.fn() }), querySelector: sel => parts[sel] ?? null, querySelectorAll: () => [], ...extra }
}
function rig({ classes = [] } = {}) {
  let t = 5000
  vi.spyOn(performance, 'now').mockImplementation(() => t)
  const pills = Array.from({ length: POOL }, () => {
    const line = fakeEl()
    const pill = fakeEl({ '.wlPillFill': fakeEl(), '.wlPillClip': fakeEl({}, { offsetHeight: 154 }), '.wlPillLine': line, '.wlGhost': fakeEl(), '.wlPace': fakeEl() })
    pill.animate = vi.fn(() => ({ currentTime: 0, cancel: vi.fn(), finished: new Promise(() => {}) }))
    return pill
  })
  const root = { querySelectorAll: sel => (sel === '[data-pill]' ? pills : []), classList: { contains: c => classes.includes(c) } }
  return { pool: createPool(root), pills, advance: ms => { t += ms } }
}

describe('взлёт заполненной пилюли', () => {
  it('кадры: translate с синусоидой ±8 px в 1,5 периода, y линейно к RISE_END_Y, scale → 0,55 и opacity 1 → 0 на последних 30 %; начальные scale и opacity не пишутся', () => {
    const f = riseFrames(50)
    expect(f[0]).toEqual({ offset: 0, translate: risePosition(50, 0) })
    expect(f.at(-1)).toMatchObject({ offset: 1, scale: RISE_SCALE, opacity: 0 })
    expect(f.at(-1).translate).toBe(risePosition(RISE_END_Y, 0))
    const fade = f.find(x => x.offset === RISE_FADE_FROM)
    expect(fade.opacity).toBe(1)
    expect(RISE_FADE_FROM).toBe(0.7)
    expect(f.every(x => /^calc\(-50% \+ -?[\d.]+px\) calc\(-?[\d.]+dvh - 50%\)$/.test(x.translate))).toBe(true)
    const xs = f.map(x => Number(x.translate.match(/\+ (-?[\d.]+)px/)[1]))
    expect(Math.max(...xs)).toBeCloseTo(RISE_WAVE_PX, 0)
    expect(Math.min(...xs)).toBeCloseTo(-RISE_WAVE_PX, 0)
    const sig = xs.filter(x => Math.abs(x) > 0.5)
    const crossings = sig.slice(1).filter((x, i) => Math.sign(x) !== Math.sign(sig[i])).length
    expect(crossings).toBe(2)                                                        // 0 → + → 0 → − → 0 → + → 0: три полуволны, два перехода через нуль внутри пути
    const ys = f.map(x => Number(x.translate.match(/calc\((-?[\d.]+)dvh/)[1]))
    expect(ys.every((y, i) => i === 0 || y < ys[i - 1])).toBe(true)                  // только вверх
  })
  it('одна анимация: пауза RISE_DELAY_MS = 180, RISE_MS = 750, ускорение, fill both', () => {
    const el = fakeEl()
    el.animate = vi.fn(() => ({}))
    startRise(el, 40)
    const [, opts] = el.animate.mock.calls[0]
    expect(opts).toMatchObject({ duration: RISE_MS, delay: RISE_DELAY_MS, fill: 'both' })
    expect([RISE_MS, RISE_DELAY_MS]).toEqual([750, 180])
    expect(opts.easing).toMatch(/cubic-bezier/)                                      // ease-in: медленнее в начале, быстрее в конце
  })
  it('flightY: положение по часам полёта вниз', () => {
    expect(flightY({ currentTime: 0 })).toBe(ENTER_Y)
    expect(flightY({ currentTime: -500 })).toBe(ENTER_Y)
    expect(flightY({ currentTime: FLIGHT_MS / 2 })).toBeCloseTo((ENTER_Y + EXIT_Y) / 2, 6)
    expect(flightY({ currentTime: FLIGHT_MS * 3 })).toBe(EXIT_Y)
  })
  it('pool.rise: полёт вниз снят, взлёт запущен, data-rise; give — только когда взлёт закончился; нет второго взлёта', async () => {
    const { pool, pills } = rig()
    let done
    const riseAnim = { cancel: vi.fn(), finished: new Promise(r => { done = r }) }
    const k = pool.take(2)
    const own = pool.anims()[0]
    own.currentTime = FLIGHT_MS / 2
    pills[k].animate = vi.fn(() => riseAnim)
    const a = pool.rise(k)
    expect(a).toBe(riseAnim)
    expect(own.cancel).toHaveBeenCalledTimes(1)
    expect(pool.anims()).toHaveLength(0)                                             // полёта нет, а пилюля жива
    expect(pills[k].has('data-rise')).toBe(true)
    expect(pills[k].has('data-held')).toBe(true)
    expect(pool.rise(k)).toBeNull()
    expect(pills[k].parts['.wlPillLine'].style.props['--fill']).toBe('1.000')
    await Promise.resolve()
    expect(pills[k].has('data-held')).toBe(true)                                      // ещё летит
    done()
    await new Promise(r => setTimeout(r, 0))
    expect(pills[k].has('data-held')).toBe(false)                                     // finish → give
    expect(pills[k].has('data-rise')).toBe(false)
    const k2 = pool.take(1, { flight: false })
    expect(k2).toBe(k)                                                               // вернулась в пул и выдаётся снова
  })
  it('взлетать нечему без полёта; снятая раньше анимация (смена сцены) пилюлю повторно не возвращает', async () => {
    const { pool } = rig()
    const k = pool.take(0, { flight: false })
    expect(pool.rise(k)).toBeNull()
    expect(pool.rise(99)).toBeNull()
  })
  it('движок: после win пилюля отпускается из рук (held.delete) и не мешает конвейеру; у диктора взлёта нет', () => {
    const eng = read('./useWordLanePills.js')
    expect(eng).toContain('if (k != null && pool.rise(k)) held.delete(e.pill.id)')
    const dictor = eng.slice(eng.indexOf("kind === 'dictor'"), eng.indexOf("kind === 'student'"))
    expect(dictor).not.toContain('rise(')
    const student = read('./wordLaneStudent.js')
    expect(student).toContain("r.state === 'fly' || r.state === 'lock'")              // спавн ждёт только живой повтор: взлетающие пилюли (повтор уже won) его не держат
  })
})
