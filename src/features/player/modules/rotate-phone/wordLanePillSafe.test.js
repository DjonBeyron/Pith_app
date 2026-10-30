import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createPool, POOL, WILL_PILL } from './wordLanePool.js'
import { isPillSafe, PILL_SAFE_KEY } from './wordLanePillSafe.js'
import WordLanePills from './WordLanePills.jsx'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: vi.fn(() => false) }))

// «Безопасный» режим слоёв пилюль для iOS (word-lane-pill-safe.css), контур, который ничего не гасит, сверкающая линия уровня и взлёт заполненной пилюли
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '')
const pillCss = strip(read('../../../../styles/player/modules/word-lane-pill.css'))
const safeCss = strip(read('../../../../styles/player/modules/word-lane-pill-safe.css'))
const rules = css => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }))
const rulesOf = css => rules(css).filter(r => !r.sel.startsWith('from') && !r.sel.startsWith('to') && !/^\d/.test(r.sel))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('безопасный режим: ключ и класс', () => {
  it('ключ pithy_wl_pill_safe_v1 = 1 включает режим; без ключа и при недоступном localStorage — обычный', () => {
    expect(PILL_SAFE_KEY).toBe('pithy_wl_pill_safe_v1')
    vi.stubGlobal('localStorage', { getItem: k => (k === PILL_SAFE_KEY ? '1' : null) })
    expect(isPillSafe()).toBe(true)
    vi.stubGlobal('localStorage', { getItem: () => null })
    expect(isPillSafe()).toBe(false)
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') } })
    expect(isPillSafe()).toBe(false)
  })
  it('WordLanePills сама ставит wl--safe на .wlField по ключу и кладёт в пилюлю линию уровня', () => {
    const html = () => renderToStaticMarkup(createElement(WordLanePills, { scene: { kind: 'idle' }, levels: null, fx: {}, live: { seq: [], misses: 0 }, sceneApi: { current: null }, visible: true }))
    vi.stubGlobal('localStorage', { getItem: () => null })
    expect(html()).toContain('class="wlField"')
    vi.stubGlobal('localStorage', { getItem: () => '1' })
    const on = html()
    expect(on).toContain('class="wlField wl--safe"')
    expect(on.match(/class="wlPillLine"/g)).toHaveLength(POOL)
  })
})

