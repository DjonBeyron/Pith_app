// Правила «по доле пути» (владелец 2026-11-27): умная похвала Пита, колкости Мии не на позднем верном, мягкие реплики на слабом слове, простой улёт.
import { describe, it, expect } from 'vitest'
import { initRace, reduceRace } from './raceState.js'
import { buildRaceStages } from './raceStages.js'
import { pendingGood, goodPlan, GOOD_IDS } from './raceGood.js'
import { PRAISE_MAX_SHARE, JAB_MAX_SHARE } from './racePathShare.js'
import { createSoft, softStage, failIsWeak, SOFT_IDS } from './raceSoft.js'
import { RACE_LINES } from './raceLines.js'
import { reduceMia, miaInit } from './mia/raceMia.js'
import { examRound } from './boss/bossMia.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const stageOf = (act, o = {}) => buildRaceStages({ plan, ...o }).stages.find(s => s.act === act && s.type === 'student' && !s.mia)
const ev = (s, t, stage, info) => reduceRace(s, { t, stage, info })

/** Прогон верных слов: shares[i] — доля пути на i-м верном; → что сказал Пит на каждом */
function run(stage, shares) {
  let s = ev(initRace(), 'enter', stage).state
  return shares.map((share, i) => { const r = ev(s, 'claim', stage, { idx: i, ms: 1000, share }); s = r.state; return r.say })
}

describe('умная похвала: pendingGood', () => {
  const plan3 = [{ at: 1, id: 'a' }, { at: 4, id: 'b' }, { at: 8, id: 'c' }]
  it('ждёт только подошедшую по номеру и ещё не сказанную; несколько подошедших — последняя', () => {
    expect(pendingGood(plan3, 0, 0)).toBeNull()
    expect(pendingGood(plan3, 1, 0)).toEqual({ at: 1, id: 'a' })
    expect(pendingGood(plan3, 3, 1)).toBeNull()
    expect(pendingGood(plan3, 5, 1)).toEqual({ at: 4, id: 'b' })
    expect(pendingGood(plan3, 9, 1)).toEqual({ at: 8, id: 'c' })
    expect(pendingGood(plan3, 9, 8)).toBeNull(); expect(pendingGood(undefined, 3, 0)).toBeNull()
  })
})

describe('умная похвала Пита: проход A и обратный проход B', () => {
  for (const [name, act, ids] of [['проход A', 'sprint', GOOD_IDS], ['обратный проход B', 'catch', ['race_good_ok']]]) {
    const stage = stageOf(act)
    const planAt = stage.good.map(g => g.at)
    it(`${name}: ранний верный (доля < 65 %) хвалится по плану, как раньше`, () => {
      const said = run(stage, Array(8).fill(0.4))
      expect(said.map((x, i) => (x ? i + 1 : null)).filter(Boolean)).toEqual(planAt.filter(a => a <= 8))
      said.filter(Boolean).forEach(id => expect(ids).toContain(id))
    })
    it(`${name}: на позднем верном (доля ≥ 65 %) похвалы нет, она ждёт следующего раннего`, () => {
      const first = planAt[0] // первое верное слово по плану (at = 1): отвечено поздно
      const said = run(stage, [0.7, 0.4, 0.4, 0.4, 0.4])
      expect(first).toBe(1); expect(said[0]).toBeNull()
      expect(said[1]).toBe(stage.good[0].id) // сдвинулась на следующий ранний
      expect(said.slice(2).filter(Boolean).length).toBeLessThanOrEqual(1)
    })
    it(`${name}: граница — 0,649 хвалим, ровно 0,65 — нет`, () => {
      expect(run(stage, [PRAISE_MAX_SHARE - 0.001])[0]).toBe(stage.good[0].id)
      expect(run(stage, [PRAISE_MAX_SHARE])[0]).toBeNull()
    })
    it(`${name}: доли нет (тап, демо) — хвалим как раньше; счётчик верных не зависит от доли`, () => {
      expect(run(stage, [undefined])[0]).toBe(stage.good[0].id)
      let s = ev(initRace(), 'enter', stage).state
      for (let i = 0; i < 3; i++) s = ev(s, 'claim', stage, { idx: i, share: 0.9 }).state
      expect((s[act]).claims).toBe(3)
    })
  }
  it('доля пути попадает в результат слова и в журнал «верно … путь N %»', () => {
    const stage = stageOf('sprint')
    let s = ev(initRace(), 'enter', stage).state
    s = ev(s, 'claim', stage, { idx: 0, ms: 1200, share: 0.724 }).state
    expect(s.sprint.results[0].share).toBeCloseTo(0.724, 3)
    expect(ev(s, 'win', stage, { idx: 0 }).log).toMatch(/верно за 1200 мс, путь 72 %/)
  })
  it('план сдвигается по одной реплике: поздние подряд не копят очередь реплик', () => {
    const stage = stageOf('sprint'), said = run(stage, [0.9, 0.9, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1])
    expect(said.filter(Boolean).length).toBe(1) // поздние молчат, один ранний забирает всё подошедшее
    expect(said[5]).not.toBeNull()
  })
})

