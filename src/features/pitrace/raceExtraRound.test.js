import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { round2Words, failedIn, weakIn, isLate, LATE_Y, EXTRA_FILL, ROUND2_BOOST, ROUND2_STEP } from './raceExtraRound.js'
import { buildRaceStages } from './raceStages.js'
import { miaAfterPass } from './mia/miaRound.js'
import { miaInit } from './mia/raceMia.js'
import { sprintWords } from './raceWords.js'
import { standbyWords, STANDBY_WORDS } from './raceStandby.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'

const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const words = sprintWords(plan) // 6 слов: 3 слова плана и 3 дежурных
const ok = { hit: true, miss: false }
const allOk = () => Object.fromEntries(words.map((_, i) => [i, ok]))
const weakAt = (...idx) => ({ ...allOk(), ...Object.fromEntries(idx.map(i => [i, { hit: false, miss: false }])) })

describe('дополнительный круг: слабые слова', () => {
  it('failedIn: нет результата, не сказал и сказал не то — ошибка; верно — нет', () => {
    expect(failedIn(undefined)).toBe(true); expect(failedIn({ hit: false, miss: false })).toBe(true); expect(failedIn({ hit: true, miss: true })).toBe(true); expect(failedIn(ok)).toBe(false)
  })
  it('поздний ответ — слабое слово: засчитан, но пилюля ниже 80 % экрана (isLate по положению пилюли)', () => {
    expect(LATE_Y).toBe(80)
    expect(isLate(79.9)).toBe(false); expect(isLate(80)).toBe(false); expect(isLate(80.1)).toBe(true); expect(isLate(undefined)).toBe(false); expect(isLate(NaN)).toBe(false)
    expect(weakIn({ hit: true, late: true })).toBe(true); expect(weakIn(ok)).toBe(false); expect(weakIn(undefined)).toBe(true)
  })
  it('0 слабых слов — круга нет', () => { expect(round2Words(words, allOk(), plan.seed)).toEqual([]) })
  it('1 слабое слово (ошибка, молчание или поздний ответ) — круга нет', () => {
    expect(round2Words(words, weakAt(0), plan.seed)).toEqual([])
    expect(round2Words(words, { ...allOk(), 1: { hit: false, miss: true } }, plan.seed)).toEqual([])
    expect(round2Words(words, { ...allOk(), 2: { hit: true, late: true } }, plan.seed)).toEqual([])
  })
  it('2 слабых слова — круг из этих двух + 3 удавшихся слова, вперемешку; поздний ответ считается слабым', () => {
    for (const results of [weakAt(0, 1), { ...allOk(), 0: { hit: false, miss: false }, 1: { hit: true, late: true } }]) {
      const r2 = round2Words(words, results, plan.seed)
      const weak = new Set([words[0].text, words[1].text])
      expect(r2).toHaveLength(2 + EXTRA_FILL)
      expect(r2.filter(w => weak.has(w.text))).toHaveLength(2)
      r2.filter(w => !weak.has(w.text)).forEach(w => expect(words.map(x => x.text)).toContain(w.text)) // добор — удавшиеся слова прохода
      expect(r2).toEqual(round2Words(words, results, plan.seed)) // от семени
    }
  })
  it('скорость старта на 10 % выше конца прохода, дальше +5 % на пилюлю; дорожки по очереди', () => {
    const r2 = round2Words(words, weakAt(0, 1), plan.seed)
    const last = Math.max(...words.map(w => w.speed))
    expect(r2[0].speed).toBeCloseTo(last * ROUND2_BOOST, 3)
    r2.forEach((w, i) => { expect(w.idx).toBe(i); expect(w.lane).toBe(i % 3); if (i) expect(w.speed / r2[i - 1].speed).toBeCloseTo(ROUND2_STEP, 2) })
  })
  it('удавшихся меньше трёх — подмешиваются дежурные слова (не из слов прохода, без повторов)', () => {
    const own = words.slice(0, 4) // в проходе четыре слова: два слабых, два удавшихся
    const results = { 0: { hit: false, miss: false }, 1: { hit: false, miss: false }, 2: ok, 3: ok }
    const duty = standbyWords(own)
    const r2 = round2Words(own, results, plan.seed, 'race-sprint-2', duty)
    expect(r2).toHaveLength(2 + EXTRA_FILL)
    const texts = r2.map(w => w.text); expect(new Set(texts).size).toBe(texts.length)
    const dutyTexts = new Set(duty.map(w => w.text)); expect(r2.filter(w => dutyTexts.has(w.text))).toHaveLength(1) // 3 = 2 удавшихся + 1 дежурное
    expect(r2.filter(w => own[2].text === w.text || own[3].text === w.text)).toHaveLength(2) // удавшиеся идут раньше дежурных
    const none = round2Words(own, results, plan.seed) // дежурных нет — только то, что есть
    expect(none).toHaveLength(2 + 2)
  })
  it('удавшихся нет совсем — круг из слабых и трёх дежурных', () => {
    const own = words.slice(0, 3)
    const r2 = round2Words(own, { 0: { hit: false }, 1: { hit: false }, 2: { hit: false } }, plan.seed, 'race-sprint-2', standbyWords(own))
    expect(r2).toHaveLength(3 + EXTRA_FILL)
  })
  it('дежурные слова: пять, с переводом и ступенью памяти; свои слова плана исключаются', () => {
    expect(STANDBY_WORDS).toHaveLength(5)
    STANDBY_WORDS.forEach(w => { expect(w.translation).toBeTruthy(); expect(w.level).toBeGreaterThanOrEqual(0); expect(w.level).toBeLessThanOrEqual(4) })
    expect(standbyWords([{ text: 'Meet' }, 'nice'])).toHaveLength(3)
  })
})

