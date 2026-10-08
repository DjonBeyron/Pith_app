import { describe, it, expect } from 'vitest'
import { blankPickWordKey, voiceWordsOn } from './fillBlanksVoice.js'

const fbData = (extra = {}) => ({
  template: 'He tr___s to ___ and\nher ___.',
  blanks: [
    { options: ['ie', 'y', 'ys'], answer: 'ie' },
    { options: ['cook', 'cooks'], answer: 'cook' },
    { options: ['Pizza', "mom's"], answer: 'Pizza' },
  ],
  voiceWords: true,
  ...extra,
})

describe('blankPickWordKey — что озвучить при выборе варианта', () => {
  it('верный выбор в слове → целое слово («tries», не «ie»)', () => {
    expect(blankPickWordKey({ fbData: fbData(), picked: {}, index: 0, value: 'ie' })).toBe('tries')
  })

  it('НЕВЕРНЫЙ выбор тоже озвучивается — целое слово с этим выбором', () => {
    expect(blankPickWordKey({ fbData: fbData(), picked: {}, index: 0, value: 'y' })).toBe('trys')
    expect(blankPickWordKey({ fbData: fbData(), picked: {}, index: 1, value: 'cooks' })).toBe('cooks')
  })

  it('регистр и апостроф приводятся к ключу библиотеки', () => {
    expect(blankPickWordKey({ fbData: fbData(), picked: {}, index: 2, value: 'Pizza' })).toBe('pizza')
    expect(blankPickWordKey({ fbData: fbData(), picked: {}, index: 2, value: 'mom’s' })).toBe("mom's")
  })

  it('смена выбора в том же пропуске: играет НОВОЕ значение, прежний выбор не мешает', () => {
    expect(blankPickWordKey({ fbData: fbData(), picked: { 0: 'ie' }, index: 0, value: 'ys' })).toBe('tryss')
  })

  it('другие пропуски того же слова берутся из выбора ученика, иначе верные', () => {
    const d = fbData({ template: 'He ___ie___ it', blanks: [
      { options: ['tr', 'cr'], answer: 'tr' }, { options: ['d', 's'], answer: 'd' },
    ] })
    expect(blankPickWordKey({ fbData: d, picked: {}, index: 0, value: 'cr' })).toBe('cried')
    expect(blankPickWordKey({ fbData: d, picked: { 1: 's' }, index: 0, value: 'tr' })).toBe('tries')
  })

  it('перенос \\n рядом не склеивает слова', () => {
    const d = fbData({ template: 'one\n___\ntwo', blanks: [{ options: ['go', 'goes'], answer: 'go' }] })
    expect(blankPickWordKey({ fbData: d, picked: {}, index: 0, value: 'goes' })).toBe('goes')
  })

  it('озвучка ВКЛЮЧЕНА по умолчанию: нет поля / undefined / true → слово; выключает только явное false', () => {
    const noField = fbData(); delete noField.voiceWords
    expect(voiceWordsOn(noField)).toBe(true)
    expect(blankPickWordKey({ fbData: noField, picked: {}, index: 0, value: 'ie' })).toBe('tries')
    expect(blankPickWordKey({ fbData: fbData({ voiceWords: undefined }), picked: {}, index: 0, value: 'ie' })).toBe('tries')
    expect(blankPickWordKey({ fbData: fbData({ voiceWords: null }), picked: {}, index: 0, value: 'ie' })).toBe('tries')
    expect(blankPickWordKey({ fbData: fbData({ voiceWords: false }), picked: {}, index: 0, value: 'ie' })).toBeNull()
    expect(voiceWordsOn({ voiceWords: false })).toBe(false)
    expect(voiceWordsOn(undefined)).toBe(true)
  })

  it('вариант из нескольких слов озвучивается целиком, а не по первому слову', () => {
    const d = fbData({ template: 'She ___ to cook.', blanks: [{ options: ['is going', 'goes'], answer: 'goes' }] })
    expect(blankPickWordKey({ fbData: d, picked: {}, index: 0, value: 'is going' })).toBe('is going')
    const d2 = fbData({ template: 'Is she ___?', blanks: [{ options: ['New York'], answer: 'New York' }] })
    expect(blankPickWordKey({ fbData: d2, picked: {}, index: 0, value: 'New York' })).toBe('new york')
  })

  it('кириллица, пусто, несуществующий пропуск → null (тишина)', () => {
    const d = fbData({ template: 'Я ___ тут', blanks: [{ options: ['был'], answer: 'был' }] })
    expect(blankPickWordKey({ fbData: d, picked: {}, index: 0, value: 'был' })).toBeNull()
    expect(blankPickWordKey({ fbData: fbData(), picked: {}, index: 0, value: '' })).toBeNull()
    expect(blankPickWordKey({ fbData: fbData(), picked: {}, index: 9, value: 'x' })).toBeNull()
  })
})
