import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RaceClimb from './RaceClimb.jsx'
import RaceActs from './RaceActs.jsx'
import { reduceRace, initRace } from './raceState.js'
import { buildRaceStages } from './raceStages.js'
import { climbWords, climbHints } from './raceWords.js'
import { LANE_X } from './raceClimbCam.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const words = climbWords(plan), hints = climbHints(plan)
const steps = buildRaceStages({ plan }).stages.filter(s => s.act === 'climb' && s.type === 'student')
const html = (el, props) => renderToStaticMarkup(createElement(el, props))
const text = h => h.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'")
const ev = (s, t, k, info) => reduceRace(s, { t, stage: steps[k - 1], info, now: 1000 }).state
const climbTo = (n, state = ev(initRace(), 'enter', 1)) => { let s = state; for (let k = 1; k <= n; k++) s = ev(ev(s, 'win', k), 'enter', k + 1 > 4 ? 4 : k + 1); return s }
const show = (s, extra = {}) => html(RaceClimb, { climb: s.climb, words, hints, phrase: "I'm trying to learn", ...extra })

describe('капсула героя на экране', () => {
  it('на земле пустая и узкая; растёт по слову: «I\'m» → «I\'m trying» → …; на вершине вся фраза', () => {
    const capOf = h => text(h.match(/data-testid="race-cap">(.*?)<\/div><\/div><\/div>/)[1])
    const s0 = ev(initRace(), 'enter', 1)
    expect(show(s0)).toContain('data-empty="true"'); expect(capOf(show(s0))).toBe('')
    expect([1, 2, 3, 4].map(n => capOf(show(climbTo(n))))).toEqual(["I'm", "I'm trying", "I'm trying to", "I'm trying to learn"])
  })
  it('новое слово влетает отдельным элементом (после взятия), при соскоке последнее слово вылетает, капсула короче', () => {
    const won = ev(climbTo(1), 'win', 2) // сразу после взятия (событие ещё не снято следующей стадией)
    expect(show(won, { lite: false })).toContain('data-testid="race-cap-in">trying<')
    expect(show(won, { lite: true })).not.toContain('race-cap-in') // слабое устройство: без влёта, просто смена текста
    const slip = ev(ev(won, 'enter', 3), 'miss', 3, { heard: 'table' })
    const h = show(slip, { lite: false })
    expect(h).toContain('data-testid="race-cap-out">trying<'); expect(h).not.toContain('race-cap-in'); expect(text(h.match(/data-testid="race-cap">(.*?)<\/div><\/div><\/div>/)[1])).toContain("I'm")
  })
})

describe('камни со словом', () => {
  it('до приземления на камне русский перевод, английское слово скрыто; у слова без карточки — номер без перевода', () => {
    const h = show(ev(initRace(), 'enter', 1))
    expect(h).toContain('data-testid="race-tr-1">я<'); expect(h).toContain('data-testid="race-tr-2">пытаюсь<'); expect(h).toContain('data-testid="race-tr-4">учиться<')
    expect(h).toContain('data-testid="race-tr-3"></span>') // «to» — без карточки
    for (const k of [1, 2, 3, 4]) expect(h).toContain(`data-testid="race-word-${k}"></span>`)
    expect(h).toContain('raceFace--ru'); expect(h).toContain('raceFace--en')
  })
  it('взял ступень — камень помечен data-lit (переворот в CSS), на обратной стороне английское слово; перевод остаётся шпаргалкой', () => {
    const h = show(climbTo(2))
    expect(h).toMatch(/data-lit="true" data-testid="race-step-1"/); expect(h).toContain('data-testid="race-word-1">I&#x27;m<'); expect(h).toContain('data-testid="race-tr-1">я<')
    expect(h).not.toMatch(/data-lit="true"[^>]*data-testid="race-step-3"/)
  })
  it('3-й промах: мигает английское слово на этом камне', () => {
    let s = ev(initRace(), 'enter', 1)
    for (let i = 0; i < 3; i++) s = ev(ev(s, 'miss', 1, { heard: 'x' }), 'enter', 1)
    expect(show(s)).toContain('data-testid="race-blink">I&#x27;m<')
  })
})