describe('после прохода: Мия вместо дополнительного круга (miaAfterPass)', () => {
  for (const act of ['sprint', 'catch']) {
    it(`${act}: меньше двух слабых слов — мимо (-1); два и больше — церемония Мии, слова вписаны в её круг; второй круг от Пита убран`, () => {
      const { stages } = buildRaceStages({ plan })
      const first = stages.find(s => s.sid === act), mia = stages.find(s => s.sid === `${act}3`), ann = stages.find(s => s.sid === `${act}3-intro-ann`)
      expect(stages.some(s => s.sid === `${act}2` || s.sid === `${act}2-ann`)).toBe(false)
      const clean = { results: Object.fromEntries(first.words.map((_, i) => [i, ok])) }
      expect(miaAfterPass(stages, first, clean, plan.seed, miaInit())).toBe(-1)
      const one = { results: { ...clean.results, 0: { hit: false, miss: true } } } // одно слабое слово — круга нет
      expect(miaAfterPass(stages, first, one, plan.seed, miaInit())).toBe(-1)
      const two = { results: { ...clean.results, 0: { hit: false, miss: true }, 1: { hit: true, late: true } } }
      expect(miaAfterPass(stages, first, two, plan.seed, miaInit())).toBe(stages.indexOf(ann))
      expect(mia.words).toHaveLength(2 + EXTRA_FILL); expect(mia.step.reps).toHaveLength(mia.words.length); expect(mia.step.id).toBe(`${act}3`)
      expect(miaAfterPass(stages, first, two, plan.seed, { ...miaInit(), used: { [act === 'sprint' ? 'catch' : 'sprint']: true } })).toBe(-1) // Мия уже была в этой игре — второй раз не приходит
      expect(miaAfterPass(stages, stages[0], two, plan.seed, miaInit())).toBe(-1) // не проход — обычный порядок
    })
  }
  it('проход B: добор из дежурных слов получает поля прохода (не ловушка)', () => {
    const { stages } = buildRaceStages({ plan })
    const first = stages.find(s => s.sid === 'catch'), mia = stages.find(s => s.sid === 'catch3')
    first.standby.forEach(w => { expect(w.trap).toBe(false) })
    const all = { results: Object.fromEntries(first.words.map((_, i) => [i, { hit: false, miss: true }])) }
    miaAfterPass(stages, first, all, plan.seed, miaInit())
    expect(mia.words.length).toBeGreaterThanOrEqual(first.words.length)
  })
  it('без Math.random', () => { expect(readFileSync(new URL('./raceExtraRound.js', import.meta.url), 'utf8')).not.toMatch(/Math\.random\(/) })
})
