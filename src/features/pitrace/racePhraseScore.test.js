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
  it('слова кандидатов без повторов', () => {
    expect(unionWords([A, B])).toEqual(['nice', 'to', 'meet', 'you', 'see'])
  })
})
