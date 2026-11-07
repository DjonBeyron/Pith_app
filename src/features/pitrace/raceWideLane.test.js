import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPool, POOL, fillTransform } from '../player/modules/rotate-phone/wordLanePool.js'
import { WIDE_W, WIDE_H, PILL_W, PILL_H, LANE_X } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { FLIGHT_MS } from '../player/modules/rotate-phone/wordLaneMotion.js'
import { laneTape } from '../player/modules/rotate-phone/wordLaneTape.js'
import { createLaneFlash } from '../player/modules/rotate-phone/wordLaneLaneFlash.js'

vi.mock('../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))

// Широкая лента этапа «Фразы»: пилюли пула wide (по центру, 90 % × две строки) — та же капсула, что у обычной, но заливка слева направо (translateX), скорость и положение по часам полёта; CSS ленты, пилюли и подписи
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '')
function fakeEl(parts = {}) {
  const attrs = new Map(), anims = []
  return {
    style: { setProperty(k, v) { this[k] = v } }, dataset: {}, parts, anims,
    setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) ?? null, hasAttribute: k => attrs.has(k),
    animate: (frames, o) => { const a = { frames, o, currentTime: 0, playbackRate: 1, cancel: vi.fn(), updatePlaybackRate(r) { a.playbackRate = r }, finished: new Promise(() => {}) }; anims.push(a); return a },
    querySelector: sel => parts[sel] ?? null, querySelectorAll: () => [],
  }
}
const rig = () => { const pills = Array.from({ length: POOL }, () => fakeEl({ '.wlPillFill': fakeEl(), '.wlGhost': fakeEl(), '.wlPace': fakeEl() })); return { pills, pool: createPool({ querySelectorAll: sel => (sel === '[data-pill]' ? pills : []) }) } }

describe('широкая пилюля в пуле', () => {
  it('wide: по центру, ширина WIDE_W, высота WIDE_H, data-wide, без сегментов; data-spent снимается при возврате; обычная пилюля после неё — снова узкая на своей дорожке', () => {
    const { pool, pills } = rig()
    const k = pool.take(1, { wide: true, cap: 'Nice to meet you', speed: 0.55 })
    const el = pills[k]
    expect(el.style.left).toBe('50%'); expect(el.style.width).toBe(`${WIDE_W}%`); expect(el.style.height).toBe(`${WIDE_H}%`)
    expect(el.getAttribute('data-wide')).toBe('1'); expect(el.getAttribute('data-segs')).toBeNull(); expect(el.style['--segs']).toBeUndefined()
    expect(el.getAttribute('data-cap')).toBe('Nice to meet you')
    pool.attr(k, 'data-spent')
    pool.give(k)
    expect(el.getAttribute('data-wide')).toBeNull(); expect(el.getAttribute('data-spent')).toBeNull()
    const n = pool.take(0, {})
    expect(pills[n].style.left).toBe(`${LANE_X[0]}%`); expect(pills[n].style.width).toBe(`${PILL_W}%`); expect(pills[n].style.height).toBe(`${PILL_H}%`)
    expect(WIDE_W).toBeGreaterThanOrEqual(72); expect(WIDE_W).toBeLessThanOrEqual(78) // поля по 11–14 % (замечание владельца: широкие пилюли «Фраз» слишком широкие)
  })
  it('заливка широкой — слева направо (paintFill → translateX), обычной — снизу вверх (translateY); положение по часам полёта (y), скорость — множитель к скорости выдачи (rate)', () => {
    const { pool, pills } = rig()
    const k = pool.take(1, { wide: true, speed: 0.5 })
    expect(pool.paintRow).toBeUndefined()
    const fillOf = n => pills[n].parts['.wlPillFill'].style.transform
    expect(fillOf(k)).toBe('translateX(-100.0%)')
    pool.paintFill(k, 0.5); expect(fillOf(k)).toBe(fillTransform(0.5, true))
    expect(fillTransform(0.5, true)).toBe('translateX(-50.0%)'); expect(fillTransform(1, true)).toBe('translateX(0.0%)')
    expect(fillTransform(0.5)).toBe('translateY(50.0%)')
    const n = pool.take(2, {})
    pool.paintFill(n, 0.25); expect(fillOf(n)).toBe('translateY(75.0%)')
    pool.give(k); const again = pool.take(0, {}); pool.paintFill(again, 0.5); expect(fillOf(again)).toBe('translateY(50.0%)') // вернулась в пул — ось снова вертикальная
    const w = pool.take(1, { wide: true, speed: 0.5 })
    const a = pills[w].anims.at(-1)
    a.currentTime = FLIGHT_MS / 2; expect(pool.y(w)).toBeCloseTo(52)
    pool.rate(w, 2); expect(a.playbackRate).toBe(1)
    pool.rate(w, 1); expect(a.playbackRate).toBe(0.5)
  })
})

