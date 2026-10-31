import { describe, it, expect } from 'vitest'
import { discernLayout, describeLayout } from './rehearsalDiscern.js'
import { buildActs } from './rehearsalRecipe.js'
import { fixturePlan } from './rehearsalFixtures.js'
import { phraseWords } from './rehearsalPlan.js'

const SEEDS = Array.from({ length: 40 }, (_, i) => `seed-${i}`)
const learn = { text: 'learn', confusers: ['earn', 'lean'] }
const shown = p => p.texts.filter(Boolean).sort()

// «Различи» (CONCEPT_REHEARSAL.md §3, §8; решение владельца v3.3.85): ВСЕГДА три дорожки — слово и два других
describe('discernLayout: три дорожки в каждой подсказке', () => {
  it('два двойника: обе подсказки — слово и оба двойника на трёх дорожках; верное слово на случайной дорожке, во второй подсказке на другой', () => {
    const answers = new Set()
    for (const seed of SEEDS) {
      const prompts = discernLayout(learn, seed, 0)
      expect(prompts).toHaveLength(2)
      for (const p of prompts) {
        expect(shown(p)).toEqual(['earn', 'lean', 'learn']); expect(p.slots).toEqual([0, 1, 2])
        expect(p.texts[p.answer[0]]).toBe('learn'); answers.add(p.answer[0])
      }
      expect(prompts[0].answer[0]).not.toBe(prompts[1].answer[0])
    }
    expect(answers).toEqual(new Set([0, 1, 2])) // верная дорожка — любая из трёх
  })
  it('один двойник: две других дорожки добиваются словами фразы (не само слово и не двойник); без pool — две дорожки', () => {
    const remember = { text: 'learn', confusers: ['earn'] }
    const pool = phraseWords(["I'm", 'trying', 'to learn'])
    const fillers = new Set()
    for (const seed of SEEDS) for (const p of discernLayout(remember, seed, 0, pool)) {
      const t = shown(p)
      expect(t).toHaveLength(3); expect(t).toContain('earn'); expect(t).toContain('learn'); expect(p.slots).toEqual([0, 1, 2])
      fillers.add(t.find(x => x !== 'earn' && x !== 'learn')); expect(t.filter(x => x === 'learn')).toHaveLength(1)
    }
    expect(fillers.size).toBeGreaterThan(1); expect(fillers).toEqual(new Set(["I'm", 'trying', 'to']))
    const bare = discernLayout({ text: 'remember', confusers: ['remind'] }, 's', 0)
    expect(bare.every(p => p.slots.join() === '0,1')).toBe(true); expect(shown(bare[0])).toEqual(['remember', 'remind']) // нечем добить: всего два слова
    expect(bare[0].answer[0]).not.toBe(bare[1].answer[0])
  })
  it('без двойников подсказок нет; формат как у discernPrompts; одно семя — одна раскладка', () => {
    expect(discernLayout({ text: 'x', confusers: [] }, 's', 0)).toEqual([])
    const p = discernLayout(learn, 's', 0)
    expect(p[0]).toMatchObject({ id: 'discern-0-0', parts: [0], text: 'learn' }); expect(p[0].stagger).toBeGreaterThan(0); expect(p[0].lead).toBeGreaterThan(0)
    expect(discernLayout(learn, 's', 0)).toEqual(p)
    expect(describeLayout(discernLayout({ text: 'learn', confusers: ['earn'] }, 's', 0, ['learn', 'to']))).toMatch(/^(earn\+to|to\+earn)→\d, (earn\+to|to\+earn)→\d$/)
  })
  it('в рецепте раскладка трёхдорожечная, а добивка берётся из слов фразы (pool)', () => {
    for (const seed of ['a', 'b', 'c']) {
      const d = buildActs({ ...fixturePlan('three'), seed }).acts.find(a => a.id === 'discern')
      expect(d.words[0].prompts.every(p => p.slots.length === 3)).toBe(true)
    }
    const plan = { ...fixturePlan('three'), seed: 'a', words: [{ text: 'learn', translation: '', due: true, lapses: 1, confusers: ['earn'] }] }
    const prompts = buildActs(plan).acts.find(a => a.id === 'discern').words[0].prompts
    expect(prompts.every(p => p.slots.length === 3 && p.texts.filter(Boolean).every(t => ['learn', 'earn', "I'm", 'trying', 'to'].includes(t)))).toBe(true)
  })
})
