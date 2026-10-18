import { describe, it, expect } from 'vitest'
import { wordChoiceVoiceKey, phraseAnswerVoiceKey } from './correctVoiceKeys.js'
import { collectLessonWords } from './collectLessonWords.js'

const opt = (text, isCorrect = true) => ({ text, isCorrect })

describe('озвучка верного ответа: что звучит', () => {
  it('«Выбери слово»: английский верный вариант озвучивается по умолчанию, русский — нет', () => {
    expect(wordChoiceVoiceKey({}, opt('to'))).toBe('to')
    expect(wordChoiceVoiceKey({}, opt('Нам нужно уйти'))).toBe(null)
    expect(wordChoiceVoiceKey({}, opt('to', false))).toBe(null)
  })
  it('voiceCorrect: false выключает; true на русском работает только с английской фразой', () => {
    expect(wordChoiceVoiceKey({ voiceCorrect: false }, opt('to'))).toBe(null)
    expect(wordChoiceVoiceKey({ voiceCorrect: true }, opt('Нам нужно уйти'))).toBe(null)
    expect(wordChoiceVoiceKey({ voiceCorrect: true, voicePhrase: 'We need to leave' }, opt('Нам нужно уйти'))).toBe('we need to leave')
    expect(wordChoiceVoiceKey({ voicePhrase: 'We need to leave' }, opt('Нам нужно уйти'))).toBe(null) // без галочки фраза молчит
  })
  it('«Собери фразу»: нет поля — озвучиваем фразу целиком; false — тишина', () => {
    expect(phraseAnswerVoiceKey({}, ['I', 'need', 'to', 'eat'])).toBe('i need to eat')
    expect(phraseAnswerVoiceKey({ voiceAnswer: false }, ['I', 'need'])).toBe(null)
    expect(phraseAnswerVoiceKey({}, [])).toBe(null)
  })
  it('библиотека слов получает фразу целиком (все верные порядки) и voicePhrase', () => {
    const nodes = [
      { type: 'phrase_assembly', typeData: { phrase_assembly: { words: ['I', 'eat'], answers: [['Eat', 'I']], distractors: [{ text: 'too' }] } } },
      { type: 'phrase_assembly', typeData: { phrase_assembly: { words: ['We', 'go'], voiceAnswer: false } } },
      { type: 'word_choice', typeData: { word_choice: { options: [opt('Нам нужно уйти')], voiceCorrect: true, voicePhrase: 'We need to leave' } } },
    ]
    const keys = [...collectLessonWords(nodes).keys()]
    expect(keys).toEqual(expect.arrayContaining(['i eat', 'eat i', 'i', 'too', 'we need to leave']))
    expect(keys).not.toContain('we go')
  })
})
