import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPool, POOL } from '../player/modules/rotate-phone/wordLanePool.js'
import { WIDE_W, WIDE_H, PILL_W, PILL_H, LANE_X } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { FLIGHT_MS } from '../player/modules/rotate-phone/wordLaneMotion.js'

vi.mock('../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))

// Широкая лента этапа «Фразы»: пилюли пула wide (по центру, 90 % × две строки), заливка по горизонтали, скорость и положение по часам полёта; CSS ленты, пилюли и подписи
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
  it('wide: по центру, ширина WIDE_W, высота WIDE_H, data-wide, сегменты --segs; обычная пилюля после неё — снова узкая на своей дорожке', () => {
    const { pool, pills } = rig()
    const k = pool.take(1, { wide: true, segs: 4, cap: 'Nice to meet you', speed: 0.55 })
    const el = pills[k]
    expect(el.style.left).toBe('50%'); expect(el.style.width).toBe(`${WIDE_W}%`); expect(el.style.height).toBe(`${WIDE_H}%`)
    expect(el.getAttribute('data-wide')).toBe('1'); expect(el.getAttribute('data-segs')).toBe('4'); expect(el.style['--segs']).toBe('4')
    expect(el.getAttribute('data-cap')).toBe('Nice to meet you')
    pool.give(k)
    expect(el.getAttribute('data-wide')).toBeNull(); expect(el.getAttribute('data-segs')).toBeNull()
    const n = pool.take(0, {})
    expect(pills[n].style.left).toBe(`${LANE_X[0]}%`); expect(pills[n].style.width).toBe(`${PILL_W}%`); expect(pills[n].style.height).toBe(`${PILL_H}%`)
    expect(WIDE_W).toBeGreaterThanOrEqual(85); expect(WIDE_W).toBeLessThanOrEqual(92)
  })
  it('заливка по горизонтали (paintRow), положение по часам полёта (y), скорость — множитель к скорости выдачи (rate)', () => {
    const { pool, pills } = rig()
    const k = pool.take(1, { wide: true, segs: 4, speed: 0.5 })
    pool.paintRow(k, 0.5); expect(pills[k].parts['.wlPillFill'].style.transform).toBe('translateX(-50.0%)')
    pool.paintRow(k, 2); expect(pills[k].parts['.wlPillFill'].style.transform).toBe('translateX(0.0%)')
    const a = pills[k].anims[0]
    a.currentTime = FLIGHT_MS / 2; expect(pool.y(k)).toBeCloseTo(52)
    pool.rate(k, 2); expect(a.playbackRate).toBe(1)
    pool.rate(k, 1); expect(a.playbackRate).toBe(0.5)
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
    expect(css).toContain(".wl[data-race][data-act='phrases'] .wlLanes i:nth-child(1) { transform: translateX(100%); opacity: 0; }")
    expect(css).toContain(".wl[data-race][data-act='phrases'] .wlLanes i:nth-child(3) { transform: translateX(-100%); opacity: 0; }")
    expect(css).toMatch(/data-act='phrases'\] \.wlLaneEdge:nth-of-type\(1\) \{ transform: translateX\(-/)
    expect(css).toMatch(/0\.6s/)
    expect(css).toMatch(/data-act='phrases'\] \.wlStage > \.wlCat\.scn:not\(\.wlCat--track\) \{ translate:/)
  })
  it('пилюля: текст в две строки шрифтом clamp(14px, 4vw, 18px), бледный (data-faded), подсветка верной (data-hot), заливка слева направо, искр нет', () => {
    expect(css).toContain('font-size: clamp(14px, 4vw, 18px)')
    expect(css).toMatch(/\.wlPill\[data-wide\]\[data-faded\]:not\(\[data-lock\]\)::after \{ color: rgba/)
    expect(css).toMatch(/\.wlPill\[data-wide\]\[data-hot\]/)
    expect(css).toMatch(/\.wlPill\[data-wide\] \.wlPillSparks \{ display: none; \}/)
    expect(css).toMatch(/calc\(100% \/ var\(--segs, 1\)\)/)
    expect(css).toMatch(/\.racePhraseRu\[data-on\] \{ opacity: 1; \}/)
  })
})
