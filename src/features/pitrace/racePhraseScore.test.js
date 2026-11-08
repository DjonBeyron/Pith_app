import { describe, it, expect } from 'vitest'
import { scorePhrases, pickPhrase, wordHits, unionWords } from './racePhraseScore.js'

const A = { key: 'nice to meet you', words: ['nice', 'to', 'meet', 'you'] }
const B = { key: 'nice to see you', words: ['nice', 'to', 'see', 'you'] }
const C = { key: "i'm trying to learn", words: ["I'm", 'trying', 'to', 'learn'] }

describe('racePhraseScore', () => {
  it('доля — по словам кандидата: «I\'m» (два токена) — одно слово', () => {
    expect(wordHits(C.words, 'i am trying')).toEqual([true, true, false, false])
    expect(wordHits(C.words, "i'm trying to learn")).toEqual([true, true, true, true])
  })
  it('полное совпадение однозначно; общее начало — нет', () => {
    expect(pickPhrase(scorePhrases([A, B], 'nice to meet you'), false)?.key).toBe(A.key)
    expect(pickPhrase(scorePhrases([A, B], 'nice to you'), true)).toBe(null)
  })
  it('3 из 4 — только по итогу и при разрыве ≥ 0.25', () => {
    const s = scorePhrases([C, A], 'i am trying to')
    expect(pickPhrase(s, false)).toBe(null)
    expect(pickPhrase(s, true)).toMatchObject({ key: C.key, ratio: 0.75 })
  })
  it('сокращения двусторонне: «am» зажигает «I\'m», формы без апострофа, gonna / wanna / let\'s / don\'t / it\'s / you\'re', () => {
    expect(wordHits(C.words, 'am trying to learn')).toEqual([true, true, true, true]) // журнал владельца: Vosk слышит «am» вместо «I'm»
    expect(pickPhrase(scorePhrases([C, A], 'am trying to learn'), false)).toMatchObject({ key: C.key, ratio: 1 })
    expect(wordHits(C.words, 'im trying to learn')).toEqual([true, true, true, true])
    expect(wordHits(['I', 'am', 'here'], "i'm here")).toEqual([true, true, true])
    expect(wordHits(['I', 'am', 'here'], 'am here')).toEqual([false, true, true]) // «I» отдельным словом цели «am» не зажигает
    expect(wordHits(["You're", 'late'], 'you are late')).toEqual([true, true])
    expect(wordHits(['you', 'are', 'late'], 'youre late')).toEqual([true, true, true])
    expect(wordHits(["It's", 'fine'], 'it is fine')).toEqual([true, true]); expect(wordHits(['it', 'is', 'fine'], "it's fine")).toEqual([true, true, true])
    expect(wordHits(["Don't", 'go'], 'do not go')).toEqual([true, true]); expect(wordHits(["Don't", 'go'], 'dont go')).toEqual([true, true])
    expect(wordHits(['going', 'to', 'sleep'], 'gonna sleep')).toEqual([true, true, true]); expect(wordHits(['gonna', 'sleep'], 'going to sleep')).toEqual([true, true])
    expect(wordHits(['wanna', 'go'], 'want to go')).toEqual([true, true]); expect(wordHits(["Let's", 'go'], 'let us go')).toEqual([true, true]); expect(wordHits(["Let's", 'go'], 'lets go')).toEqual([true, true])
    expect(wordHits(["Don't", 'go'], 'do go')).toEqual([false, true]) // «do» без «not» — не «don't»
  })
  it('слова кандидатов без повторов', () => {
    expect(unionWords([A, B])).toEqual(['nice', 'to', 'meet', 'you', 'see'])
  })
})
