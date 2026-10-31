import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createPool, POOL } from './wordLanePool.js'
import WordLanePills from './WordLanePills.jsx'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: vi.fn(() => false) }))

// Искры над заливкой (вне клипа, вылетают выше контура и гаснут), одноразовый «выдох» кольца при старте заливки, ровно одна обводка и ширина линии уровня по ходу заливки
// (word-lane-pill.css, word-lane-pill-safe.css, wordLanePool.js, WordLanePills.jsx). Безопасный режим — wordLanePillSafe.test.js.
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '')
const css = strip(read('../../../../styles/player/modules/word-lane-pill.css'))
const safeCss = strip(read('../../../../styles/player/modules/word-lane-pill-safe.css'))
const block = sel => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? ''
const kf = name => css.match(new RegExp(`@keyframes ${name} \\{([^\\n]*)\\}\\n`))[1]
afterEach(() => { vi.restoreAllMocks() })

function fakeStyle() { const props = {}; return { props, setProperty(k, v) { props[k] = v } } }
function fakeEl(parts = {}, extra = {}) {
  const attrs = new Map()
  return { style: fakeStyle(), dataset: {}, parts, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) ?? null, has: k => attrs.has(k), animate: () => ({ currentTime: 0, cancel: vi.fn() }), querySelector: sel => parts[sel] ?? null, querySelectorAll: () => [], ...extra }
}
function rig() {
  let t = 5000
  vi.spyOn(performance, 'now').mockImplementation(() => t)
  const pills = Array.from({ length: POOL }, () => {
    const pill = fakeEl({ '.wlPillFill': fakeEl(), '.wlPillClip': fakeEl({}, { offsetHeight: 154 }), '.wlPillSparks i': fakeEl(), '.wlGhost': fakeEl(), '.wlPace': fakeEl() })
    pill.animate = vi.fn(() => ({ currentTime: 0, cancel: vi.fn(), finished: new Promise(() => {}) }))
    return pill
  })
  const root = { querySelectorAll: sel => (sel === '[data-pill]' ? pills : []), classList: { contains: () => false } }
  return { pool: createPool(root), pills, advance: ms => { t += ms } }
}

describe('у пилюли ровно одна обводка', () => {
  it('ни одной внешней тени-орбиты (зазор фоном + кольцо) нигде — ни в обычном, ни в безопасном режиме; фиолетовая дорожка не исключение', () => {
    for (const c of [css, safeCss]) {
      expect(c).not.toMatch(/0 0 0 [\d.]+px var\(--wl-bg\)/)
      expect(c).not.toMatch(/box-shadow:[^;]*0 0 0 [\d.]+px rgba/)
      expect(c).not.toContain('--orbit')
    }
  })
})

describe('«выдох» кольца: один раз в начале заливки, потом гаснет', () => {
  it('кольцо — ::before самой пилюли (узлов не прибавляет), рамка по внешнему краю border, невидимо без анимации; одна анимация 0,75 с, один раз', () => {
    const ring = block('.wlPill::before')
    expect(ring).toMatch(/inset: calc\(var\(--ring\) \* -1\)/)
    expect(ring).toMatch(/border-radius: 999px/)
    expect(ring).toMatch(/opacity: 0;/)
    expect(ring).not.toMatch(/box-shadow/)
    expect(css).toContain(".wlPill[data-ring]::before { animation: wlExhale 0.75s ease-out 1; }")
    expect(css).not.toMatch(/data-ring\][^{]*\{[^}]*infinite/)
  })
  it('анимация — только opacity и scale (композитор): растёт с нуля (бесшовно из обводки) и гаснет к концу, наружу по ширине больше, чем по высоте (капсула расходится на примерно равный зазор)', () => {
    const k = kf('wlExhale')
    expect([...k.matchAll(/([a-z-]+):/g)].map(m => m[1]).every(p => p === 'opacity' || p === 'scale')).toBe(true)
    expect(k).toMatch(/0% \{ opacity: 0; scale: 1 1; \}/)                       // старт: невидимое кольцо ровно на обводке
    expect(k).toMatch(/100% \{ opacity: 0; scale: 1\.22 1\.11; \}/)             // конец: расползлось и погасло
    expect(css).toContain('.wlPill[data-held]::before { will-change: scale, opacity; }') // слой постоянный — запуск не пересобирает дерево слоёв
  })
  it('на слабом устройстве и в безопасном режиме колец нет', () => {
    expect(css).toContain('.wl--lite .wlPill::before, .weak-device .wlPill::before { display: none; }')
    expect(safeCss).toContain('.wlField.wl--safe .wlPill::before { display: none; }')
  })
  it('пул: data-ring ставится один раз за выдачу, когда data-live появился впервые; повторные вспышки заливки его не возвращают; take / give снимают', () => {
    const { pool, pills, advance } = rig()
    const k = pool.take(2, { flight: false })
    expect(pills[k].has('data-ring')).toBe(false)
    advance(16); pool.paintFill(k, 0.2)
    expect(pills[k].has('data-live')).toBe(true)
    expect(pills[k].has('data-ring')).toBe(true)
    advance(2000); pool.paintFill(k, 0.2)                                       // пауза: data-live погас
    expect(pills[k].has('data-live')).toBe(false)
    pills[k].removeAttribute('data-ring')                                       // (кольцо отыграло — для проверки «не вернётся» снимаем атрибут вручную)
    advance(16); pool.paintFill(k, 0.5)
    expect(pills[k].has('data-live')).toBe(true)
    expect(pills[k].has('data-ring')).toBe(false)                              // второй раз кольца нет
    pool.give(k)
    expect(pills[k].has('data-ring')).toBe(false)
    const k2 = pool.take(1, { flight: false })
    advance(16); pool.paintFill(k2, 0.1)
    expect(pills[k2].has('data-ring')).toBe(true)                               // новая выдача — новое кольцо
  })
})

