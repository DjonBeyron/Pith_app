import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import RaceChargePlate from './RaceChargePlate.jsx'
import RaceBar from './RaceBar.jsx'
import { barOf } from './raceBar.js'
import { buildRaceStages } from './raceStages.js'
import { buildRaceActs } from './raceRecipe.js'
import { roundPlan } from './raceRound.js'
import { openingPlan } from './raceOpening.js'
import { TAIL_POLY, tailClip } from './raceChargePath.js'
import { haloReset, HALO_MAX } from './raceCharge.js'
import { createLane, stepLane, LANE_RATES, LANE_PHASES, RACE_PERIOD, PERIOD, RUN_SPEED } from '../player/modules/rotate-phone/wordLaneConveyor.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { extrasOf } from './raceWords.js'

// Правки владельца v3.3.117: плашки (wobble, brief, раньше, поверх), бар (остаётся, справа налево), хвост (трапеция из углов), узор, конвейер (3 дорожки), пауза 30 %.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const css = n => read(`../../styles/player/modules/${n}`)
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '')
const plan = (() => { const p = normalizePlan({ ...fixturePlan('three'), game: 'race' }); return { ...p, extraWords: extrasOf(p) } })()
const stages = buildRaceStages({ plan }).stages

describe('плашки гонки', () => {
  it('brief: 3–5 слов у каждого акта и у объявления; реплика Пита (task) длинная и не тронута', () => {
    const acts = buildRaceActs(plan).acts.filter(a => a.id !== 'summary')
    for (const a of acts) { expect(a.brief.split(/\s+/).length).toBeGreaterThanOrEqual(3); expect(a.brief.split(/\s+/).length).toBeLessThanOrEqual(5); expect(a.task.split(/\s+/).length).toBeGreaterThan(5) }
    expect(acts.find(a => a.id === 'sprint').brief).toBe('скажи слово по переводу'); expect(acts.find(a => a.id === 'catch').brief).toBe('повтори, если перевод верный')
    const ann = stages.filter(s => s.type === 'announce' && s.round.brief)
    expect(ann.length).toBeGreaterThanOrEqual(4); expect(stages.find(s => s.sid === 'climb-top').round.brief).toBeUndefined(); expect(stages.find(s => s.sid === 'sprint2-ann').round.brief).toBeUndefined()
  })
  it('плашка заставки: название и brief, без барРеф-морфа; уход — data-out', () => {
    const h = renderToStaticMarkup(createElement(RaceChargePlate, { title: 'Разгон', task: 'длинное задание из многих слов подряд для Пита', brief: 'скажи слово по переводу' }))
    expect(h).toContain('Разгон'); expect(h).toContain('скажи слово по переводу'); expect(h).not.toContain('длинное задание'); expect(h).not.toContain('data-out')
    expect(renderToStaticMarkup(createElement(RaceChargePlate, { title: 'Р', task: 'т', out: true }))).toContain('data-out="true"')
    const src = read('./RaceChargePlate.jsx'); expect(src).not.toContain('animate('); expect(src).not.toContain('clip-path'); expect(src).not.toContain('MORPH')
  })
  it('плашка появляется РАНЬШЕ: сразу с началом речи Пита (plateAt), до бара и морфа; стоит до plateEnd', () => {
    const i = stages.findIndex(s => s.sid === 'catch-ann'), p = roundPlan({ plan, stages, i, lines: null, rate: 1 })
    expect(p.o.plateAt).toBeLessThan(p.o.morphAt); expect(p.o.plateAt).toBeLessThan(500); expect(p.o.plateEnd).toBeGreaterThan(p.o.morphAt); expect(p.round.brief).toBeTruthy()
    const o = openingPlan(plan, null, 1); expect(o.stageAt + o.lineAt).toBeLessThan(o.morphAt)
    expect(read('./RaceCharge.jsx')).toContain('plateAt: o.stageAt + o.lineAt')
    expect(roundPlan({ plan, stages, i: stages.findIndex(s => s.sid === 'sprint2-ann'), lines: null, rate: 1 }).o.plateAt).toBe(Infinity)
  })
  it('CSS: плашка выше пилюль и бара, рамка 1 px, wobble при появлении, уход scale 0,9 + opacity за 200 мс, без полёта', () => {
    const ch = strip(css('race-charge.css')), pl = strip(css('race-plate.css'))
    const z = sel => Number(new RegExp(`${sel.replace(/[.[\]]/g, '\\$&')} \\{[^}]*z-index:\\s*(\\d+)`).exec(ch)?.[1])
    expect(z('.raceChargePlate.wlTurn')).toBeGreaterThan(z('.raceChargeBar')); expect(z('.raceChargeBar')).toBeGreaterThan(z('.raceChargePills'))
    expect(pl).toMatch(/border-width: 1px/); expect(pl).toContain('animation: popSheetWobble 0.3s cubic-bezier(0.34, 1.25, 0.64, 1) backwards')
    expect(pl).toMatch(/@keyframes raceTurnOut \{[^}]*scale\(1\)[^}]*opacity: 1[^}]*\}[^}]*scale\(0\.9\)[^}]*opacity: 0/); expect(pl).toContain('raceTurnOut 0.2s'); expect(pl).not.toMatch(/\bfilter:/)
    expect(ch).not.toContain('data-morph'); expect(ch).not.toContain('raceBarOut'); expect(read('../../styles/pop-spring.css')).toContain('@keyframes popSheetWobble')
    expect(read('../../styles/player/modules/race-sprint.css')).toContain("@import './race-plate.css'")
  })
  it('все плашки гонки: этапы (WordLaneTurnPlate soft), попап «Говорю / Тапаю» и итог (startExit soft) без полёта', () => {
    expect(read('../player/modules/rotate-phone/WordLaneTurnPlate.jsx')).toContain('leaving && !lite && !soft')
    expect(read('./RaceSummary.jsx')).toContain('startExit(ref.current, lite, true)'); expect(read('../rehearsal/rehearsalExit.js')).toContain('!lite && !soft')
    expect(strip(css('race-plate.css'))).toContain(".wl[data-phase='ask'] .wlTurn:not(.wlTurn--lite)")
  })
})

