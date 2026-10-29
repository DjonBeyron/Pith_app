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

// Контур пилюли (border), заливка внутри него, светящаяся кромка, частицы в два слоя и тонкие кольца микрофона, которые молчат в тишине (word-lane-pill.css, word-lane-mic.css, wordLanePool.js).
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '')
const pillCss = () => strip(read('../../../../styles/player/modules/word-lane-pill.css'))
const micCss = () => strip(read('../../../../styles/player/modules/word-lane-mic.css'))
const block = (css, selector) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? ''

describe('контур пилюли: настоящий border, не inset-тень; заливка строго внутри', () => {
  const css = pillCss()
  it('обводка — border самой пилюли (на iOS inset-тень на слое с will-change мигала); inset-теней-обводок нет, остался только мягкий внутренний свет', () => {
    const pill = block(css, '.wlPill')
    expect(pill).toMatch(/border: var\(--ring\) solid rgba\(var\(--rgb\), 0\.9\)/)
    expect(pill).toMatch(/box-shadow: inset 0 0 18px -6px/)                    // свет с размытием, а не кольцо
    expect(css).not.toMatch(/inset 0 0 0 var\(--ring\)/)                       // кольца-тени нет нигде
    expect(css).not.toContain('.wlPill::before')                               // отдельного слоя-контура над заливкой нет: лишний композитный слой на пилюлю
    expect(css).toMatch(/\.wlPill\[data-lane='2'\] \{[^}]*--ring: 2\.5px/)
  })
  it('внешние орбиты дорожек 2 и 3 — обычные (не inset) кольца-тени; border у них чуть ярче', () => {
    for (const [lane, rings] of [['1', 1], ['2', 2]]) {
      const b = css.match(new RegExp(`\\.wlPill\\[data-lane='${lane}'\\] \\{ border-color: rgba\\(var\\(--rgb\\), 0\\.95\\); box-shadow: ([^;]+); \\}`))?.[1] ?? ''
      expect(b).not.toBe('')
      const outer = b.split(/,\s(?=inset|0 0 0)/).filter(s => !s.startsWith('inset'))
      expect(outer).toHaveLength(rings * 2)                                    // зазор фоном + кольцо на каждую орбиту
      expect(outer.every(s => /^0 0 0 [\d.]+px /.test(s))).toBe(true)
    }
  })
  it('контейнер заливки отступает на --gap от внутреннего края border (absolute считается от padding-box) и обрезает её капсулой', () => {
    const clip = block(css, '.wlPillClip')
    expect(clip).toMatch(/inset: var\(--gap\);/)
    expect(clip).not.toContain('--ring')                                       // толщину обводки в отступ не добавляем: border уже вне padding-box
    expect(clip).toMatch(/border-radius: 999px/)
    expect(clip).toMatch(/overflow: hidden/)
    expect(block(css, '.wlPillFill')).toMatch(/overflow: hidden/)             // и слой заливки держит свои частицы
    expect(css).toMatch(/\.wlPill\[data-hint\]::after \{[^}]*inset: calc\(-8px - var\(--ring\)\)/) // кольца-подсказки отсчитываются от padding-box
  })
  it('вспышка-кольцо щелчка тоже учитывает border пилюли', () => {
    expect(read('./wordLaneSnap.js')).toContain('inset:calc(-2px - var(--ring))')
  })
  it('на фазе «в процессе» контур не тускнеет: opacity нет ни на пилюле, ни на заливке; бледность — альфа в цвете заливки', () => {
    const opacityRules = [...css.matchAll(/([^{}]+)\{([^}]*\bopacity:[^}]*)\}/g)].map(m => m[1].trim())
    const onPill = opacityRules.filter(sel => /\.wlPill(?![A-Za-z])/.test(sel) && !/::before|::after|\.wlGhost|\.wlPace|\.wlPillFill/.test(sel))
    expect(onPill.every(sel => /data-fail|data-phase='lanes'/.test(sel))).toBe(true) // только «не успел» и невидимый прогрев слоёв
    expect(css).not.toMatch(/data-lock\]\):not\(\[data-fail\]\) \.wlPillFill \{[^}]*opacity/)
    expect(css).toMatch(/\.wlPill:not\(\[data-lock\]\):not\(\[data-fail\]\) \.wlPillFill \{ --edge: [^;]+; background: var\(--edge\) 0 0 \/ 100% 14px no-repeat, rgba\(var\(--rgb\), 0\.35\); \}/)
    expect(css).not.toMatch(/\.wlPillFill \{[^}]*opacity/)
  })
})

