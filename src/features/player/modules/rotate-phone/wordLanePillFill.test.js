import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createPool, LIVE_HOLD_MS, LIVE_HOLD_LOCK_MS, POOL } from './wordLanePool.js'
import { RING_MIN_LVL } from './wordLaneMicLevel.js'
import { VOICE_THRESHOLD } from './wordLaneTimeline.js'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'
import WordLanePills from './WordLanePills.jsx'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: vi.fn(() => false) }))

// Заливка внутри контура пилюли, светящаяся кромка, частицы и тонкие кольца микрофона, которые молчат в тишине (word-lane-pill.css, word-lane-mic.css, wordLanePool.js).
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '')
const pillCss = () => strip(read('../../../../styles/player/modules/word-lane-pill.css'))
const micCss = () => strip(read('../../../../styles/player/modules/word-lane-mic.css'))
const block = (css, selector) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? ''

describe('контур пилюли: всегда виден, заливка строго внутри', () => {
  const css = pillCss()
  it('обводка — inset-тень пилюли, а заливка с неё отступает и контура не касается (раньше клип inset 0 закрашивал обводку)', () => {
    expect(block(css, '.wlPill')).toMatch(/box-shadow: inset 0 0 0 var\(--ring\)/)
    expect(css).not.toContain('.wlPill::before')                               // отдельного слоя-контура над заливкой нет: лишний композитный слой на пилюлю
    expect(css).toMatch(/\.wlPill\[data-lane='2'\] \{[^}]*--ring: 2\.5px/)
    expect(css).toMatch(/\.wlPill\[data-lane='1'\] \{ box-shadow: inset 0 0 0 var\(--ring\)/)
  })
  it('контейнер заливки отступает от контура и обрезает её капсулой', () => {
    const clip = block(css, '.wlPillClip')
    expect(clip).toMatch(/inset: calc\(var\(--ring\) \+ var\(--gap\)\)/)
    expect(clip).toMatch(/border-radius: 999px/)
    expect(clip).toMatch(/overflow: hidden/)
    expect(block(css, '.wlPillFill')).toMatch(/overflow: hidden/)             // и слой заливки держит свои кромку и частицы
  })
  it('на фазе «в процессе» контур не тускнеет: opacity нет ни на пилюле, ни на заливке; бледность — альфа в цвете заливки', () => {
    const opacityRules = [...css.matchAll(/([^{}]+)\{([^}]*\bopacity:[^}]*)\}/g)].map(m => m[1].trim())
    const onPill = opacityRules.filter(sel => /\.wlPill(?![A-Za-z])/.test(sel) && !/::before|::after|\.wlGhost|\.wlPace|\.wlPillFill/.test(sel))
    expect(onPill.every(sel => /data-fail|data-phase='lanes'/.test(sel))).toBe(true) // только «не успел» и невидимый прогрев слоёв
    expect(css).not.toMatch(/data-lock\]\):not\(\[data-fail\]\) \.wlPillFill \{[^}]*opacity/)
    expect(css).toMatch(/\.wlPill:not\(\[data-lock\]\):not\(\[data-fail\]\) \.wlPillFill \{ background: rgba\(var\(--rgb\), 0\.35\); \}/)
    expect(css).not.toMatch(/\.wlPillFill \{[^}]*opacity/)
  })
})