describe('бар', () => {
  const stage = stages.find(s => s.sid === 'sprint' && s.type === 'student')
  it('после заставки бар остаётся: не прячется morph-анимацией, оседает до тонкого 6 px, включается мгновенно и полон', () => {
    expect(haloReset().frames.map(f => f.transform)).toEqual([`scaleY(${HALO_MAX})`, 'scaleY(1)'])
    const run = read('./RaceChargeRun.jsx'); expect(run).toContain('haloReset()'); expect(run).not.toContain('setMorph'); expect(run).toContain('data-leaving={leaving || undefined}') // уход заставки не тает бар раньше времени
    const bar = css('race-bar.css'); expect(bar).toMatch(/\.raceBar\[data-on\] \{ opacity: 1; transition: none; \}/)
    const html = renderToStaticMarkup(createElement(RaceBar, { stage, race: {} })); expect(html).toContain('data-on=""'); expect(html).not.toContain('data-spent'); expect(barOf({ stage, race: {} }).spent).toBe(0)
  })
  it('расход справа налево: потрачены самые правые сегменты, сжатие к левому краю', () => {
    const n = stage.words.length, race = { sprint: { results: { 0: { hit: true }, 1: { miss: true } } } }
    const html = renderToStaticMarkup(createElement(RaceBar, { stage, race }))
    const segs = html.split('<i ').slice(1), spent = segs.map(s => s.includes('data-spent'))
    expect(spent.length).toBe(n); expect(spent.slice(0, n - 2).every(x => !x)).toBe(true); expect(spent.slice(n - 2).every(Boolean)).toBe(true)
    expect(strip(css('race-bar.css'))).toMatch(/\.raceBarSeg \{[^}]*transform-origin: left center/)
  })
})

describe('хвост заставки', () => {
  it('трапеция: верхняя кромка 0 0 → 100% 0 = ширина пилюли, книзу сужается, острых углов снаружи нет', () => {
    expect(TAIL_POLY[0]).toEqual([0, 0]); expect(TAIL_POLY[1]).toEqual([100, 0]) // верхние вершины = верхние углы пилюли
    expect(TAIL_POLY[2][1]).toBe(100); expect(TAIL_POLY[3][1]).toBe(100); expect(TAIL_POLY[2][0] - TAIL_POLY[3][0]).toBeLessThan(100); expect(TAIL_POLY[3][0]).toBeGreaterThan(0); expect(TAIL_POLY[2][0]).toBeLessThan(100)
    expect(tailClip()).toBe('polygon(0% 0%, 100% 0%, 82% 100%, 18% 100%)')
    const ch = strip(css('race-charge.css')), tail = /\.raceChargeTail \{[^}]*\}/.exec(ch)[0]
    expect(tail).toMatch(/top:\s*0;/); expect(tail).toMatch(/left:\s*0;/); expect(tail).toMatch(/right:\s*0;/); expect(tail).toMatch(/transform-origin:\s*50% 0;/) // вращение вокруг середины верхней кромки
    expect(/\.raceChargeFly \{[^}]*\}/.exec(ch)[0]).toMatch(/clip-path: inset\(0 /) // срез по верху пилюли
    expect(read('./RaceChargeRun.jsx')).toContain('clipPath: tailClip()')
  })
})

