import { describe, it, expect } from 'vitest'
import { buildRaceActs, DESCENT_RATE } from './raceRecipe.js'
import { sprintWords, catchSets, climbWords, extrasOf, SPRINT_MIN, SPRINT_MAX, SPEED_STEP, CATCH_COUNT } from './raceWords.js'
import { pickRound, RACE_ROUNDS } from './raceOnly.js'
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
  it('слушай и лови: три захода; на каждом три дорожки с переводами — верное слово и два других; двойники слова — ловушками', () => {
    const plan = race('three')
    const sets = catchSets(plan)
    expect(sets).toHaveLength(CATCH_COUNT)
    for (const s of sets) {
      expect(s.slots).toEqual([0, 1, 2])
      expect(s.texts[s.answer]).toBe(s.text)
      expect(new Set(s.texts).size).toBe(3)
      expect(s.caps.every(Boolean)).toBe(true) // внутри каждой пилюли русский перевод
    }
    const learn = sets.find(s => s.text === 'learn')
    expect(learn.decoys).not.toContain('earn') // у двойника нет перевода — на пилюле был бы чужой английский текст и выдал бы ответ
    const trapped = race('three', { words: [{ text: 'learn', translation: 'учиться', due: true, confusers: ['earn', 'lean'] }, { text: 'earn', translation: 'зарабатывать' }, { text: 'lean', translation: 'наклоняться' }, { text: 'trying', translation: 'пытаюсь' }] })
    const t = catchSets(trapped).find(s => s.text === 'learn')
    expect(t.decoys.sort()).toEqual(['earn', 'lean']) // двойники из памяти с переводом едут ловушками вместо случайных слов
    expect(t.caps.sort()).toEqual(['зарабатывать', 'наклоняться', 'учиться'].sort())
    expect(sets[1].answer).not.toBe(sets[0].answer) // верное слово не на той же дорожке два захода подряд
    expect(buildRaceActs(plan).acts.find(a => a.id === 'catch').retries).toBe(1) // заход повторяется один раз
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
  it('случайности — только от семени: Math.random в рецепте нет, одно семя — один и тот же рецепт', () => {
    const a = JSON.stringify(buildRaceActs(race('three')).acts), b = JSON.stringify(buildRaceActs(race('three')).acts)
    expect(a).toBe(b)
  })
})