describe('стили широкой ленты', () => {
  const css = strip(read('../../styles/player/modules/word-lane-wide.css'))
  it('подключены из race-sprint.css; без filter; переходы и анимации — только transform / translate / opacity', () => {
    expect(read('../../styles/player/modules/race-sprint.css')).toContain("@import './word-lane-wide.css'")
    expect(read('../../styles/player/modules/race-summary.css')).toContain("@import './race-phrases-weak.css'")
    for (const c of [css, strip(read('../../styles/player/modules/race-phrases-weak.css'))]) { expect(c).not.toMatch(/filter\s*:/); expect(c).not.toMatch(/animation\s*:/) }
    for (const t of css.match(/transition:[^;]+;/g)) for (const part of t.slice(11, -1).split(/,(?![^(]*\))/)) expect(['transform', 'translate', 'opacity', 'none']).toContain(part.trim().split(/\s+/)[0])
    expect(read('../../styles/player/modules/word-lane-wide.css').split('\n').length).toBeLessThanOrEqual(250)
  })
  it('акт фраз: крайние колонки съезжаются к средней и гаснут, разделители — к краям ленты; Пит «Пальцами» — по центру', () => {
    expect(css).toContain(".wl[data-race][data-tape] .wlLanes i:nth-child(1) { transform: translateX(100%); opacity: 0; }")
    expect(css).toContain(".wl[data-race][data-tape] .wlLanes i:nth-child(3) { transform: translateX(-100%); opacity: 0; }")
    expect(css).toMatch(/data-tape\] \.wlLaneEdge:nth-of-type\(1\) \{ transform: translateX\(-/)
    expect(css).not.toMatch(/data-act='phrases'\] \.wlLan/) // лента — по data-tape (держится на паузе), не по акту стадии
    expect(css).toMatch(/0\.6s/)
    expect(css).toMatch(/data-act='phrases'\] \.wlStage > \.wlCat\.scn:not\(\.wlCat--track\) \{ translate:/)
  })
  it('пилюля — та же капсула: скругление, рамка, тело и заливка не переопределены (только «выдох» кольца и подпись); текст в две строки, бледный (data-faded), подсветка верной (data-hot), отыгранная (data-spent)', () => {
    expect(css).toContain('font-size: clamp(14px, 4vw, 18px)')
    expect(css).toMatch(/\.wlPill\[data-wide\]\[data-faded\]:not\(\[data-lock\]\)::after \{ color: rgba/)
    expect(css).toMatch(/\.wlPill\[data-wide\]\[data-hot\]/)
    expect(css).not.toMatch(/border-radius/); expect(css).not.toMatch(/--segs/); expect(css).not.toMatch(/\.wlPillFill/); expect(css).not.toMatch(/\.wlPillSparks/); expect(css.replace(/[^{}]*data-spent[^{}]*\{[^}]*\}/g, '')).not.toMatch(/\.wlPillClip/) // клип заливки — только у отыгранной (тускнеет на непрозрачном теле)
    expect(css).toMatch(/\.wlPill\[data-wide\]\[data-ring\]::before \{ animation-name: wlExhaleWide; \}/)
    expect(css).not.toMatch(/\.wlPill\[data-wide\]\[data-spent\] \{[^}]*opacity/); expect(css).toMatch(/\[data-spent\] > \.wlPillClip[^{]*\{ opacity: 0\.45;/) // отыгранная бледнее, но тело непрозрачное: сквозь него не просвечивает узор дорожки
    expect(css).toMatch(/\.racePhraseRu\[data-on\] \{ opacity: 1; \}/)
  })
})

describe('лента на паузе и после «Продолжить»; вспышка на всю ленту', () => {
  const stages = [{ act: 'catch' }, { act: 'phrases', type: 'announce' }, { act: 'phrases', type: 'student' }]
  it('laneTape: акт фраз — лента; на паузе со стадии фраз лента держится (атрибут не меняется — нет переходной анимации при «Продолжить»)', () => {
    const f = (o) => ({ rh: { on: true }, stages, ...o })
    expect(laneTape(f({ stage: 'run', idx: 2, stageObj: stages[2] }))).toBe(true)
    expect(laneTape(f({ stage: 'run', idx: 1, stageObj: stages[1] }))).toBe(true)
    expect(laneTape(f({ stage: 'paused', from: 'run', idx: 2, stageObj: null }))).toBe(true)
    expect(laneTape(f({ stage: 'run', idx: 0, stageObj: stages[0] }))).toBe(false)
    expect(laneTape(f({ stage: 'paused', from: 'drop', idx: 2, stageObj: null }))).toBe(false)
    expect(laneTape({ ...f({ stage: 'run', idx: 2, stageObj: stages[2] }), rh: { on: false } })).toBe(false)
    expect(read('../player/modules/rotate-phone/WordLaneGame.jsx')).toContain("data-tape={laneTape(f) ? '' : undefined}")
  })
  function field(tape) {
    const mk = () => { const a = new Map(); return { a, setAttribute: (k, v) => a.set(k, v), removeAttribute: k => a.delete(k), getAttribute: k => a.get(k) ?? null } }
    const cols = [mk(), mk(), mk()], edges = [mk(), mk()]
    const lanes = { ...mk(), addEventListener: () => {}, querySelectorAll: sel => (sel === 'i' ? cols : sel === '.wlLaneEdge' ? edges : []) }
    const root = { querySelector: sel => (sel === '.wlLanes' ? lanes : null), classList: { contains: () => false }, closest: () => ({ hasAttribute: k => tape && k === 'data-tape' }) }
    return { root, cols, edges, lanes }
  }
  it('на ленте вспыхивает вся лента (data-win на .wlLanes) и обе её кромки, колонка — нет; без ленты — колонка, как раньше', () => {
    vi.useFakeTimers()
    const t = field(true); createLaneFlash(t.root).flash(1)
    expect(t.lanes.getAttribute('data-win')).toBe('a'); expect(t.cols.map(c => c.getAttribute('data-win'))).toEqual([null, null, null])
    expect(t.edges.map(c => c.getAttribute('data-win'))).toEqual(['a', 'a'])
    vi.advanceTimersByTime(800); expect(t.lanes.getAttribute('data-win')).toBeNull() // ушли из этапа посреди вспышки — атрибут не залипает
    const p = field(false); createLaneFlash(p.root).flash(1)
    expect(p.lanes.getAttribute('data-win')).toBeNull(); expect(p.cols[1].getAttribute('data-win')).toBe('a')
    vi.useRealTimers()
  })
  it('CSS: слой ленты ::before от края до края (5 … 95 %), цвет ленты (--lvl2), та же анимация только opacity', () => {
    const fl = strip(read('../../styles/player/modules/word-lane-lane-flash.css'))
    expect(fl).toMatch(/\.wl\[data-tape\] \.wlLanes\[data-win\]::before \{[^}]*left: 5%; right: 5%;[^}]*--lvl2-rgb/)
    expect(fl).toContain(".wl[data-tape] .wlLanes[data-win='a']::before { animation: wlLaneFlashA 0.6s ease-out 1 both; }")
    expect(fl).toContain(".wl[data-tape] .wlLanes[data-win='b']::before { animation: wlLaneFlashB 0.6s ease-out 1 both; }")
    expect(fl).not.toMatch(/filter/)
  })
})
