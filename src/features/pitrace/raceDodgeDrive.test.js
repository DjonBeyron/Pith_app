import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createDodgeDrive, measureHead, planLine, PEEK_MS, DOWN_Y } from './raceDodgeDrive.js'
import { HEAD_TOP, leadOf, DIVE_DOWN_MS, DIVE_MS, JUMP_MS } from './raceDodge.js'

// Привод «Пит ныряет и уворачивается» на поддельной голове (в тестах нет DOM): класс слежения, --wl-dx / --wl-dy у головы (raceHeadDepth.js), data-dodge и их порядок, журнал «[dodge]», ожидание left(); CSS — только transform / translate / opacity
function fakeCat({ catX = '', up = true, lite = false } = {}) {
  const vars = {}
  const svg = { style: {} }
  const cls = new Set([...(up ? ['wlCat--up'] : []), ...(lite ? ['scn--lite'] : [])])
  const seen = []
  const dataset = new Proxy({}, { set: (o, k, v) => { o[k] = v; if (k === 'dodge') seen.push(v); return true } })
  const cat = {
    dataset, style: { getPropertyValue: () => catX, setProperty: (k, v) => { vars[k] = v } },
    classList: { add: c => cls.add(c), contains: c => cls.has(c) },
    querySelector: () => svg, parentElement: null, offsetWidth: 0, offsetHeight: 0,
  }
  return { cat, vars, cls, seen }
}
function clock() {
  let t = 0
  const timers = []
  return {
    now: () => t,
    setTimer: (fn, ms) => { const id = timers.length + 1; timers.push({ id, at: t + ms, fn }); return id },
    clearTimer: id => { const k = timers.findIndex(x => x.id === id); if (k >= 0) timers.splice(k, 1) },
    go(ms) { const end = t + ms; for (let x = timers.filter(y => y.at <= end).sort((a, b) => a.at - b.at)[0]; x; x = timers.filter(y => y.at <= end).sort((a, b) => a.at - b.at)[0]) { timers.splice(timers.indexOf(x), 1); t = Math.max(t, x.at); x.fn() } t = end }, // таймеры по порядку срабатывания, и те, что поставлены внутри
  }
}
const pill = (y, o = {}) => ({ id: 'a', rep: 0, lane: 0, y, speed: 1, state: 'fly', ...o })
const atJump = HEAD_TOP - leadOf(1) - 10 + 0.5
const make = (o = {}) => { const c = clock(), f = fakeCat(o), log = vi.fn(), peek = vi.fn(); const d = createDodgeDrive({ cat: f.cat, lanes: o.lanes ?? [0, 2, 2], log, peek, now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, quick: o.quick ?? false }); return { c, d, log, peek, ...f } }

