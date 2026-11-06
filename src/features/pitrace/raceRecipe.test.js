import { describe, it, expect } from 'vitest'
import { buildRaceActs, DESCENT_RATE } from './raceRecipe.js'
import { sprintWords, catchWords, climbWords, extrasOf, SPRINT_MIN, SPRINT_MAX, SPEED_STEP } from './raceWords.js'
import { pickRound, RACE_ROUNDS, STAGES_ROUND, isRound } from './raceOnly.js'
import { FIXTURE_IDS, fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

const race = (id = 'three', extra = {}) => normalizePlan({ ...fixturePlan(id), game: 'race', ...extra })
const ids = acts => acts.map(a => a.id)

describe('рецепт гонки: акты из плана репетиции', () => {
  it('полная гонка: разгон → слушай и лови → вершина → спуск → итог; план несёт game: race', () => {
    for (const id of FIXTURE_IDS) {
      const plan = race(id)
      expect(plan.game).toBe('race')
      expect(ids(buildRaceActs(plan).acts)).toEqual(['sprint', 'catch', 'climb', 'descent', 'summary'])
    }
  })
  it('разгон: 6–10 пилюль; слов с переводом у плана меньше шести — добираются чужими (других фикстур / plan.extraWords)', () => {
    for (const id of FIXTURE_IDS) {
      const w = sprintWords(race(id))
      expect(w.length).toBeGreaterThanOrEqual(SPRINT_MIN)
      expect(w.length).toBeLessThanOrEqual(SPRINT_MAX)
      expect(new Set(w.map(x => x.text.toLowerCase())).size).toBe(w.length) // без повторов
      expect(w.every(x => x.translation)).toBe(true) // у каждой пилюли есть перевод
    }
    const own = sprintWords(race('three')).map(x => x.text)
    expect(own.slice(0, 2).sort()).toEqual(['learn', 'trying']) // свои слова фразы идут первыми
    const mine = race('one', { extraWords: [{ text: 'pencil', translation: 'карандаш' }, { text: 'window', translation: 'окно' }, { text: 'table', translation: 'стол' }, { text: 'chair', translation: 'стул' }, { text: 'river', translation: 'река' }] })
    expect(extrasOf(mine).map(x => x.text)).toContain('pencil') // plan.extraWords важнее фикстур
    expect(sprintWords(mine).map(x => x.text)).toEqual(expect.arrayContaining(['remember', 'pencil']))
  })
  it('скорость по пилюлям: первая ×1, каждая следующая на 5 % быстрее; дорожки строго по очереди 0, 1, 2, 0, 1, 2', () => {
    const w = sprintWords(race('three'))
    expect(w[0].speed).toBe(1)
    w.forEach((x, i) => expect(x.speed).toBeCloseTo(SPEED_STEP ** i, 3))
    expect(w[1].speed / w[0].speed).toBeCloseTo(1.05, 3)
    expect(w.map(x => x.lane)).toEqual(w.map((_, i) => i % 3)) // слева направо по кругу, не по семени
    expect(sprintWords(race('three', { seed: 'другое семя' })).map(x => x.lane)).toEqual(w.map(x => x.lane))
  })
  it('проход B «назови перевод» (инверсия прохода A): те же слова в другом порядке, дорожки по очереди, скорость +5 %; на пилюле перевод этого же слова, ловушек нет, первая пилюля всегда верная', () => {
    for (const id of FIXTURE_IDS) {
      const plan = race(id)
      const base = sprintWords(plan), w = catchWords(plan)
      expect(w.map(x => x.text).sort()).toEqual(base.map(x => x.text).sort()) // состав тот же
      expect(w.map(x => x.lane)).toEqual(w.map((_, i) => i % 3))
      w.forEach((x, i) => { expect(x.idx).toBe(i); expect(x.speed).toBeCloseTo(SPEED_STEP ** i, 3) })
      for (const x of w) { expect(x.trap).toBe(false); expect(x.foreign).toBeNull(); expect(x.shown).toBe(x.translation) } // ловушек нет: на пилюле перевод того слова, что сказал Пит
    }
  })
  it('проход B: раскладка по семени (rngFor) — одно семя даёт одно и то же, другое — другой порядок; акт несёт слова и задание', () => {
    const plan = race('three')
    expect(JSON.stringify(catchWords(plan))).toBe(JSON.stringify(catchWords(race('three'))))
    expect(catchWords(race('three', { seed: 'другое семя' })).map(x => x.text)).not.toEqual(catchWords(plan).map(x => x.text))
    const act = buildRaceActs(plan).acts.find(a => a.id === 'catch')
    expect(act.words).toEqual(catchWords(plan)); expect(act.line).toBe('race_catch_tap'); expect(buildRaceActs(plan, false, true).acts.find(a => a.id === 'catch').line).toBe('race_catch'); expect(act.sets).toBeUndefined()
    const v = buildRaceActs(plan, false, true).acts; expect(v.find(a => a.id === 'catch').task).toBe('теперь наоборот, я говорю по-английски, а ты называешь перевод'); expect(v.find(a => a.id === 'sprint').line).toBeNull() // объявления этапа A нет: звучит стартовая фраза race_start
    const t = buildRaceActs(plan, true, true).acts; expect(t.find(a => a.id === 'sprint').line).toBeNull(); expect(t.find(a => a.id === 'catch').line).toBe('race_catch_tap'); expect(t.find(a => a.id === 'sprint').task).toMatch(/тапни/) // «Тапаю»: тап-реплики и задания
    expect(act.task).toMatch(/тапни перевод/); expect(act.title).toBe('Пинг-понг')
  })
  it('вершина: N ступеней = N слов фразы по порядку; спуск — вся фраза, один раз, на скорости 1,1', () => {
    expect(climbWords(race('three'))).toEqual(["I'm", 'trying', 'to', 'learn'])
    expect(climbWords(race('two'))).toEqual(['Nice', 'to', 'meet', 'you'])
    const { acts } = buildRaceActs(race('three'))
    expect(acts.find(a => a.id === 'climb').words).toHaveLength(4)
    const d = acts.find(a => a.id === 'descent')
    expect(d.parts).toEqual([0, 1, 2]); expect(d.rate).toBe(DESCENT_RATE); expect(DESCENT_RATE).toBe(1.1)
    expect(acts.filter(a => a.id === 'descent')).toHaveLength(1)
  })
  it('один раунд (plan.round): только он и без итога; незнакомый раунд — все акты', () => {
    for (const r of RACE_ROUNDS) expect(ids(buildRaceActs(race('three', { round: r })).acts)).toEqual([r])
    expect(ids(buildRaceActs(normalizePlan({ ...fixturePlan('three'), game: 'race', round: 'нет такого' })).acts)).toHaveLength(5)
    expect(pickRound([{ id: 'sprint' }, { id: 'summary' }], 'sprint')).toEqual([{ id: 'sprint' }])
  })
  it('«два этапа + финал» (round = stages): разгон, слушай и лови и итог — без вершины и спуска; план его принимает, плашки реплики race_start нет', () => {
    expect(STAGES_ROUND).toBe('stages'); expect(isRound('stages')).toBe(true); expect(isRound('нет')).toBe(false)
    const plan = race('three', { round: STAGES_ROUND })
    expect(plan.round).toBe('stages')
    expect(ids(buildRaceActs(plan).acts)).toEqual(['sprint', 'catch', 'summary'])
    expect(pickRound([{ id: 'sprint' }, { id: 'catch' }, { id: 'climb' }, { id: 'descent' }, { id: 'summary' }], STAGES_ROUND).map(a => a.id)).toEqual(['sprint', 'catch', 'summary'])
  })
  it('случайности — только от семени: Math.random в рецепте нет, одно семя — один и тот же рецепт', () => {
    const a = JSON.stringify(buildRaceActs(race('three')).acts), b = JSON.stringify(buildRaceActs(race('three')).acts)
    expect(a).toBe(b)
  })
})
