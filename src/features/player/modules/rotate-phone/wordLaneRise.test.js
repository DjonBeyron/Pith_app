import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createPool, POOL } from './wordLanePool.js'
import { ENTER_Y, EXIT_Y } from './wordLaneTimeline.js'
import { FLIGHT_MS } from './wordLaneMotion.js'
import { riseFrames, startRise, flightY, RISE_DELAY_MS, RISE_MS, RISE_END_Y, RISE_WAVE_PX, RISE_WAVES, RISE_SCALE, RISE_SHRINK_FROM, RISE_FADE_FROM, risePosition, riseScale } from './wordLaneRise.js'
import { sine } from './wordLaneWave.js'

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
    const sp = fakeEl()
    const pill = fakeEl({ '.wlPillFill': fakeEl(), '.wlPillClip': fakeEl({}, { offsetHeight: 154 }), '.wlPillSparks i': sp, '.wlGhost': fakeEl(), '.wlPace': fakeEl() })
    pill.animate = vi.fn(() => ({ currentTime: 0, cancel: vi.fn(), finished: new Promise(() => {}) }))
    return pill
  })
  const root = { querySelectorAll: sel => (sel === '[data-pill]' ? pills : []), classList: { contains: c => classes.includes(c) } }
  return { pool: createPool(root), pills, advance: ms => { t += ms } }
}