describe('колкости Мии: верный на ≥ 85 % пути — без колкости', () => {
  const round = buildRaceStages({ plan, mia: true }).stages.find(s => s.mia === 'round') ?? null
  const mk = () => { const st = round ?? { act: 'sprint', mia: 'round', words: Array.from({ length: 6 }, (_, i) => ({ text: `w${i}`, translation: `с${i}` })) }; return { st, m: { ...miaInit(), phase: 'in', act: st.act, fast: true } } }
  it('«Допрос»: колкость на верный есть без доли и при доле < 85 %, при ≥ 85 % — нет; серия и счётчик идут как раньше', () => {
    const { st, m } = mk()
    const win = (m0, idx, share) => reduceMia(m0, { t: 'win', stage: st, idx, now: 0, share })
    expect(win(m, 0, undefined).say.length).toBe(1)
    expect(win(m, 0, JAB_MAX_SHARE - 0.001).say.length).toBe(1)
    const late = win(m, 0, JAB_MAX_SHARE)
    expect(late.say).toEqual([]); expect(late.mia.wins).toBe(1); expect(late.mia.streak).toBe(1)
    const second = win(late.mia, 1, 0.5) // второй верный подряд после подавленного: «Подозрительно хорошо» по серии
    expect(second.say.map(c => c.id)).toEqual(['mia_streak2'])
  })
  it('«Допрос»: колкости на ошибку и «ушло» не меняются от доли', () => {
    const { st, m } = mk()
    expect(reduceMia(m, { t: 'fail', stage: st, idx: 0, now: 0, share: 0.99 }).say.map(c => c.id)[0]).toMatch(/^mia_miss/)
  })
  it('экзамен: тот же порог на верный ответ', () => {
    const st = { act: 'boss', silent: true, offset: 0, words: [{ text: 'a' }, { text: 'b' }], mia: 'round' }
    const m = { ...miaInit(), phase: 'in', act: 'boss', total: 2 }
    expect(examRound(m, { t: 'win', stage: st, idx: 0, now: 0 }).say.length).toBe(1)
    expect(examRound(m, { t: 'win', stage: st, idx: 0, now: 0, share: 0.84 }).say.length).toBe(1)
    const late = examRound(m, { t: 'win', stage: st, idx: 0, now: 0, share: 0.85 })
    expect(late.say).toEqual([]); expect(late.mia.wins).toBe(1)
  })
})

describe('мягкие реплики Пита на слабом слове', () => {
  it('три реплики в каталоге: короткие, без знаков озвучки в тексте, tts отличается только знаками', () => {
    const lines = SOFT_IDS.map(id => RACE_LINES.find(l => l.id === id))
    expect(lines.every(Boolean)).toBe(true)
    for (const l of lines) { expect(l.text.split(/\s+/).length).toBeLessThanOrEqual(5); expect(l.text).not.toMatch(/[.…!—]/); expect(l.tts.replace(/[.…!—,?:]/g, '').toLowerCase()).toBe(l.text.replace(/[,]/g, '').toLowerCase()) }
    expect(lines.map(l => l.text)).toEqual(['ничего, идём дальше', 'слово ещё вернётся', 'получится, держись'])
  })
  it('не чаще одного раза на 3 слабых слова, две подряд не одинаковы, слово считается один раз', () => {
    const soft = createSoft('seed-1'), said = []
    for (let i = 1; i <= 40; i++) { const id = soft.weak(`sprint:${i}`); if (id) said.push([i, id]) }
    expect(said.length).toBeGreaterThanOrEqual(8)
    said.forEach(([n, id], k) => { expect(SOFT_IDS).toContain(id); if (k) { expect(n - said[k - 1][0]).toBeGreaterThanOrEqual(3); expect(id).not.toBe(said[k - 1][1]) } })
    expect(soft.weak('sprint:1')).toBeNull(); expect(soft.count()).toBe(40) // повторное событие по тому же слову не считается
    expect(createSoft('seed-1').plan).toEqual(soft.plan); expect(createSoft('seed-2').plan).not.toEqual(soft.plan)
  })
  it('только этапы Пита (проход A и B): не «Допрос», не экзамен, не «Фразы»; на ловушке слабое — только «поверил»', () => {
    const all = buildRaceStages({ plan, mia: true }).stages
    expect(softStage(stageOf('sprint'))).toBe(true); expect(softStage(stageOf('catch'))).toBe(true)
    for (const st of all.filter(s => s.mia === 'round' || s.act === 'boss' || s.act === 'phrases')) expect(softStage(st), st.sid).toBe(false)
    expect(failIsWeak({ trap: false }, {})).toBe(true); expect(failIsWeak({ trap: true }, {})).toBe(false); expect(failIsWeak({ trap: true }, { believed: true })).toBe(true)
  })
  it('директор говорит реплику ДО секвенсора речи и только когда Пит свободен (источник useRaceActs)', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./useRaceActs.js', import.meta.url), 'utf8')
    expect(src.indexOf("weakSay(running, info?.idx ?? 0, 'не успел')")).toBeLessThan(src.indexOf("speech.pillGone('missed')"))
    expect(src.indexOf('weakSay(running, rep?.idx ?? 0')).toBeLessThan(src.indexOf('speech.claim(praiseRef.current)'))
    expect(src).toContain('pitBusy() > 0 || speech.holdMs() > 0')
  })
  it('goodPlan не конфликтует: те же правила плана, что у похвалы', () => {
    expect(goodPlan('x', 'soft', 10, { first: true, ids: SOFT_IDS })[0].at).toBe(1)
  })
})