describe('raceDodgeDrive', () => {
  it('нет головы — привода нет', () => {
    expect(createDodgeDrive({ cat: null })).toBeNull()
  })
  it('старт: set → dive-down (голова за краем) → x переставлен, пока скрыта → dive-up; речь ждёт DIVE_MS', () => {
    const { c, d, vars, seen, log, cls } = make()
    expect(cls.has('wlCat--track')).toBe(true)
    expect(seen).toEqual(['set', 'dive-down'])
    expect(vars['--wl-dy']).toBe(DOWN_Y)
    expect(vars['--wl-dx']).toBe('0.00%') // x ещё прежний: под краем не видно, но и не скользит
    expect(d.left()).toBe(DIVE_MS)
    c.go(DIVE_DOWN_MS)
    expect(seen.at(-1)).toBe('dive-up')
    expect(vars['--wl-dx']).toBe('-46.00%') // дорожка 1: x 27 → (27 − 50) / 50 ширины головы
    expect(vars['--wl-dy']).toBe('0%')
    expect(d.left()).toBe(DIVE_MS - DIVE_DOWN_MS)
    c.go(DIVE_MS)
    expect(d.left()).toBe(0)
    expect(log.mock.calls[0][0]).toMatch(/^\[dodge\] нырок из центра на 1 \(старт\)/)
  })
  it('зачёт → нырок к следующей (журнал «нырок с дорожки 1 на 3 (зачёт)»)', () => {
    const { c, d, seen, log, vars } = make()
    c.go(500)
    d.step([pill(40)], 500, [{ type: 'claim', rep: { idx: 0 } }])
    expect(seen.at(-1)).toBe('dive-down')
    expect(log.mock.calls.at(-1)[0]).toMatch(/^\[dodge\] нырок с дорожки 1 на 3 \(зачёт\)/)
    c.go(DIVE_DOWN_MS)
    expect(seen.at(-1)).toBe('dive-up')
    expect(vars['--wl-dx']).toBe('46.00%')
  })
  it('пилюля дошла до Пита → прыжок на дорожку следующей (одна строка журнала), «не успел» после — ничего', () => {
    const { c, d, seen, log, cat, peek } = make()
    c.go(500)
    d.step([pill(atJump)], 500)
    expect(seen.at(-1)).toBe('jump')
    expect(cat.dataset.dir).toBe('r')
    expect(log.mock.calls.at(-1)[0]).toMatch(/^\[dodge\] прыжок с 1 на 3 \(не успел\): низ пилюли .*скорость ×1\.00/)
    expect(peek).toHaveBeenCalledWith(PEEK_MS)
    expect(d.left()).toBe(JUMP_MS)
    const n = log.mock.calls.length
    d.step([pill(97, { state: 'failed' })], 900, [{ type: 'fail', rep: { idx: 0 } }])
    expect(log.mock.calls.length).toBe(n)
    expect(cat.dataset.dodgeX).toBe('73')
  })
  it('та же дорожка: прыжок в сторону, обратно прыжком, когда пилюля прошла; left() ждёт и прохода; data-hop чередуется', () => {
    const { c, d, seen, cat } = make({ lanes: [0, 0] })
    c.go(500)
    d.step([pill(atJump)], 500)
    const hop = cat.dataset.hop
    expect(d.left()).toBeGreaterThan(JUMP_MS) // пилюля ещё идёт над головой
    d.step([pill(106, { state: 'failed' })], 1500)
    expect(seen.slice(-2)).toEqual(['dive-up', 'jump']) // data-dodge пишется только при смене: второй прыжок перезапускает наклон и шлейф через data-hop
    expect(cat.dataset.hop).not.toBe(hop)
    expect(cat.dataset.dodgeX).toBe('27')
  })
  it('голова спрятана: нырок не нужен — x сразу (set), речь не ждёт', () => {
    const { d, seen, vars } = make({ up: false })
    expect(seen).toEqual(['set']) // x переставлен без перехода, data-dodge не трогали
    expect(vars['--wl-dx']).toBe('-46.00%')
    expect(d.left()).toBe(0)
  })
  it('слабое устройство / reduced-motion: переходы мгновенные, порядок тот же', () => {
    const { c, d, seen } = make({ quick: true })
    expect(d.left()).toBe(0)
    c.go(0)
    expect(seen).toEqual(['set', 'dive-down', 'dive-up'])
  })
  it('stop: нырок в центр доигрывает таймер и после остановки; следующая ступень выныривает сразу к своей дорожке', () => {
    const { c, d, seen, cat, vars, log } = make({ lanes: [0] })
    c.go(500)
    d.stop()
    expect(seen.at(-1)).toBe('dive-down')
    const d2 = createDodgeDrive({ cat, lanes: [2], log, now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, quick: false })
    expect(log.mock.calls.at(-1)[0]).toMatch(/вынырнет здесь/)
    c.go(DIVE_DOWN_MS)
    expect(seen.at(-1)).toBe('dive-up')
    expect(vars['--wl-dx']).toBe('46.00%')
    expect(d2.x).toBe(73)
  })
  it('planLine: формат журнала', () => {
    expect(planLine({ kind: 'dive', from: 0, toLane: 1, x: 50, why: 'зачёт' })).toBe('[dodge] нырок с дорожки 1 на 2 (зачёт) → x 50.0 %')
    expect(planLine({ kind: 'jump', from: 1, toLane: 2, x: 73, why: 'не успел' })).toBe('[dodge] прыжок с 2 на 3 (не успел) → x 73.0 %')
  })
  it('measureHead: без размеров — средние', () => {
    expect(measureHead({ parentElement: null })).toEqual({ headW: 50, headTop: HEAD_TOP })
    const m = measureHead({ parentElement: { offsetWidth: 375, offsetHeight: 812 }, offsetWidth: 187.5, offsetHeight: 159.5 })
    expect(m.headW).toBe(50)
    expect(m.headTop).toBeCloseTo(81.1, 1)
  })
})