describe('безопасный режим: вёрстка без слоёв', () => {
  const all = rulesOf(safeCss)
  it('ни одного will-change, кроме auto; единственный постоянный слой — translateZ(0) у взятой пилюли', () => {
    for (const r of all) for (const m of r.body.matchAll(/will-change:\s*([^;]+)/g)) expect(m[1].trim()).toBe('auto')
    expect(safeCss).toMatch(/\.wlField\.wl--safe \.wlPill\[data-held\] \{ transform: translateZ\(0\); \}/)
    expect(safeCss).toMatch(/\.wl\[data-phase='lanes'\] \.wlField\.wl--safe \.wlPill \{ will-change: auto; \}/) // прогрев слоёв обычного режима тоже снят
  })
  it('никаких visibility и filter; display — только у блока искр (не слой, а вёрстка) и у кольца-«выдоха»; частиц в заливке нет, плиток-фонов и орбит тоже', () => {
    expect(safeCss).not.toMatch(/visibility/)
    expect(all.filter(r => /filter:/.test(r.body)).every(r => /filter: none/.test(r.body))).toBe(true)
    expect(all.filter(r => /\bdisplay:/.test(r.body)).every(r => /\.wlPillSparks$|\.wlPill::before$/.test(r.sel))).toBe(true)
    expect(safeCss).not.toMatch(/--tile|--dust|wlSafeDust|wlSafeSpark|--orbit/)    // плитки частиц в заливке, фонового сдвига и орбит больше нет
    expect(safeCss).not.toMatch(/\.wlPillFill::(before|after)/)
    expect(safeCss).toContain('.wlField.wl--safe .wlPillSparks { display: none; }')
    expect(safeCss).toMatch(/\.wlField\.wl--safe:not\(\.wl--lite\) \.wlPill\[data-live\]:not\(\[data-fail\]\) \.wlPillSparks \{ display: block; \}/)
    expect(safeCss).toContain('.wlField.wl--safe .wlPill::before { display: none; }')   // «выдоха» кольца нет
  })
  it('контур дважды: border остаётся (обычное правило), поверх него outline на толщину обводки внутрь; inset-теней нет', () => {
    const pill = all.find(r => r.sel === '.wlField.wl--safe .wlPill').body
    expect(pill).toMatch(/outline: var\(--ring\) solid rgba\(var\(--rgb\), 0\.9\)/)
    expect(pill).toMatch(/outline-offset: calc\(var\(--ring\) \* -1\)/)
    expect(pill).not.toMatch(/inset 0 0/)
    expect(safeCss).not.toMatch(/box-shadow:[^;]*inset/)
    expect(pillCss).toMatch(/\.wlPill \{[^}]*border: var\(--ring\) solid/)
  })
  it('«не успел» и «различи» в безопасном режиме не гасят контур: opacity 1, серый цвет вместо прозрачности, свечение тенью, а не filter', () => {
    expect(safeCss).toMatch(/\.wlPill\[data-fail\] \{ opacity: 1; transition: none; --rgb: 123, 132, 148;/)
    expect(safeCss).toMatch(/\.wlPill\[data-voice\] \{ filter: none; transition: none; --glow:/)
  })
  it('состояния заливки: «в процессе», «принято», «не успел» — без частиц, специфичность выше обычных правил; кромка --edge остаётся', () => {
    expect(safeCss).toMatch(/:not\(\[data-lock\]\):not\(\[data-fail\]\) \.wlPillFill \{ background: var\(--edge\) 0 0 \/ 100% 14px no-repeat, rgba\(var\(--rgb\), 0\.35\); \}/)
    expect(safeCss).toMatch(/\[data-lock\]:not\(\[data-fail\]\) \.wlPillFill \{ background: var\(--edge\) 0 0 \/ 100% 14px no-repeat, var\(--c\); \}/)
    expect(safeCss).toContain('.wlField.wl--safe .wlPill[data-fail] .wlPillFill { background: #7b8494; }')
  })
  it('искры в безопасном режиме: те же узлы и анимации (transform / translate / opacity на композиторе — сдвиг фона красил бы два слоя на пилюлю каждый кадр), но без will-change', () => {
    expect(safeCss).toContain('.wlField.wl--safe .wlPill[data-held] .wlPillSparks i, .wlField.wl--safe .wlPill[data-held] .wlPillSparks b { will-change: auto; }')
    expect(safeCss).not.toMatch(/wlPillSparks[^{]*\{[^}]*animation|@keyframes wlSafeSpark|background-position-[xy]/)   // анимации и ключевые кадры — обычные (word-lane-pill.css), у безопасного свои — только блик линии
    expect(pillCss).toMatch(/\.wlPill\[data-held\] \.wlPillSparks b:first-child \{ will-change: transform, translate, opacity; animation: wlSparkA/) // обычные правила, которые безопасный режим переопределяет по will-change
  })
  it('файл подключён после обычных правил пилюль', () => {
    const idx = read('../../../../index.css')
    expect(idx.indexOf('word-lane-pill-safe.css')).toBeGreaterThan(idx.indexOf('word-lane-pill.css'))
  })
})

describe('контур не зависит от data-live / data-lock (оба режима)', () => {
  it('ни одно правило с data-live / data-lock не трогает opacity, visibility, display или filter САМОЙ пилюли; visibility — только у блока искр', () => {
    for (const css of [pillCss, safeCss]) {
      for (const r of rulesOf(css)) {
        if (!/data-live|data-lock/.test(r.sel)) continue
        const target = r.sel.split(',').map(s => s.trim()).filter(s => /data-live|data-lock/.test(s))
        const onPill = target.filter(s => /\.wlPill(\[[^\]]*\]|:not\([^)]*\))*$/.test(s))
        if (onPill.length) expect(r.body).not.toMatch(/\b(opacity|visibility|display|filter)\s*:/)
        if (/visibility/.test(r.body)) expect(target.every(s => /\.wlPillSparks$/.test(s))).toBe(true)
      }
    }
  })
  it('opacity у самой пилюли — только «не успел» (обычный режим, серая и бледная по замыслу) и невидимый прогрев слоёв', () => {
    const sel = rulesOf(pillCss).filter(r => /\bopacity:/.test(r.body) && /\.wlPill(?![A-Za-z])/.test(r.sel) && !/::|\.wlGhost|\.wlPace|\.wlPillFill|\.wlPillLine/.test(r.sel)).map(r => r.sel)
    expect(sel.every(s => /data-fail|data-phase='lanes'/.test(s))).toBe(true)
  })
  it('припаркованные посреди экрана пилюли (фаза lanes) невидимы: все 12 стопкой дают меньше уровня из 255 (обычный режим, слой не нулевой), в безопасном — opacity 0', () => {
    const body = rulesOf(pillCss).find(r => r.sel === ".wl[data-phase='lanes'] .wlPill").body
    const op = Number(/opacity:\s*([\d.]+)/.exec(body)[1])
    expect(op).toBeGreaterThan(0)                                   // opacity: 0 браузер не растеризует — прогрев слоёв потерял бы смысл
    expect(1 - (1 - op) ** 12).toBeLessThan(1 / 255)               // раньше 0,01 × 12 ≈ 11 % — на OLED пилюли были видны
    expect(body).toContain('will-change')
    expect(rulesOf(safeCss).find(r => r.sel === ".wl[data-phase='lanes'] .wlField.wl--safe .wlPill" && /opacity/.test(r.body)).body).toMatch(/opacity:\s*0\s*;/)
  })
  it('пул не гасит контур между take и give: ни одной записи opacity / visibility / display пилюле', () => {
    const pool = read('./wordLanePool.js').replace(/\/\/.*$/gm, '')
    expect(pool).not.toMatch(/put\(parts\[k\]\.el, '(opacity|visibility|display|filter)'/)   // тень слова и метка темпа (ghost, pace) — внутри клипа, не контур
    expect(pool).not.toMatch(/\.el\.style\.(opacity|visibility|display|filter)/)
  })
})

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

describe('пул: безопасный режим не ставит will-change; обычный — как раньше', () => {
  it('без wl--safe: слои пилюли и заливки до give', () => {
    const { pool, pills } = rig()
    const k = pool.take(0)
    expect(pills[k].style.willChange).toBe(WILL_PILL)
    expect(pills[k].parts['.wlPillFill'].style.willChange).toBe('transform')
    pool.give(k)
    expect(pills[k].style.willChange).toBe('')
  })
  it('с wl--safe: ни пилюле, ни заливке will-change не ставится, data-held и полёт на месте', () => {
    const { pool, pills } = rig({ classes: ['wl--safe'] })
    const k = pool.take(1)
    expect(pills[k].style.willChange).toBeUndefined()
    expect(pills[k].parts['.wlPillFill'].style.willChange).toBeUndefined()
    expect(pills[k].has('data-held')).toBe(true)
    expect(pills[k].animate).toHaveBeenCalledTimes(1)
  })
})

describe('сверкающая линия уровня', () => {
  const line = rulesOf(pillCss).find(r => r.sel === '.wlPillLine').body
  it('на самой пилюле: максимальная ширина 112 %, left -6 %, высота 2 px, положение по --fill и --pill-h и сжатие scaleX по --lw (ширина по ходу заливки), прозрачна при --fill = 0', () => {
    expect(line).toMatch(/left: -6%;/)
    expect(line).toMatch(/width: 112%;/)
    expect(line).toMatch(/height: 2px;/)
    expect(line).toMatch(/transform: translateY\(calc\(\(1 - var\(--fill, 0\)\) \* var\(--pill-h, 0px\)\)\) scaleX\(var\(--lw, 0\)\)/)
    expect(line).toMatch(/opacity: min\(1, calc\(var\(--fill, 0\) \* 40\)\)/)
    expect(pillCss).not.toMatch(/\.wlPillClip[^{]*\.wlPillLine/)                     // не внутри клипа заливки
  })
  it('концы сужаются к нулю: горизонтальный градиент transparent → цвет → белый → цвет → transparent и эллипс; ореол — отдельный слой бледнее и выше, без filter', () => {
    const core = rulesOf(pillCss).find(r => r.sel === '.wlPillLine::after').body
    expect(core).toMatch(/linear-gradient\(to right, transparent, rgba\(var\(--rgb\), 0\.9\) \d+%, #fff 50%, rgba\(var\(--rgb\), 0\.9\) \d+%, transparent\)/)
    expect(pillCss).toMatch(/\.wlPillLine::before, \.wlPillLine::after \{[^}]*border-radius: 50%/)
    const halo = rulesOf(pillCss).find(r => r.sel === '.wlPillLine::before').body
    expect(halo).toMatch(/top: -4px; bottom: -4px/)
    expect(halo).toMatch(/opacity: 0\.35/)
    expect(pillCss).not.toMatch(/\.wlPillLine[^{]*\{[^}]*filter/)
  })
  it('мерцание opacity .7 ↔ 1 за 1,1 с; «не успел» гасит линию', () => {
    expect(pillCss).toMatch(/\.wlPill\[data-held\] \.wlPillLine::after \{ animation: wlLineTwinkle 1\.1s ease-in-out infinite; \}/)
    expect(pillCss).toMatch(/@keyframes wlLineTwinkle \{ 0%, 100% \{ opacity: 0\.7; \} 50% \{ opacity: 1; \} \}/)
    expect(pillCss).toContain('.wlPill[data-fail] .wlPillLine { opacity: 0; }')
  })
  it('в безопасном режиме мерцание — бегущий блик (background-position), без opacity-анимации и слоя', () => {
    expect(safeCss).toMatch(/\.wlPillLine::after \{\s*animation: wlSafeGlint 1\.1s ease-in-out infinite alternate;/)
    expect(safeCss).toMatch(/@keyframes wlSafeGlint \{ from \{ background-position/)
    expect(safeCss).not.toMatch(/@keyframes wlSafeGlint[^}]*opacity/)
  })
  it('пул: --pill-h пишется один раз при взятии (один замер), --fill — при каждом изменении заливки, 0 при выдаче', () => {
    const { pool, pills } = rig()
    const k = pool.take(0, { flight: false })
    const clip = pills[k].parts['.wlPillClip']
    const line = pills[k].parts['.wlPillLine']
    expect(line.style.props['--pill-h']).toBe('154px')
    expect(line.style.props['--fill']).toBe('0.000')
    pool.paintFill(k, 0.3); pool.paintFill(k, 0.3); pool.paintFill(k, 0.64)
    expect(line.style.props['--fill']).toBe('0.640')
    pool.paintFill(k, 1.4)
    expect(line.style.props['--fill']).toBe('1.000')
    expect(line.style.props['--pill-h']).toBe('154px')
    clip.offsetHeight = 999                                                          // пересчёт высоты в кадрах не происходит
    pool.paintFill(k, 0.7)
    expect(line.style.props['--pill-h']).toBe('154px')
    pool.give(k)
    expect(line.style.props['--fill']).toBe('0.000')
  })
})