describe('светящаяся кромка заливки', () => {
  const css = pillCss()
  it('полоска 2 px цвета дорожки на верхнем краю заливки «в процессе», без box-shadow (градиент: растр один раз)', () => {
    expect(block(css, '.wlPillFill::after')).toMatch(/top: 0;[^}]*linear-gradient\(to bottom/)
    expect(css).toMatch(/:not\(\[data-lock\]\):not\(\[data-fail\]\) \.wlPillFill::after \{ background: linear-gradient\(to bottom, var\(--c\) 0 2px, rgba\(var\(--rgb\), 0\.5\) 2px, transparent\); \}/)
    expect([...css.matchAll(/\.wlPillFill[^{]*\{[^}]*box-shadow/g)]).toHaveLength(0)
  })
  it('«принято» — спокойная светлая кромка, «не успел» — кромки нет', () => {
    expect(block(css, '.wlPillFill::after')).toMatch(/rgba\(255, 255, 255, 0\.6\) 0 2px/)
    expect(css).toMatch(/\.wlPill\[data-fail\] \.wlPillFill::before, \.wlPill\[data-fail\] \.wlPillFill::after \{ display: none; \}/)
  })
})

describe('частицы в заливке: без узлов, только на композиторе, только пока наливается', () => {
  const css = pillCss()
  it('слой ::before с радиальными точками (плитка 14×22) и бесшовной анимацией на целое число плиток', () => {
    const b = block(css, '.wlPillFill::before')
    expect(b).toMatch(/radial-gradient\(circle at 50% 50%, rgba\(255, 255, 255, 0\.9\) 0 1\.2px, transparent 2px\)/)
    expect(b).toMatch(/background-size: 14px 22px, /)
    expect(b).not.toContain('animation')                                       // без data-live слой стоит и невидим (opacity 0)
    expect(b).toMatch(/opacity: 0;/)
    const shift = Number(css.match(/@keyframes wlRise \{ to \{ transform: translateY\(-(\d+)px\); \} \}/)[1])
    expect(b).toContain(`bottom: -${shift}px`)                                 // слой длиннее заливки ровно на сдвиг: нижний край не оголяется
    for (const h of (b.match(/background-size: ([^;]+);/)[1].match(/\d+px (\d+)px/g) ?? []).map(t => Number(t.split(' ')[1].replace('px', '')))) expect(shift % h).toBe(0) // сдвиг кратен высоте каждой плитки
  })
  it('частицы видны и летят только у data-live, не у data-fail; на слабом устройстве скрыты', () => {
    expect(css).toMatch(/\.wlPill\[data-live\]:not\(\[data-fail\]\) \.wlPillFill::before \{ opacity: 1; animation: wlRise [\d.]+s linear infinite; \}/)
    expect(css).toMatch(/\.wl--lite \.wlPillFill::before, \.weak-device \.wlPillFill::before \{ display: none; \}/)
    expect(css).toMatch(/\.wlPill\[data-fail\] \.wlPillFill::before/)
  })
  it('слабое устройство: WordLanePills ставит wl--lite на свой корень, обычное — нет', () => {
    const html = () => renderToStaticMarkup(createElement(WordLanePills, { scene: { kind: 'idle' }, levels: null, fx: {}, live: { seq: [], misses: 0 }, sceneApi: { current: null }, visible: true }))
    expect(html()).not.toContain('wl--lite')
    isWeakDevice.mockReturnValueOnce(true)
    expect(html()).toContain('class="wlField wl--lite"')
  })
})

// Пул на поддельном DOM: у элемента есть style, атрибуты и animate; время — подменённое performance.now
function fakeEl(parts = {}) {
  const attrs = new Map()
  return {
    style: {}, dataset: {}, parts,
    setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) ?? null,
    animate: () => ({ currentTime: 0, cancel: vi.fn() }),
    querySelector: sel => parts[sel] ?? null, querySelectorAll: () => [],
  }
}
function rig() {
  let t = 5000
  vi.spyOn(performance, 'now').mockImplementation(() => t)
  const pills = Array.from({ length: POOL }, () => fakeEl({ '.wlPillFill': fakeEl(), '.wlGhost': fakeEl(), '.wlPace': fakeEl() }))
  const pool = createPool({ querySelectorAll: sel => (sel === '[data-pill]' ? pills : []) })
  return { pool, pills, advance: ms => { t += ms } }
}
afterEach(() => vi.restoreAllMocks())

