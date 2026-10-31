import { describe, it, expect } from 'vitest'
import { buildActs, backSteps, MANY_MISSES, CLEAR_TAG, NORMAL_TAG } from './rehearsalRecipe.js'
import { fixturePlan } from './rehearsalFixtures.js'
import { normalizePlan } from './rehearsalPlan.js'
import { baseLineId } from './rehearsalLines.js'

const P = (id, seed = 'd') => ({ ...fixturePlan(id), seed }) // семя 'd': разминка learn → trying, «чётко» → «обычно», при «застрял» слово → перевод, читка — вариант c

const ids = acts => acts.map(a => a.id)

// Рецепт репетиции (CONCEPT_REHEARSAL.md §3 + решения §6): акты и ступени из плана
describe('акты', () => {
  it('три куска с двойником: разминка → «Различи» → сборка → читка → без текста → дубль → зеркало → итог (v3.3.87)', () => {
    expect(ids(buildActs(fixturePlan('three')).acts)).toEqual(['warmup', 'discern', 'build', 'read', 'blind', 'take', 'mirror', 'summary'])
  })
  it('без двойников акта «Различи» нет', () => {
    expect(ids(buildActs(fixturePlan('two')).acts)).toEqual(['warmup', 'build', 'read', 'blind', 'take', 'mirror', 'summary'])
  })
  it('одно слово: разминка и сборка схлопнуты в «слово ×2», читки нет, «без текста» — слово по переводу', () => {
    const { acts } = buildActs(fixturePlan('one'))
    expect(ids(acts)).toEqual(['word', 'discern', 'blind', 'take', 'mirror', 'summary'])
    expect(acts[0]).toMatchObject({ reps: 2 })
    expect(acts[0].words).toHaveLength(1)
    expect(acts[2].word.text).toBe('remember')
    expect(acts[2].passes).toHaveLength(1)
  })
  it('фраза без слов «к повтору»: разминка на словах с карточкой, слов без карточки (are, you) нет', () => {
    const w = buildActs(fixturePlan('none')).acts[0].words
    expect(w.map(x => x.text).sort()).toEqual(['from', 'where'])
  })
  it('разминка: первым — самое просроченное, дальше слова «к повтору», и только потом остальные слова с карточкой (для любого семени); «to» (служебное) и слов без карточки нет', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const w = buildActs({ ...fixturePlan('three'), seed }).acts[0].words
      expect(w.map(x => x.due)).toEqual([true, true, false]); expect(w[0].text).toBe('learn'); expect(w.map(x => x.text).sort()).toEqual(["I'm", 'learn', 'trying'])
    }
  })
  it('«Различи» стоит сразу после разминки, а у одного слова — сразу после «слова ×2»; сборка → читка → без текста', () => {
    const order = id => ids(buildActs(fixturePlan(id)).acts)
    expect(order('three').slice(0, 3)).toEqual(['warmup', 'discern', 'build'])
    expect(order('three').indexOf('read')).toBe(order('three').indexOf('build') + 1)
    expect(order('three').indexOf('blind')).toBe(order('three').indexOf('read') + 1)
    expect(order('one').slice(0, 2)).toEqual(['word', 'discern'])
  })
  it('нет ни одного слова с карточкой — разминки нет, остальные акты на месте', () => {
    const acts = buildActs(normalizePlan({ phrase: 'Where | are you | from' })).acts
    expect(ids(acts)).toEqual(['build', 'read', 'blind', 'take', 'mirror', 'summary'])
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
  it('«Различи» стоит до «без текста», правило «много промахов» к нему не относится (v3.3.87): условия пропуска нет', () => {
    expect(buildActs(fixturePlan('three')).acts.find(a => a.id === 'discern').cond).toBeUndefined()
  })
  it('нет озвучки кусков — читка без подсветки', () => {
    expect(buildActs(fixturePlan('three'), { hasVoice: false }).acts.find(a => a.id === 'read').highlight).toBe(false)
    expect(buildActs(fixturePlan('three'), { hasVoice: true }).acts.find(a => a.id === 'read').highlight).toBe(true)
  })
  it('читка: Пит говорит, зачем она (решение §6 п. 2)', () => {
    expect(baseLineId(buildActs(fixturePlan('three')).acts.find(a => a.id === 'read').line)).toBe('rh_read_why')
  })
  it('служебное слово с карточкой в разминку не идёт', () => {
    const acts = buildActs(normalizePlan({ phrase: 'Where | are you | from', words: [{ text: 'are', translation: 'есть', due: true }, { text: 'you', translation: 'ты' }] })).acts
    expect(acts[0].words.map(x => x.text)).toEqual(['you'])
  })
})
