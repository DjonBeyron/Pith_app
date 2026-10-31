import { describe, it, expect } from 'vitest'
import { buildActs, backSteps, MANY_MISSES, CLEAR_TAG, NORMAL_TAG } from './rehearsalRecipe.js'
import { fixturePlan } from './rehearsalFixtures.js'
import { normalizePlan } from './rehearsalPlan.js'
import { baseLineId } from './rehearsalLines.js'

const P = (id, seed = 'd') => ({ ...fixturePlan(id), seed }) // семя 'd': разминка learn → trying, «чётко» → «обычно», при «застрял» слово → перевод, читка — вариант c

const ids = acts => acts.map(a => a.id)

// Рецепт репетиции (CONCEPT_REHEARSAL.md §3 + решения §6): акты и ступени из плана
describe('акты', () => {
  it('три куска с двойником: разминка → читка → сборка → без текста → «Различи» → дубль → зеркало → итог', () => {
    expect(ids(buildActs(fixturePlan('three')).acts)).toEqual(['warmup', 'read', 'build', 'blind', 'discern', 'take', 'mirror', 'summary'])
  })
  it('без двойников акта «Различи» нет', () => {
    expect(ids(buildActs(fixturePlan('two')).acts)).toEqual(['warmup', 'read', 'build', 'blind', 'take', 'mirror', 'summary'])
  })
  it('одно слово: разминка и сборка схлопнуты в «слово ×2», читки нет, «без текста» — слово по переводу', () => {
    const { acts } = buildActs(fixturePlan('one'))
    expect(ids(acts)).toEqual(['word', 'blind', 'discern', 'take', 'mirror', 'summary'])
    expect(acts[0]).toMatchObject({ reps: 2 })
    expect(acts[0].words).toHaveLength(1)
    expect(acts[1].word.text).toBe('remember')
    expect(acts[1].passes).toHaveLength(1)
  })
  it('фраза без слов «к повтору»: разминка на двух любых словах', () => {
    const w = buildActs(fixturePlan('none')).acts[0].words
    expect(w.map(x => x.text)).toEqual(['where', 'from'])
  })
})

describe('сборка с конца (решения §6 п. 1, 4)', () => {
  it('ступени [2] → [1,2] → [0,1,2]; для двух кусков [1] → [0,1]', () => {
    expect(backSteps(3)).toEqual([[2], [1, 2], [0, 1, 2]])
    expect(backSteps(2)).toEqual([[1], [0, 1]])
    const build = buildActs(fixturePlan('three')).acts.find(a => a.id === 'build')
    expect(build.steps.map(s => s.parts)).toEqual([[2], [1, 2]])
    expect(build.steps.every(s => s.retry)).toBe(true)
    expect(build.final.parts).toEqual([0, 1, 2])
  })
  it('последняя ступень — человек ×2: «чётко» → «обычно», ярлыки — «Чётко — для последнего ряда» и «Обычно»', () => {
    const { final } = buildActs(P('three')).acts.find(a => a.id === 'build')
    expect(final.passes.map(p => [p.tag, baseLineId(p.line)])).toEqual([[CLEAR_TAG, 'rh_clear'], [NORMAL_TAG, 'rh_normal']])
    expect(CLEAR_TAG).toBe('Чётко — для последнего ряда')
  })
})

describe('правила пропуска и сокращения', () => {
  it('«без текста»: второй проход — только пока промахов мало (cond few), подсказка — первое слово первого куска', () => {
    const blind = buildActs(P('three')).acts.find(a => a.id === 'blind')
    expect(blind.passes).toEqual([{ id: 'blind-0', hintKinds: ['word', 'tr'] }, { id: 'blind-1', cond: { few: true }, hintKinds: ['tr', 'word'] }]) // какая подсказка первая — по семени, второй проход наоборот
    expect(blind).toMatchObject({ hintWord: "I'm", hintLane: 0 })
    expect(MANY_MISSES).toBe(3)
  })
  it('«Различи» — тоже только пока промахов мало', () => {
    expect(buildActs(fixturePlan('three')).acts.find(a => a.id === 'discern').cond).toEqual({ few: true })
  })
  it('нет озвучки кусков — читка без подсветки', () => {
    expect(buildActs(fixturePlan('three'), { hasVoice: false }).acts.find(a => a.id === 'read').highlight).toBe(false)
    expect(buildActs(fixturePlan('three'), { hasVoice: true }).acts.find(a => a.id === 'read').highlight).toBe(true)
  })
  it('читка: Пит говорит, зачем она (решение §6 п. 2)', () => {
    expect(baseLineId(buildActs(fixturePlan('three')).acts.find(a => a.id === 'read').line)).toBe('rh_read_why')
  })
  it('план без слов вообще — разминка всё равно из слов фразы', () => {
    const w = buildActs(normalizePlan({ phrase: 'Where | are you | from' })).acts[0].words
    expect(w).toHaveLength(2)
  })
})
