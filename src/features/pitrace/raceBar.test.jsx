import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { barSegments, barNew, barReduce, barLeft, barEmpty, barOf, chargeWordsOf, BAR_CORE_PX } from './raceBar.js'
import RaceBar from './RaceBar.jsx'
import { buildRaceStages } from './raceStages.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { extrasOf } from './raceWords.js'

// Прогресс-бар сверху живёт весь разгон (CONCEPT_RACE.md, «Бар живёт весь разгон», v3.3.115): модель (заряд / расход по событиям), вывод из стадии и результатов, разметка и стили.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const plan = (() => { const p = normalizePlan({ ...fixturePlan('three'), game: 'race' }); return { ...p, extraWords: extrasOf(p) } })()
const words = [{ text: 'a', level: 0 }, { text: 'b', level: 2 }, { text: 'c', level: 4 }, { text: 'd' }]
const stagesOf = () => buildRaceStages({ plan }).stages

describe('модель бара', () => {
  it('сегменты: по одному на слово, цвет — ступень слова (--lvlN), в сумме ровно 100 %', () => {
    const segs = barSegments(words)
    expect(segs.length).toBe(4); expect(segs.map(s => s.color)).toEqual(['var(--lvl0)', 'var(--lvl2)', 'var(--lvl4)', 'var(--lvl1)']) // слову без ступени — 1
    expect(segs[0].from).toBe(0); expect(segs.at(-1).to).toBe(100)
    segs.forEach((s, i) => { if (i) expect(s.from).toBe(segs[i - 1].to) })
    expect(barSegments([])).toEqual([]); expect(BAR_CORE_PX).toBe(6)
  })
  it('заряд → расход слева направо: каждая сыгранная пилюля гасит один сегмент, слова кончились — бар пуст', () => {
    let bar = barNew(words, 'sprint'); expect(barLeft(bar)).toBe(4); expect(barEmpty(bar)).toBe(false)
    bar = barReduce(bar, { t: 'spend', idx: 2 }); expect(bar.spent).toBe(1); expect(barLeft(bar)).toBe(3) // гаснет следующий слева сегмент (по счёту сыгранных), а не «свой» по номеру
    bar = barReduce(bar, { t: 'spend', idx: 0 }); bar = barReduce(bar, { t: 'spend', idx: 1 }); bar = barReduce(bar, { t: 'spend', idx: 3 })
    expect(barLeft(bar)).toBe(0); expect(barEmpty(bar)).toBe(true)
    expect(barReduce(bar, { t: 'spend', idx: 9 })).toBe(bar) // больше сегментов нет
  })
  it('повтор события про ту же пилюлю бар не тратит; перезаряд новым кругом возвращает бар полным', () => {
    let bar = barNew(words); bar = barReduce(bar, { t: 'spend', idx: 1 }); expect(barReduce(bar, { t: 'spend', idx: 1 })).toBe(bar)
    const again = barReduce(bar, { t: 'charge', words: words.slice(0, 2), key: 'sprint2' })
    expect(again.segs.length).toBe(2); expect(again.spent).toBe(0); expect(again.key).toBe('sprint2')
  })
})