describe('узор фона', () => {
  it('хаотичный: тайл плашки «Старт» уроков (180×180), прозрачность 0,04, белые линии без регулярной сетки 90×60', () => {
    const bg = css('race-stage-bg.css'), start = read('../../styles/lessons-chain-textures.css')
    expect(bg).toMatch(/opacity: 0\.04/); expect(bg).toContain('background-size: 180px 180px'); expect(bg).not.toContain('90px 60px')
    const d = s => /d='M28 118 C34 92 66 82 92 94 C120 107 122 140 94 152/.test(s); expect(d(bg)).toBe(true); expect(d(start)).toBe(true)
    expect(bg).toContain("stroke='white'"); expect(strip(bg)).not.toContain('stroke-opacity')
  })
})

describe('конвейер: три независимые дорожки', () => {
  const run = (L, ms) => { for (let t = 0; t < ms; t += 16) stepLane(L, 16, { armed: true, keep: true }); return L }
  it('множители ×0,96 / ×1 / ×1,04 и разные фазы старта, детерминированно', () => {
    expect(LANE_RATES).toEqual([0.96, 1, 1.04]); expect(new Set(LANE_PHASES).size).toBe(3)
    const ys = [0, 1, 2].map(i => createLane(i).y); expect(new Set(ys).size).toBe(3)
    const [a, b, c] = [0, 1, 2].map(i => run(createLane(i), 3000))
    expect(a.s).toBeCloseTo(RUN_SPEED, 3); expect(a.k).toBe(0.96); expect(c.k).toBe(1.04)
    const adv = L => { const y0 = L.y; run(L, 160); return ((L.y - y0) % RACE_PERIOD + RACE_PERIOD) % RACE_PERIOD }
    const [da, db, dc] = [a, b, c].map(adv); expect(da).toBeLessThan(db); expect(db).toBeLessThan(dc); expect(da / db).toBeCloseTo(0.96, 2); expect(dc / db).toBeCloseTo(1.04, 2)
    expect(createLane().k).toBe(1); expect(createLane().y).toBe(0); expect(createLane().per).toBe(PERIOD) // обычная нода без изменений
  })
  it('привод включает режим гонки по [data-race] на корне и не пишет длину штрихов; CSS — «---|---:---» одной маской с периодом RACE_PERIOD', () => {
    const drv = read('../player/modules/rotate-phone/laneConveyorDrive.js'); expect(drv).toContain("closest?.('[data-race]')"); expect(drv).toContain('createLane(race ? i : -1)')
    const c = strip(css('word-lane-lane-run.css')), r = /\.wl\[data-race\] \.wlLanes i::before \{[^}]*\}/.exec(c)[0]
    expect(r).toContain(`--run-p: ${RACE_PERIOD}dvh`); expect(r.match(/mask-image: repeating-linear-gradient/g).length).toBe(2) // -webkit- и стандартное свойство: одна и та же маска
    const m = /(?<!-webkit-)mask-image: repeating-linear-gradient\(to bottom, ([^;]*)\);/.exec(r)[1]
    const segs = [...m.matchAll(/(#000|transparent) ([\d.]+)(?:dvh)? (?:([\d.]+)dvh|var\(--run-p\))/g)].map(x => ({ on: x[1] === '#000', from: Number(x[2]), to: x[3] ? Number(x[3]) : RACE_PERIOD }))
    const on = segs.filter(s => s.on).map(s => +(s.to - s.from).toFixed(2))
    expect(on).toEqual([1.2, 1.2, 1.2, 4.4, 1.2, 1.2, 1.2, 0.7, 0.7]) // три коротких, длинная, три коротких, две точки
    expect(segs.at(-1).to).toBe(RACE_PERIOD); expect(segs[0].from).toBe(0); segs.forEach((s, i) => { if (i) expect(s.from).toBe(segs[i - 1].to) })
    expect(c).not.toMatch(/animation|@keyframes|filter/)
  })
})

describe('пауза', () => {
  it('подложка затемняет игру на 30 %, карточка попапа плотная', () => {
    const p = strip(css('word-lane-pause.css'))
    expect(p).toMatch(/\.wlPauseBack \{[^}]*background: rgba\(21, 24, 31, 0\.3\)/); expect(p).toMatch(/\.wlPause \{[^}]*background: #15181f/)
  })
})