describe('взлёт заполненной пилюли', () => {
  it('кадры: translate с растянутой синусоидой ±12 px в 0,8 периода, rotate по касательной, y линейно к RISE_END_Y, scale → 0,1 (пилюля становится искрой) и opacity 1 → 0 на последних 25 %; начальные scale и opacity не пишутся', () => {
    const f = riseFrames(50)
    expect(f[0]).toEqual({ offset: 0, translate: risePosition(50, 0), rotate: '0.000deg' })
    expect(f.at(-1)).toMatchObject({ offset: 1, scale: RISE_SCALE, opacity: 0 })
    expect(f.at(-1).translate).toBe(risePosition(RISE_END_Y, sine(RISE_WAVE_PX, RISE_WAVES, 0, 1).x))
    expect(f.every(x => /^-?[\d.]+deg$/.test(x.rotate))).toBe(true)
    const fade = f.find(x => x.offset === RISE_FADE_FROM)
    expect(fade.opacity).toBe(1)
    expect(RISE_FADE_FROM).toBe(0.75)
    expect(RISE_SCALE).toBe(0.1)
    expect(f.every(x => /^calc\(-50% \+ -?[\d.]+px\) calc\(-?[\d.]+dvh - 50%\)$/.test(x.translate))).toBe(true)
    const xs = f.map(x => Number(x.translate.match(/\+ (-?[\d.]+)px/)[1]))
    expect(Math.max(...xs)).toBeCloseTo(RISE_WAVE_PX, 0)
    expect(Math.min(...xs)).toBeCloseTo(-RISE_WAVE_PX, 0)
    const sig = xs.filter(x => Math.abs(x) > 0.5)
    const crossings = sig.slice(1).filter((x, i) => Math.sign(x) !== Math.sign(sig[i])).length
    expect(crossings).toBe(1)                                                        // 0,8 периода: 0 → + → 0 → −: одна полная положительная полуволна и начало отрицательной, один переход через нуль внутри пути
    const ys = f.map(x => Number(x.translate.match(/calc\((-?[\d.]+)dvh/)[1]))
    expect(ys.every((y, i) => i === 0 || y < ys[i - 1])).toBe(true)                  // только вверх
  })
  it('взлёт стартует из прямого спуска: первый кадр — x = 0 и наклон 0 (без скачка), дальше волна растёт из нуля, наклон ведёт касательная', () => {
    const f = riseFrames(50)
    expect(f[0].translate).toBe(risePosition(50, 0))
    expect(f[0].rotate).toBe('0.000deg')
    const x1 = Number(f[1].translate.match(/\+ (-?[\d.]+)px/)[1])
    expect(Math.abs(x1)).toBeLessThan(2.5)                                           // следующая точка рядом: волна начинается с нуля, а не с рывка
    const degs = f.map(x => parseFloat(x.rotate))
    expect(Math.max(...degs.map(Math.abs))).toBeLessThanOrEqual(8 + 1e-9)            // наклон — несколько градусов, не больше TILT_MAX_DEG
    expect(Math.max(...degs.map(Math.abs))).toBeGreaterThan(3)                        // и заметен
    for (let i = 1; i < degs.length; i++) expect(Math.abs(degs[i] - degs[i - 1])).toBeLessThan(2.5) // плавно, без скачков угла
    expect(riseFrames(20)[0].translate).toBe(risePosition(20, 0))                    // с любой высоты: старт из реального y полёта
  })
  it('наклон оси — по касательной: у волны, идущей вправо (dx > 0), нижний конец пилюли смотрит по ходу вниз, верхний — по ходу вверх; у взлёта знак тот же при том же склоне dx/dy', () => {
    const up = riseFrames(50)
    const xs = up.map(f => Number(f.translate.match(/\+ (-?[\d.]+)px/)[1]))
    const degs = up.map(f => parseFloat(f.rotate))
    for (let i = 1; i < up.length - 1; i++) {                                         // ход вверх (dy < 0): вправо (dx > 0) → верх пилюли вправо → rotate по часовой (+)
      const dx = xs[i + 1] - xs[i - 1]
      if (Math.abs(dx) > 1) expect(Math.sign(degs[i])).toBe(Math.sign(dx))
    }
  })
  it('масштаб: отдельная кривая — до RISE_SHRINK_FROM остаётся 1, в первой половине пути сжатие небольшое, основное (больше 60 %) — во второй, монотонно до RISE_SCALE; кадр scale на каждой точке пути', () => {
    expect(RISE_SHRINK_FROM).toBe(0.15)
    expect(riseScale(0)).toBe(1)
    expect(riseScale(RISE_SHRINK_FROM)).toBe(1)
    expect(riseScale(1)).toBeCloseTo(RISE_SCALE, 10)
    const shrunkHalf = 1 - riseScale(0.5), shrunkAll = 1 - RISE_SCALE
    expect(shrunkHalf / shrunkAll).toBeLessThan(0.4)                                 // к середине пути сжалась меньше чем на 40 % всего сжатия, остальные 60 % — во второй половине
    for (let o = 0.26; o <= 1; o += 0.02) expect(riseScale(o)).toBeLessThanOrEqual(riseScale(o - 0.02) + 1e-12)
    const f = riseFrames(50)
    expect(f[0].scale).toBeUndefined()                                               // старт из-под анимации (хлопок щелчка не обрывается)
    const scaled = f.filter(x => x.scale != null)
    expect(scaled.length).toBe(f.length - 1)                                         // промежуточные кадры scale на каждой точке пути
    scaled.forEach(x => expect(x.scale).toBeCloseTo(riseScale(x.offset), 3))
    expect(f.find(x => x.offset === 0.5).scale).toBeGreaterThan(0.6)
    expect(f.find(x => x.offset === 0.75).scale).toBeLessThan(0.35)
    expect(f.at(-1).scale).toBe(RISE_SCALE)
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
    const first = pills[k].animate.mock.calls[0][0][0]
    expect(first.translate).toBe(risePosition((ENTER_Y + EXIT_Y) / 2, 0))   // взлёт стартует из y полёта вниз, x = 0 (спуск прямой)
    expect(first.rotate).toBe('0.000deg')
    expect(own.cancel).toHaveBeenCalledTimes(1)
    expect(pool.anims()).toHaveLength(0)                                             // полёта нет, а пилюля жива
    expect(pills[k].has('data-rise')).toBe(true)
    expect(pills[k].has('data-held')).toBe(true)
    expect(pool.rise(k)).toBeNull()
    expect(pills[k].parts['.wlPillSparks i'].style.props['--fill']).toBe('1.000')
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