describe('искры: вне клипа заливки, едут за уровнем, гаснут выше контура', () => {
  it('разметка: у каждой пилюли <span class="wlPillSparks"><i><b/><b/></i></span> — соседний с клипом, а не внутри него', () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    const html = renderToStaticMarkup(createElement(WordLanePills, { scene: { kind: 'idle' }, levels: null, fx: {}, live: { seq: [], misses: 0 }, sceneApi: { current: null }, visible: true }))
    vi.unstubAllGlobals()
    expect(html.match(/<span class="wlPillSparks"><i><b><\/b><b><\/b><\/i><\/span>/g)).toHaveLength(POOL)
    const clip = html.slice(html.indexOf('class="wlPillClip"'), html.indexOf('<span class="wlPillSparks">'))
    expect(clip).not.toContain('wlPillSparks')                                  // искры после закрытия клипа, а не внутри
    expect(html).toContain('<span class="wlPace"></span></span><span class="wlPillSparks">') // клип (последний ребёнок — метка темпа) закрыт до блока искр
  })
  it('внешний блок — неподвижная рамка с отступами клипа, выше клипа на --ov, скруглена снизу, обрезает по сторонам и снизу; спрятан без data-live', () => {
    const o = block('.wlPillSparks')
    expect(o).toMatch(/left: var\(--gap\); right: var\(--gap\);/)
    expect(o).toMatch(/top: calc\(var\(--gap\) - var\(--ov\)\);/)
    expect(o).toMatch(/bottom: var\(--gap\);/)
    expect(o).toMatch(/border-radius: 0 0 999px 999px;/)
    expect(o).toMatch(/overflow: hidden;/)
    expect(o).toMatch(/opacity: 0; visibility: hidden;/)
    expect(css).toMatch(/\.wlPill \{[^}]*--ov: 48px;/)
    expect(css).toMatch(/\.wlPill\[data-live\]:not\(\[data-fail\]\) \.wlPillSparks \{ opacity: 1; visibility: visible; transition: opacity 0\.25s ease-out, visibility 0s; \}/)
    expect(block('.wlPillFill')).not.toMatch(/overflow/)                        // заливка частиц не держит
  })
  it('внутренний <i> едет за уровнем (тот же сдвиг, что у линии, из --fill / --pill-h) и гасит искры маской от поверхности вверх на --ov', () => {
    const i = block('.wlPillSparks i')
    expect(i).toMatch(/transform: translateY\(calc\(\(1 - var\(--fill, 0\)\) \* var\(--pill-h, 0px\)\)\);/)
    expect(i).toMatch(/mask-image: linear-gradient\(to bottom, transparent, #000 var\(--ov\)\);/)
    expect(i).toMatch(/-webkit-mask-image: linear-gradient\(to bottom, transparent, #000 var\(--ov\)\);/)
    expect(css).toContain('.wlPill[data-held] .wlPillSparks i { will-change: transform; }')
  })
  it('два анимируемых слоя на пилюлю (::before и ::after <i>): разные периоды (3,1 и 4,7 с), подъём ровно на высоту плитки (бесшовно), слой длиннее на тот же сдвиг', () => {
    const before = block('.wlPillSparks b:first-child'), after = block('.wlPillSparks b:last-child')
    expect(css).toMatch(/\.wlPill\[data-held\] \.wlPillSparks b:first-child \{ will-change: transform, translate, opacity; animation: wlSparkA 3\.1s linear var\(--da\) infinite paused, wlSwayA 2\.3s ease-in-out var\(--sa\) infinite alternate paused; \}/)
    expect(css).toMatch(/\.wlPill\[data-held\] \.wlPillSparks b:last-child \{ will-change: transform, translate, opacity; animation: wlSparkB 4\.7s linear var\(--db\) infinite paused, wlSwayB 3\.7s ease-in-out var\(--sb\) infinite alternate paused; \}/)
    for (const [b, name, tile] of [[before, 'wlSparkA', 124], [after, 'wlSparkB', 141]]) {
      expect(b).toContain(`bottom: -${tile}px`)
      expect(b).toContain(`background-size: 100% ${tile}px`)
      expect(kf(name)).toContain(`transform: translateY(-${tile}px)`)
      for (const m of b.matchAll(/circle at \d+% (\d+)px/g)) expect(Number(m[1])).toBeLessThan(tile - 4) // точка целиком внутри плитки (не обрезается на стыке)
    }
    expect(css.match(/radial-gradient\(circle at/g).length).toBeGreaterThanOrEqual(12) // хаос: у каждой плитки по шесть-семь точек в разных местах
    expect(css.match(/animation: wlSpark/g)).toHaveLength(2)
  })
  it('хаос: разные x у точек, покачивание по x (translate) разными периодами, фаза по дорожкам, мерцание opacity .65 ↔ 1; без layout и filter', () => {
    const xs = [...block('.wlPillSparks b:first-child').matchAll(/circle at (\d+)%/g)].concat([...block('.wlPillSparks b:last-child').matchAll(/circle at (\d+)%/g)]).map(m => Number(m[1]))
    expect(new Set(xs).size).toBe(xs.length)                                    // ни одного совпадения по x
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(60)
    for (const name of ['wlSparkA', 'wlSparkB']) {
      const k = kf(name)
      expect(k).toMatch(/opacity: 0\.65/)
      expect([...k.matchAll(/([a-z-]+):/g)].map(m => m[1]).every(p => p === 'opacity' || p === 'transform')).toBe(true)
    }
    for (const name of ['wlSwayA', 'wlSwayB']) expect([...kf(name).matchAll(/([a-z-]+):/g)].map(m => m[1]).every(p => p === 'translate')).toBe(true)
    const phases = [0, 1, 2].map(l => css.match(new RegExp(`\\.wlPill\\[data-lane='${l}'\\] \\{ (--da: [^}]*)\\}`))[1])
    expect(new Set(phases).size).toBe(3)
    expect(css).not.toMatch(/\.wlPillSparks[^{]*\{[^}]*(filter|box-shadow)/)
    expect(css).not.toMatch(/@keyframes wlSpark[^\n]*(left|top|width|height|inset)/)
  })
  it('живые: data-live снимает паузу; слабое устройство — искр нет; data-fail — спрятаны', () => {
    expect(css).toMatch(/\.wlPill\[data-live\]:not\(\[data-fail\]\) \.wlPillSparks b:first-child, \.wlPill\[data-live\]:not\(\[data-fail\]\) \.wlPillSparks b:last-child \{ animation-play-state: running; \}/)
    expect(css).toContain('.wl--lite .wlPillSparks, .weak-device .wlPillSparks { display: none; }')
  })
  it('частиц в самой заливке больше нет (псевдоэлементов заливки в CSS нет)', () => {
    expect(css).not.toMatch(/\.wlPillFill::(before|after)/)
    expect(css).not.toMatch(/wlRiseFar|wlRiseNear/)
  })
  it('пул: <i> искр получает --pill-h (при взятии) и --fill (на каждом изменении заливки); 0 при выдаче; на слабом устройстве узла может не быть', () => {
    const { pool, pills } = rig()
    const k = pool.take(0, { flight: false })
    const sp = pills[k].parts['.wlPillSparks i']
    expect(sp.style.props['--pill-h']).toBe('154px')
    pool.paintFill(k, 0.4); pool.paintFill(k, 0.4); pool.paintFill(k, 0.75)
    expect(sp.style.props['--fill']).toBe('0.750')
    pool.give(k)
    expect(sp.style.props['--fill']).toBe('0.000')
    const bare = createPool({ querySelectorAll: sel => (sel === '[data-pill]' ? [fakeEl({ '.wlPillFill': fakeEl(), '.wlGhost': fakeEl(), '.wlPace': fakeEl() })] : []), classList: { contains: () => false } })
    const k2 = bare.take(0, { flight: false })
    expect(() => bare.paintFill(k2, 0.5)).not.toThrow()
  })
})