describe('светящаяся кромка заливки — первый слой фона (оба псевдоэлемента отданы частицам)', () => {
  const css = pillCss()
  it('полоска 2 px: у заливки «в процессе» цвета дорожки, без box-shadow (градиент: растр один раз)', () => {
    expect(block(css, '.wlPillFill')).toMatch(/background: var\(--edge\) 0 0 \/ 100% 14px no-repeat, linear-gradient\(to top/)
    expect(css).toMatch(/:not\(\[data-lock\]\):not\(\[data-fail\]\) \.wlPillFill \{ --edge: linear-gradient\(to bottom, var\(--c\) 0 2px, rgba\(var\(--rgb\), 0\.5\) 2px, transparent\);/)
    expect([...css.matchAll(/\.wlPillFill[^{]*\{[^}]*box-shadow/g)]).toHaveLength(0)
  })
  it('«принято» — спокойная светлая кромка (та же --edge по умолчанию), «не успел» — фон сплошной серый, кромки нет', () => {
    expect(block(css, '.wlPillFill')).toMatch(/--edge: linear-gradient\(to bottom, rgba\(255, 255, 255, 0\.6\) 0 2px/)
    expect(css).toMatch(/\.wlPill\[data-lock\]:not\(\[data-fail\]\) \.wlPillFill \{ background: var\(--edge\) 0 0 \/ 100% 14px no-repeat, var\(--c\); \}/)
    expect(css).toContain('.wlPill[data-fail] .wlPillFill { background: #7b8494; }')
  })
})

describe('частицы в заливке: два слоя, без узлов, только на композиторе, слои постоянные', () => {
  const css = pillCss()
  const layer = which => block(css, `.wlPillFill::${which}`)
  const sizes = b => [...b.match(/background-size: ([^;]+);/)[1].matchAll(/(\d+)px (\d+)px/g)].map(m => [Number(m[1]), Number(m[2])])
  const keyShift = name => Number(css.match(new RegExp(`@keyframes ${name} \\{[^\\n]*translateY\\(-(\\d+)px\\)`))[1])
  it('дальний ::before и ближний ::after — разные скорости (4,5 с и 2,2 с), сдвиг слоя кратен высоте каждой плитки (бесшовно), слой длиннее заливки ровно на сдвиг', () => {
    const speed = which => Number(css.match(new RegExp(`data-held\\] \\.wlPillFill::${which} \\{[^}]*animation: wlRise\\w+ ([\\d.]+)s linear infinite paused`))[1])
    expect(speed('before')).toBe(4.5)
    expect(speed('after')).toBe(2.2)
    for (const [which, name] of [['before', 'wlRiseFar'], ['after', 'wlRiseNear']]) {
      const shift = keyShift(name)
      expect(layer(which)).toContain(`bottom: -${shift}px`)
      for (const [, h] of sizes(layer(which))) expect(shift % h).toBe(0)
    }
  })
  it('точки трёх размеров: 1 / 1,6 / 2,4 px (ближний ещё с роем из мелких в нижней трети плитки), у крупных мягкий ореол из градиента; свечения без filter/тени', () => {
    const near = layer('after'), far = layer('before')
    expect(near).toMatch(/rgba\(255, 255, 255, 0\.95\) 0 1\.2px, rgba\(var\(--rgb\), 0\.6\) 1\.9px, rgba\(var\(--rgb\), 0\.22\) 3\.2px, transparent 5px/) // крупная: ядро 1,2 + ореол до 5 px
    expect(near).toMatch(/0 0\.9px, rgba\(var\(--rgb\), 0\.5\) 1\.6px/)       // средняя
    expect(near).toMatch(/0 0\.6px, transparent 1\.2px/)                       // мелкая
    expect(far).toMatch(/0 0\.6px, transparent 1\.2px/)
    expect([...near.matchAll(/circle at \d+% (\d+)%/g)].map(m => Number(m[1])).filter(y => y >= 66)).toHaveLength(3) // рой: три точки в нижней трети плитки 132 px
    expect(sizes(near).filter(([, h]) => h === 132)).toHaveLength(3)
    expect(css).not.toMatch(/\.wlPillFill::(before|after)[^{]*\{[^}]*(filter|box-shadow)/)
  })
  it('цвет: белые точки и светлый тон дорожки (--rgb); мерцание — в той же анимации (opacity .6 ↔ 1), одна анимация на слой, только transform + opacity', () => {
    expect(layer('before')).toContain('rgba(var(--rgb)')
    expect(layer('after')).toContain('rgba(var(--rgb)')
    for (const name of ['wlRiseFar', 'wlRiseNear']) {
      const kf = css.match(new RegExp(`@keyframes ${name} \\{([^\\n]*)\\}`))[1]
      expect(kf).toMatch(/opacity: 0\.6/)
      expect(kf).toMatch(/opacity: 1;/)
      expect([...kf.matchAll(/([a-z-]+):/g)].map(m => m[1]).every(p => p === 'opacity' || p === 'transform')).toBe(true)
    }
    expect(css.match(/animation: wlRise/g)).toHaveLength(2)                    // по одной анимации на слой
  })
  it('слои постоянные: анимация и will-change стоят у любой взятой пилюли (data-held) на паузе; data-live лишь снимает паузу и задвигает слой (translate), display не трогает', () => {
    expect(css).toMatch(/\.wlPill\[data-held\] \.wlPillFill::before \{ will-change: transform, translate; animation: wlRiseFar [\d.]+s linear infinite paused; \}/)
    expect(css).toMatch(/\.wlPill\[data-held\] \.wlPillFill::after \{ will-change: transform, translate; animation: wlRiseNear [\d.]+s linear infinite paused; \}/)
    const base = block(css, '.wlPillFill::before, .wlPillFill::after')
    expect(base).toMatch(/translate: 0 100%/)                                   // без data-live — спрятан под нижним краем заливки (overflow hidden)
    expect(base).toMatch(/visibility: hidden/)                                 // спрятанный слой не рисуется (дешевле), но из дерева слоёв не уходит: его держат will-change и анимация
    expect(base).not.toMatch(/display|opacity/)
    const live = css.match(/\.wlPill\[data-live\]:not\(\[data-fail\]\) \.wlPillFill::before, \.wlPill\[data-live\]:not\(\[data-fail\]\) \.wlPillFill::after \{([^}]*)\}/)[1]
    expect(live).toMatch(/translate: 0 0; visibility: visible/)
    expect(live).toMatch(/animation-play-state: running/)
    expect(live).not.toMatch(/animation:|display|will-change/)
    expect(css).not.toMatch(/data-fail\] \.wlPillFill::(before|after) \{ display: none/) // у data-fail слои тоже не исчезают из дерева: частицы уходят translate'ом
  })
  it('на слабом устройстве частиц нет (оба слоя display: none)', () => {
    expect(css).toMatch(/\.wl--lite \.wlPillFill::before, \.wl--lite \.wlPillFill::after, \.weak-device \.wlPillFill::before, \.weak-device \.wlPillFill::after \{ display: none; \}/)
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
