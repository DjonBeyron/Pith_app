import { describe, it, expect } from 'vitest'
import { checkWordingRules } from './lessonLintWording.js'
import { applyMarkup } from '../../../shared/lib/lessonMarkup.js'

const T = (ref, content, triggers = []) => ({ ref, type: 'text', data: applyMarkup({ content }), triggers })
const W = (ref, to) => ({ ref, type: 'word_choice', data: { options: [] }, triggers: [{ if: 'wrong', then: to }, { if: 'correct', then: 'z' }] })

describe('lessonLintWording', () => {
  it('R-quotes: кавычки не у перевода — замечание, у {t:«..»} — нет', () => {
    expect(checkWordingRules([T('a', 'нужно слово «я»')]).join()).toMatch(/R-quotes/)
    expect(checkWordingRules([T('a', 'нужно слово {w:я}')])).toEqual([])
    expect(checkWordingRules([T('a', '{g:I\'m} это {t:«я есть»}')])).toEqual([])
  })
  it('R-tense: время без подчёркивания — замечание', () => {
    expect(checkWordingRules([T('a', 'это настоящее время')]).join()).toMatch(/R-tense/)
    expect(checkWordingRules([T('a', 'это {u:настоящее время}')])).toEqual([])
  })
  it('R-retry: «ещё раз» в ветке ошибки', () => {
    const nodes = [W('q', 'h'), T('h', 'не совсем) ещё раз?'), T('z', 'ок')]
    expect(checkWordingRules(nodes).join()).toMatch(/R-retry/)
    expect(checkWordingRules([W('q', 'h'), T('h', 'не совсем) нужно сказать I\'m'), T('z', 'ок')])).toEqual([])
  })
  it('R-wording: «почти» в большинстве подсказок', () => {
    const mk = (open) => [...[1, 2, 3, 4, 5].map(i => W('q' + i, 'h' + i)), ...[1, 2, 3, 4, 5].map(i => T('h' + i, open(i) + ') ок')), T('z', 'ок')]
    expect(checkWordingRules(mk(() => 'почти')).join()).toMatch(/R-wording/)
    expect(checkWordingRules(mk(i => (i < 2 ? 'почти' : 'не совсем')))).toEqual([])
  })
})