describe('data-live: пилюля «наливается» (пул пишет в paintFill)', () => {
  it('рост заливки → data-live; перестала расти → гаснет через LIVE_HOLD_MS; пустая заливка — не наливается', () => {
    const { pool, pills, advance } = rig()
    const k = pool.take(0, { flight: false })
    pool.paintFill(k, 0)
    expect(pills[k].getAttribute('data-live')).toBeNull()
    advance(16); pool.paintFill(k, 0.1)
    expect(pills[k].getAttribute('data-live')).toBe('1')
    advance(LIVE_HOLD_MS - 20); pool.paintFill(k, 0.1)
    expect(pills[k].getAttribute('data-live')).toBe('1')                       // пауза в росте короче выдержки — частицы не мигают
    advance(40); pool.paintFill(k, 0.1)
    expect(pills[k].getAttribute('data-live')).toBeNull()
  })
  it('спад заливки — не «наливается»', () => {
    const { pool, pills, advance } = rig()
    const k = pool.take(1, { flight: false })
    advance(16); pool.paintFill(k, 0.5)
    advance(LIVE_HOLD_MS + 10); pool.paintFill(k, 0.45)
    expect(pills[k].getAttribute('data-live')).toBeNull()
  })
  it('после принятия (data-lock) частицы идут ещё LIVE_HOLD_LOCK_MS (1,2 с) и гаснут', () => {
    const { pool, pills, advance } = rig()
    const k = pool.take(2, { flight: false })
    advance(16); pool.paintFill(k, 0.9)
    pool.attr(k, 'data-lock')
    advance(16); pool.paintFill(k, 1)                                          // доливается до конца — последний рост
    advance(LIVE_HOLD_LOCK_MS - 40); pool.paintFill(k, 1)
    expect(pills[k].getAttribute('data-live')).toBe('1')
    expect(LIVE_HOLD_LOCK_MS).toBe(1200)
    advance(60); pool.paintFill(k, 1)
    expect(pills[k].getAttribute('data-live')).toBeNull()
  })
  it('give и повторная выдача сбрасывают признак; DOM пишется только при смене', () => {
    const { pool, pills, advance } = rig()
    const k = pool.take(0, { flight: false })
    advance(16); pool.paintFill(k, 0.3)
    const set = vi.spyOn(pills[k], 'setAttribute')
    advance(16); pool.paintFill(k, 0.35); advance(16); pool.paintFill(k, 0.4)
    expect(set).not.toHaveBeenCalled()                                         // уже горит — ни одной лишней записи
    pool.give(k)
    expect(pills[k].getAttribute('data-live')).toBeNull()
    const k2 = pool.take(0, { flight: false })
    expect(pills[k2].getAttribute('data-live')).toBeNull()
  })
})

describe('кольца микрофона: тонкие, тусклые и молчат без голоса', () => {
  const css = micCss()
  it('порог --ring-min в CSS = RING_MIN_LVL в JS и выше VOICE_THRESHOLD', () => {
    expect(Number(css.match(/--ring-min: ([\d.]+);/)[1])).toBe(RING_MIN_LVL)
    expect(RING_MIN_LVL).toBe(0.08)
    expect(RING_MIN_LVL).toBeGreaterThan(VOICE_THRESHOLD)
  })
  it('линии 1 px (внутреннее 1,5 px), масштаб как раньше', () => {
    expect(block(css, '.wlMicRings i')).toMatch(/border: 1px solid var\(--wl-accent\)/)
    expect(css).toMatch(/\.wlMicRings i:nth-child\(1\) \{ border-width: 1\.5px; \}/)
    expect(css).toContain('.wlMic--listening .wlMicRings i { transform: scale(calc(1 + var(--lvl, 0) * 0.8));')
    expect(css).toContain('.wlMic--listening .wlMicRings i:nth-child(2) { transform: scale(calc(1 + var(--lvl, 0) * 1.1));')
  })
  it('пики прозрачности .22 / .16 / .11, ниже порога — ноль (нет «фонового» уровня, как было 0.12)', () => {
    const gate = 'clamp(0, (var(--lvl, 0) - var(--ring-min)) * var(--ring-gain), 1)'
    expect(css).toContain(`.wlMic--listening .wlMicRings i { transform: scale(calc(1 + var(--lvl, 0) * 0.8)); opacity: calc(${gate} * 0.22); }`)
    expect(css).toContain(`i:nth-child(2) { transform: scale(calc(1 + var(--lvl, 0) * 1.1)); opacity: calc(${gate} * 0.16); }`)
    expect(css).toContain(`i:nth-child(3) { transform: scale(calc(1 + var(--lvl, 0) * 1.4)); opacity: calc(${gate} * 0.11); }`)
    expect(css).not.toMatch(/opacity: calc\(0\.12/)
    expect(block(css, '.wlMicRings i')).toMatch(/opacity: 0;/)
  })
  it('manual / starting: «дыхание» остаётся, но тусклое (пик не выше .2); кнопка и свечение — как раньше', () => {
    expect(css).toMatch(/\.wlMic--manual \.wlMicRings i, \.wlMic--starting \.wlMicRings i \{ animation: wlBreath/)
    const peak = Number(css.match(/@keyframes wlBreath[\s\S]*?35%\s*\{ opacity: ([\d.]+); \}/)[1])
    expect(peak).toBeLessThanOrEqual(0.2)
    expect(css).toContain('.wlMic--listening .wlMicBtn::after { opacity: calc(var(--lvl, 0) * 0.8); }')
  })
})