describe('ловушка на экране', () => {
  const trapAt = k => ev(climbTo(3, ev(initRace(), 'enter', 1)), 'enter', k)
  it('стоит рядом с островом ступени 4: двойник по-английски, соседняя дорожка, та же высота (--k), перевода нет', () => {
    const h = show(trapAt(4))
    const m = h.match(/class="raceTrap" style="--k:4;left:([\d.]+)%" data-lane="(\d)" data-state="stand" data-testid="race-trap"><span class="raceTrapWord">(\w+)<\/span>/)
    expect(m).toBeTruthy()
    const t = steps[0].trap; expect(m[3]).toBe(t.text); expect(+m[1]).toBeCloseTo(LANE_X[t.lane] * 100, 1); expect(+m[2]).not.toBe(0) // остров 4 на дорожке 0
  })
  it('сказал двойник — осыпается (crumbled, камень ещё на экране на время анимации); потом без события камня нет', () => {
    const crumb = ev(trapAt(4), 'miss', 4, { heard: 'earn' })
    expect(show(crumb)).toContain('data-state="crumbled"')
    const later = { ...crumb, climb: { ...crumb.climb, seq: crumb.climb.seq + 1 } }
    expect(show(later)).not.toContain('race-trap')
  })
  it('сказал верно — проваливается (fell) и прыжок на остров', () => {
    const won = ev(trapAt(4), 'win', 4)
    expect(show(won)).toContain('data-state="fell"'); expect(show(won)).toContain('data-last="hit"')
  })
  it('без двойников (план «два куска») ловушки нет; RaceActs передаёт переводы', () => {
    const p2 = normalizePlan({ ...fixturePlan('two'), game: 'race' })
    const st2 = buildRaceStages({ plan: p2 }).stages.find(s => s.act === 'climb' && s.type === 'student')
    const s2 = reduceRace(initRace(), { t: 'enter', stage: st2, now: 1 }).state
    expect(html(RaceClimb, { climb: s2.climb, words: climbWords(p2), hints: climbHints(p2), phrase: 'x' })).not.toContain('race-trap')
    const f = { stage: 'run', stageObj: { type: 'student', act: 'climb', sid: 'climb-1' }, rh: { on: true, quiet: false, race: ev(initRace(), 'enter', 1) }, finish() {} }
    expect(html(RaceActs, { f, cfg: { plan } })).toContain('data-testid="race-tr-2">пытаюсь<')
  })
  it('стили: камень переворачивается 300 мс по transform; ловушка осыпается 400 мс; базовое состояние осыпавшейся — невидима; без анимаций остаётся читаемо', () => {
    const climb = read('../../styles/player/modules/race-climb.css'), trap = read('../../styles/player/modules/race-climb-trap.css'), hero = read('../../styles/player/modules/race-climb-hero.css')
    expect(climb).toContain('rotateY(180deg)'); expect(climb).toContain('transition: transform 0.3s'); expect(climb).toContain('backface-visibility: hidden')
    expect(trap).toContain('raceCrumble 0.4s'); expect(trap).toMatch(/\.raceTrap \{[^}]*opacity: 0/); expect(hero).toContain('raceCapIn 0.35s')
    for (const c of [trap, hero]) { expect(c).not.toMatch(/filter\s*:/); expect(c).not.toContain('animation: none') }
    for (const f of ['race-climb-hero', 'race-climb-trap']) expect(climb).toContain(`@import './${f}.css';`) // подключены из race-climb.css (index.css на пределе 250 строк)
    for (const f of ['raceTrap.js', 'raceTrapVoice.js', 'raceCapsule.js', 'RaceHero.jsx']) expect(read(`./${f}`)).not.toContain('Math.random')
  })
})