describe('word-lane-cat-dodge.css', () => {
  const css = readFileSync(new URL('../../styles/player/modules/word-lane-cat-dodge.css', import.meta.url), 'utf8')
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
  it('подключён из word-lane.css', () => {
    expect(readFileSync(new URL('../../styles/player/modules/word-lane.css', import.meta.url), 'utf8')).toMatch(/@import '\.\/word-lane-cat-dodge\.css';/)
  })
  it('без filter; анимируются только transform / translate / rotate / scale / opacity; x без перехода нигде, кроме прыжка', () => {
    expect(rules).not.toMatch(/filter\s*:/)
    for (const m of rules.matchAll(/transition:\s*([^;]+);/g)) if (m[1].trim() !== 'none') expect(m[1]).toMatch(/^(transform|translate) /)
    for (const kf of rules.matchAll(/@keyframes\s+\w+\s*\{([\s\S]*?)\}\s*\}/g)) {
      const props = [...kf[1].matchAll(/([a-z-]+)\s*:/g)].map(x => x[1])
      expect(props.every(p => ['rotate', 'scale', 'transform', 'opacity'].includes(p))).toBe(true)
    }
    expect([...rules.matchAll(/transition:\s*transform[^;]*;/g)]).toHaveLength(1)
    expect(rules).toMatch(/\[data-dodge='jump'\] \.wlCatSvg \{ transition: transform/)
    for (const m of ['dive-down', 'dive-up', 'hide', 'rise']) expect(rules).toMatch(new RegExp(`\\[data-dodge='${m}'\\] \\.wlCatSvg \\{ transition: translate`))
  })
  it('нырок и прыжок укладываются в 160–250 мс, уход и подъём для речи — не дольше 0,45 с', () => {
    for (const m of rules.matchAll(/\[data-dodge='([\w-]+)'\][^{]*\{ transition: (?:transform|translate) ([\d.]+)s/g)) {
      const s = Number(m[2])
      if (['hide', 'rise'].includes(m[1])) expect(s).toBeLessThanOrEqual(0.45)
      else { expect(s).toBeGreaterThanOrEqual(0.16); expect(s).toBeLessThanOrEqual(0.25) }
    }
  })
  it('в слежении .wlCat неподвижен (подъём и пауза его не двигают), слой головы постоянный', () => {
    expect(rules).toMatch(/\.wl \.wlStage > \.wlCat\.scn\.wlCat--track \{ left: 50%; transform: translate\(-50%, 4%\); transition: none; \}/)
    expect(rules).toMatch(/will-change: transform, translate;/)
  })
  it('шлейф прыжка: ::before головы (без новых узлов), перезапуск data-hop, сторона data-dir, едет за головой по --wl-dx', () => {
    expect(rules).toMatch(/\.wlCat--track::before \{[^}]*content: '';[^}]*opacity: 0;[^}]*translate: var\(--wl-dx, 0%\) 0;/)
    expect(rules).toMatch(/\.wlCat--track\[data-dir='l'\]::before \{/)
    expect(rules).toMatch(/\[data-dodge='jump'\]::before \{ transition: translate 0\.18s[^}]*animation: wlCatTrail 0\.3s/)
    expect(rules).toMatch(/\[data-dodge='jump'\]\[data-hop='1'\]::before \{ animation-name: wlCatTrail1; \}/)
    expect(rules).toMatch(/\.wlCat--track\.scn--lite::before \{ content: none; \}/)
    expect(rules).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*\.wlCat--track::before \{ content: none; \}/)
  })
  it('слабое устройство и reduced-motion — без пружины', () => {
    expect(rules).toMatch(/scn--lite\[data-dodge\] \.wlCatSvg \{ transition: none; animation: none; \}/)
    expect(rules).toMatch(/prefers-reduced-motion: reduce/)
  })
})
