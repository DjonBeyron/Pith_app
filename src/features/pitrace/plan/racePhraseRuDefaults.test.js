import { describe, it, expect } from 'vitest'
import { defaultPhraseRu, PHRASE_RU_DEFAULTS } from './racePhraseRuDefaults.js'
import { phraseRu } from './racePhraseOf.js'
import { normText } from '../../player/modules/rotate-phone/wordLaneRecipe.js'

describe('черновики смысла фраз', () => {
  it('ключ — normText фразы; ищется и по тексту, и по ключу; это намерение, а не перевод (без заглавной, без точки)', () => {
    expect(defaultPhraseRu("Let's go to your place")).toBe('предложи поехать к нему домой')
    expect(defaultPhraseRu(normText("I'm gonna go to sleep"))).toBe('скажи, что собираешься спать')
    expect(defaultPhraseRu('Something unknown')).toBe('')
    for (const ru of PHRASE_RU_DEFAULTS.values()) { expect(ru).toMatch(/^[а-яё]/); expect(ru).not.toMatch(/[.!]$/) }
  })
  it('порядок источников: правка админа → черновик → перевод названия', () => {
    const key = normText('Nice to meet you')
    expect(phraseRu({ [key]: 'поздоровайся' }, key, 'Приятно познакомиться')).toBe('поздоровайся')
    expect(phraseRu({}, key, 'Приятно познакомиться')).toBe('скажи, что рад знакомству')
    expect(phraseRu({}, normText('Something unknown'), 'Что-то')).toBe('Что-то')
  })
})