describe('бар из стадии и результатов гонки', () => {
  const st = (act, sid = act) => stagesOf().find(s => s.sid === sid && s.type === 'student')
  it('только ступень ученика «Разгона» / «Слушай и лови»: на плашке, в вершине, в итоге бара нет', () => {
    const stages = stagesOf()
    expect(barOf({ stage: st('sprint'), race: {} })).not.toBeNull(); expect(barOf({ stage: st('catch'), race: {} })).not.toBeNull()
    expect(barOf({ stage: stages.find(s => s.type === 'announce'), race: {} })).toBeNull()
    expect(barOf({ stage: stages.find(s => s.act === 'climb' && s.type === 'student'), race: {} })).toBeNull()
    expect(barOf({ stage: null, race: {} })).toBeNull(); expect(barOf({ stage: stages.at(-1), race: {} })).toBeNull()
  })
  it('сегментов столько, сколько слов круга; расход = сколько пилюль уже разрешилось (results)', () => {
    const stage = st('sprint'), n = stage.words.length
    expect(barOf({ stage, race: {} }).segs.length).toBe(n); expect(barOf({ stage, race: {} }).spent).toBe(0)
    const race = { sprint: { results: { 0: { hit: true }, 1: { miss: true }, 2: { ms: 300 } } } }
    const bar = barOf({ stage, race }); expect(bar.spent).toBe(3); expect(barLeft(bar)).toBe(n - 3)
    const all = Object.fromEntries(stage.words.map((_, i) => [i, { hit: true }]))
    expect(barEmpty(barOf({ stage, race: { sprint: { results: all } } }))).toBe(true) // слова закончились — бар пуст
  })
  it('второй круг считается по r2.results и по своим словам; результаты первого круга ему не мешают', () => {
    const stage = { ...st('sprint'), sid: 'sprint2', words: st('sprint').words.slice(0, 3) }
    const race = { sprint: { results: { 0: { hit: true }, 1: { hit: true } }, r2: { results: { 0: { hit: true } } } } }
    const bar = barOf({ stage, race }); expect(bar.segs.length).toBe(3); expect(bar.spent).toBe(1); expect(bar.key).toBe('sprint2')
    expect(barOf({ stage, race: { sprint: { results: { 0: { hit: true } } } } }).spent).toBe(0) // r2 ещё нет
  })
  it('перезарядка: слова для зарядки — слова следующей ступени ученика, только после объявления своего акта', () => {
    const stages = stagesOf(), i = n => stages.findIndex(s => s.sid === n)
    expect(chargeWordsOf(stages, i('sprint-ann')).length).toBe(st('sprint').words.length)
    expect(chargeWordsOf(stages, i('catch-ann')).map(w => w.text).sort()).toEqual(st('catch').words.map(w => w.text).sort()) // слова этапа 2
    expect(chargeWordsOf(stages, i('sprint2-ann')).length).toBe(st('sprint', 'sprint2').words.length)
    expect(chargeWordsOf(stages, i('sprint'))).toEqual([]) // ступень ученика — не объявление
    expect(chargeWordsOf(stages, 99)).toEqual([])
  })
})

describe('разметка и стили RaceBar', () => {
  const stage = stagesOf().find(s => s.sid === 'sprint' && s.type === 'student')
  const html = (race = {}, st = stage) => renderToStaticMarkup(createElement(RaceBar, { stage: st, race }))
  it('на ступени ученика бар включён, сегментов по слову; сыгранные помечены data-spent', () => {
    const h = html({ sprint: { results: { 0: { hit: true }, 1: { miss: true } } } })
    expect(h).toContain('data-on=""'); expect(h.match(/data-testid="race-bar-seg"/g).length).toBe(stage.words.length); expect(h.match(/data-spent=""/g).length).toBe(2)
    expect(html({ sprint: { results: Object.fromEntries(stage.words.map((_, i) => [i, { hit: true }])) } })).toContain('data-empty=""')
  })
  it('вне ступени ученика бар спрятан (нет data-on), узел на месте', () => {
    const h = html({}, null); expect(h).not.toContain('data-on'); expect(h).toContain('race-bar')
  })
  it('CSS: 6 px, скругление 999, между «назад» и «пауза» (отступы 56 px + safe-area), центр на линии кнопок, расход — transform / opacity, без filter', () => {
    const css = read('../../styles/player/modules/race-bar.css')
    expect(css).toMatch(/\.raceBar \{[^}]*height: 6px;/); expect(css).toMatch(/\.raceBarTrack \{[^}]*border-radius: 999px/)
    expect(css).toMatch(/left: calc\(env\(safe-area-inset-left, 0px\) \+ 56px\)/); expect(css).toMatch(/right: calc\(env\(safe-area-inset-right, 0px\) \+ 56px\)/); expect(css).toMatch(/top: calc\(env\(safe-area-inset-top, 0px\) \+ 25px\)/)
    expect(css).toContain('.raceBarSeg[data-spent] { transform: scaleX(0); opacity: 0; }'); expect(css).not.toMatch(/\bfilter:/); expect(css).not.toMatch(/\b(width|left): [^;]*transition/)
    const charge = read('../../styles/player/modules/race-charge.css')
    expect(charge).toMatch(/\.raceChargeBar \{[^}]*top: calc\(env\(safe-area-inset-top, 0px\) \+ 25px\)/); expect(charge).toMatch(/\.raceChargeBar \{[^}]*left: calc\(env\(safe-area-inset-left, 0px\) \+ 56px\)/) // заставка и постоянный бар стоят в одном месте
    const spr = read('../../styles/player/modules/race-sprint.css'); expect(spr).toContain("@import './race-bar.css'"); expect(spr).toContain("@import './race-panel.css'")
  })
  it('RaceActs держит бар и зарядку второго круга / этапа 2 (RaceRoundCharge), бар не знает Math.random', () => {
    const src = read('./RaceActs.jsx')
    expect(src).toContain('<RaceBar stage={live} race={rh.race} />'); expect(src).toContain('<RaceRoundCharge '); expect(src).toContain("f.stage === 'paused' && f.from === 'run'") // на паузе бар на месте
  })
})
