import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createPool, POOL } from './wordLanePool.js'
import WordLanePills from './WordLanePills.jsx'
import { lineAt, TIP_PX, SOFT_PX } from './wordLaneLevel.js'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: vi.fn(() => false) }))

// Линия уровня на поверхности жидкости (слой .wlPillSparks вне клипа: кончики выходят за стенки пилюли, v3.3.186 — раньше здесь были искры-плитки), одноразовый «выдох» кольца при старте заливки, ровно одна обводка
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
    const pill = fakeEl({ '.wlPillFill': fakeEl(), '.wlPillClip': fakeEl({}, { offsetHeight: 154, offsetWidth: 78 }), '.wlPillSparks i': fakeEl(), '.wlPillSparks b': fakeEl(), '.wlPillInkIn': fakeEl(), '.wlGhost': fakeEl(), '.wlPace': fakeEl() })
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

describe('линия уровня: вне клипа заливки, на поверхности жидкости, кончики за стенками', () => {
  it('разметка: у каждой пилюли <span class="wlPillSparks"><i><b/></i></span> — соседний с клипом, а не внутри него; в слое заливки — окно тёмной подписи', () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    const html = renderToStaticMarkup(createElement(WordLanePills, { scene: { kind: 'idle' }, levels: null, fx: {}, live: { seq: [], misses: 0 }, sceneApi: { current: null }, visible: true }))
    vi.unstubAllGlobals()
    expect(html.match(/<span class="wlPillSparks"><i><b><\/b><\/i><\/span>/g)).toHaveLength(POOL)
    const clip = html.slice(html.indexOf('class="wlPillClip"'), html.indexOf('<span class="wlPillSparks">'))
    expect(clip).not.toContain('wlPillSparks')                                  // слой уровня после закрытия клипа, а не внутри
    expect(html).toContain('<span class="wlPace"></span></span><span class="wlPillSparks">') // клип (последний ребёнок — метка темпа) закрыт до слоя уровня
    expect(html.match(/<span class="wlPillFill"><span class="wlPillInk"><span class="wlPillInkIn"><\/span><\/span><\/span>/g)).toHaveLength(POOL)
    expect(html).not.toContain('wlBub')                                         // пузырей в разметке нет: набор кладёт пул, когда заливка растёт (wordLaneBubbles.js)
  })
  it('рамка — по клипу, без обрезки (кончики линии и вылетающие пузыри видны за контуром), над жидкостью; <i> — тот же блок, что слой заливки', () => {
    const o = block('.wlPillSparks')
    expect(o).toMatch(/inset: var\(--gap\);/)
    expect(o).not.toMatch(/overflow|border-radius|visibility|transition/)
    expect(o).toMatch(/z-index: 2;/)
    expect(block('.wlPillClip')).toMatch(/z-index: 1;/)                          // жидкость над светлой подписью пилюли; линия и пузыри — над жидкостью
    const i = block('.wlPillSparks i'), fill = block('.wlPillFill')
    expect(i).toMatch(/inset: calc\(var\(--wl-soft\) \* -1\) 0 0;/)
    expect(fill).toMatch(/inset: calc\(var\(--wl-soft\) \* -1\) 0 0;/)          // один блок — один transform (пул пишет его обоим)
    expect(i).toMatch(/transform: translateY\(100%\);/)
    expect(i).not.toMatch(/mask|transition|--fill|--pill-h/)
    expect(css).not.toMatch(/@property --fill|@property --pill-h|--ov:/)
    expect(css).toContain('.wlPill[data-held] .wlPillSparks i, .wlPill[data-held] .wlPillSparks b { will-change: transform; }')
  })
  it('линия <b>: на поверхности жидкости (--wl-surf от верха слоя), длиннее клипа на --wl-tip с каждой стороны — кончик выходит за стенку пилюли', () => {
    const b = block('.wlPillSparks b')
    expect(b).toMatch(/left: calc\(var\(--wl-tip\) \* -1\); right: calc\(var\(--wl-tip\) \* -1\);/)
    expect(b).toMatch(/top: calc\(var\(--wl-surf\) - 1\.5px\); height: 3px;/)   // центр линии — ровно на --wl-surf
    expect(b).toMatch(/opacity: 0;/)                                             // без заливки линии нет — opacity пишет пул
    const v = name => Number(css.match(new RegExp(`${name}: ([\\d.]+)px;`))[1])
    expect(css).toMatch(/--wl-surf: calc\(var\(--wl-soft\) \/ 2\);/)
    expect(v('--wl-tip')).toBe(TIP_PX)
    expect(v('--wl-tip') - v('--gap') - 2.5).toBeGreaterThanOrEqual(4)            // за внешний край пилюли (клип отступает на зазор и обводку, она не толще 2,5 px) — не меньше 4 px
    expect(v('--wl-soft')).toBe(SOFT_PX)
  })
  it('утончение и затухание: clip-path с острыми кончиками (0 50 % и 100 % 50 %), градиент к концам прозрачный; свет — ::after, ярче у наливающейся; без filter и box-shadow', () => {
    const line = block('.wlPillSparks b::before'), glow = block('.wlPillSparks b::after')
    expect(line).toMatch(/clip-path: polygon\(0 50%, 15px 0, calc\(100% - 15px\) 0, 100% 50%, calc\(100% - 15px\) 100%, 15px 100%\);/)
    expect(line).toContain('linear-gradient(to right, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.95) 22% 78%, rgba(255, 255, 255, 0))') // белое ядро: от прозрачного к прозрачному
    expect(line).toContain('linear-gradient(to right, rgba(var(--rgb), 0), var(--c) 9% 91%, rgba(var(--rgb), 0))')                     // цвет дорожки — так же
    expect(glow).toMatch(/radial-gradient\(closest-side, rgba\(var\(--rgb\), 0\.5\)/)
    expect(glow).toMatch(/opacity: 0\.45; transition: opacity 0\.3s ease-out;/)   // переход — только opacity
    expect(css).toContain('.wlPill[data-live] .wlPillSparks b::after { opacity: 1; }')
    expect(css).toContain('.wl--lite .wlPillSparks b::after, .weak-device .wlPillSparks b::after { display: none; }')
    expect(css).toContain('.wlPill[data-fail] .wlPillSparks { display: none; }')
    expect(css).not.toMatch(/\.wlPillSparks[^{]*\{[^}]*(filter|box-shadow)/)
    expect(css).not.toMatch(/wlSpark|wlSway|--spark-/)                           // искр-плиток больше нет
  })
  it('частиц в самой заливке нет: псевдоэлементов заливки в CSS нет', () => {
    expect(css).not.toMatch(/\.wlPillFill::(before|after)/)
    expect(css).not.toMatch(/wlRiseFar|wlRiseNear/)
  })
  it('пул: слою заливки и слою уровня — один и тот же transform; линии — scaleX по ширине поверхности (у торцов уже) и opacity; у полной пилюли и после выдачи линии нет', () => {
    const { pool, pills } = rig()
    const k = pool.take(0, { flight: false })
    const part = sel => pills[k].parts[sel].style
    pool.paintFill(k, 0.4); pool.paintFill(k, 0.4); pool.paintFill(k, 0.5)
    expect(part('.wlPillFill').transform).toBe('translateY(50.0%)')
    expect(part('.wlPillSparks i').transform).toBe(part('.wlPillFill').transform)
    expect(part('.wlPillSparks b').transform).toBe('scaleX(1)')                 // середина капсулы: поверхность во всю ширину
    expect(part('.wlPillSparks b').opacity).toBe('1')
    pool.paintFill(k, 0.08)
    const low = Number(/scaleX\(([\d.]+)\)/.exec(part('.wlPillSparks b').transform)[1])
    expect(low).toBeGreaterThan(0.4); expect(low).toBeLessThan(0.9)             // у дна поверхность уже — линия короче, кончики по-прежнему за стенкой
    expect(low).toBeCloseTo(lineAt(0.08, { w: 78, h: 154 }).scale, 3)
    pool.paintFill(k, 1)
    expect(part('.wlPillSparks b').opacity).toBe('0')                           // полная пилюля — без линии
    expect(pills[k].has('data-full')).toBe(true)
    pool.paintFill(k, 0.9)
    expect(pills[k].has('data-full')).toBe(false)
    pool.give(k)
    expect(part('.wlPillSparks b').opacity).toBe('0')
    expect(part('.wlPillSparks i').transform).toBe('translateY(100.0%)')
    const bare = createPool({ querySelectorAll: sel => (sel === '[data-pill]' ? [fakeEl({ '.wlPillFill': fakeEl(), '.wlGhost': fakeEl(), '.wlPace': fakeEl() })] : []), classList: { contains: () => false } })
    const k2 = bare.take(0, { flight: false })
    expect(() => bare.paintFill(k2, 0.5)).not.toThrow()                         // узлов уровня и подписи может не быть
  })
})
