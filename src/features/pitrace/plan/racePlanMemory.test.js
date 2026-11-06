import { describe, it, expect } from 'vitest'
import { buildMemoryPlan } from './racePlanMemory.js'
import { normalizePhrases, MAX_PHRASES } from './racePhraseNorm.js'
import { normalizePlan, memoryPlan } from '../../rehearsal/rehearsalPlan.js'
import { planFor } from '../../rehearsal/rehearsalFixtures.js'
import { extrasOf } from '../raceWords.js'
import { standbyWords, standbyPhraseWords, STANDBY_WORDS } from '../raceStandby.js'
import { BASE, row, deps } from './racePlanTestData.js'

describe('buildMemoryPlan: контракт plan.phrases / plan.extraWords', () => {
  it('база сохраняется, game race, source memory, phrases и extraWords', () => {
    const plan = buildMemoryPlan({ base: { ...BASE, round: 'sprint' }, deps: deps({ memory: [row('morning', 2)] }) })
    expect(plan).toMatchObject({ phrase: BASE.phrase, seed: 's1', round: 'sprint', game: 'race', source: 'memory' })
    expect(plan.phrases[0]).toEqual({
      id: 'm1', text: 'Nice to meet you', key: 'nice to meet you', own: true, level: 0, audio: null, ru: 'перевод Nice to meet you',
      words: [{ text: 'nice', translation: 'пер-nice', level: 0 }, { text: 'meet', translation: 'пер-meet', level: 0 }, { text: 'you', translation: 'пер-you', level: 0 }],
    })
    expect(plan.extraWords[0]).toEqual({ text: 'morning', translation: 'пер-morning', level: 1, due: false, lapses: 0 })
  })
  it('пустые данные — не падает, три фразы', () => {
    expect(buildMemoryPlan({ base: BASE, deps: {} }).phrases).toHaveLength(3)
  })
})

describe('normalizePlan принимает phrases', () => {
  it('memoryPlan → нормализованный план с phrases ≤ 6 и полями контракта', () => {
    const plan = memoryPlan({ ...BASE, game: 'race' }, deps({ memory: [row('you', 3), row('good', 3)] }))
    expect(plan.source).toBe('memory')
    expect(plan.phrases).toHaveLength(6)
    expect(Object.keys(plan.phrases[0]).sort()).toEqual(['audio', 'id', 'key', 'level', 'own', 'ru', 'text', 'words'])
    expect(plan.extraWords.length).toBeLessThanOrEqual(12)
  })
  it('мусор отбрасывается, повторы схлопываются, ≤ 6', () => {
    const raw = [{ text: 'Hi there', words: ['hi', { text: 'there', level: 9 }], audio: { url: 'u', duration: -1 } }, { text: 'hi  there!' }, null, { text: '' },
      ...Array.from({ length: 8 }, (_, i) => ({ text: `Phrase ${i}`, own: 1 }))]
    const list = normalizePhrases(raw)
    expect(list).toHaveLength(MAX_PHRASES)
    expect(list[0]).toEqual({ id: 'plan:hi there', text: 'Hi there', key: 'hi there', words: [{ text: 'hi', translation: '', level: 0 }, { text: 'there', translation: '', level: 4 }], ru: '', own: false, level: 0, audio: { url: 'u', duration: null } })
    expect(list[1].own).toBe(true)
  })
  it('не гонка — phrases нет', () => {
    expect(normalizePlan({ ...BASE, phrases: [{ text: 'x' }] }).phrases).toBeUndefined()
  })
  it("planFor('memory') — фикстура как план урока; без данных — null", () => {
    expect(planFor('memory')).toBeNull()
    const plan = planFor('memory', { fixture: 'two', deps: deps() })
    expect(plan.phrases[0].id).toBe('m1')
  })
})

describe('добор слов из дежурных фраз', () => {
  const plan = normalizePlan({ ...BASE, game: 'race', extraWords: [{ text: 'morning', translation: 'утро' }], phrases: [
    { text: 'Nice to meet you', own: true, words: [{ text: 'nice', translation: 'приятно' }] },
    { text: 'How old are you', own: false, words: [{ text: 'how', translation: 'как', level: 2 }, { text: 'old', translation: 'старый' }, { text: 'are' }] },
    { text: 'Thank you', own: false, words: [{ text: 'thank', translation: 'спасибо' }] },
  ] })
  it('extrasOf: extraWords, потом слова дежурных фраз, потом старый запас', () => {
    const texts = extrasOf(plan).map(w => w.text)
    expect(texts.slice(0, 4)).toEqual(['morning', 'how', 'old', 'thank'])
    expect(texts).not.toContain('nice') // своя фраза — не дежурная (и слово фразы плана)
  })
  it('standbyWords: слова дежурных фраз вместо STANDBY_WORDS', () => {
    expect(standbyPhraseWords(plan).map(w => w.text)).toEqual(['how', 'old', 'thank'])
    expect(standbyWords([], plan).map(w => w.text)).toEqual(['how', 'old', 'thank'])
    expect(standbyWords(['how'], plan).map(w => w.text)).toEqual(['old', 'thank', ...STANDBY_WORDS.map(w => w.text)])
    expect(standbyWords([]).map(w => w.text)).toEqual(STANDBY_WORDS.map(w => w.text))
  })
})
