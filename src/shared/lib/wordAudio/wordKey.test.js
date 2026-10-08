import { describe, it, expect } from 'vitest'
import { wordKey, cleanWordText } from './wordKey.js'
import { collectLessonWords, blankWord } from './collectLessonWords.js'
import { missingWordAudio } from './wordAudioApi.js'

describe('wordKey — ключ слова в библиотеке озвучки', () => {
  it('регистр и пунктуация по краям не различают слова', () => {
    expect(wordKey('He')).toBe('he')
    expect(wordKey('he,')).toBe('he')
    expect(wordKey('  he.  ')).toBe('he')
    expect(wordKey('"Hello!"')).toBe('hello')
    expect(wordKey('again…')).toBe('again')
  })

  it('апострофы и дефисы — часть слова, типографский апостроф приводится к прямому', () => {
    expect(wordKey("don't")).toBe("don't")
    expect(wordKey('don’t')).toBe("don't")
    expect(wordKey('well-known')).toBe('well-known')
    expect(wordKey("don't")).not.toBe(wordKey('dont'))
  })

  it('чип из нескольких слов — один ключ, пробелы схлопнуты', () => {
    expect(wordKey('New   York')).toBe('new york')
    expect(wordKey('going to')).toBe('going to')
  })

  it('кириллица, смешанные строки, пусто и цифры без букв — не озвучиваются (null)', () => {
    expect(wordKey('торт')).toBeNull()
    expect(wordKey('cake — торт')).toBeNull()
    expect(wordKey('cake (торт)')).toBeNull()
    expect(wordKey('')).toBeNull()
    expect(wordKey('   ')).toBeNull()
    expect(wordKey('...')).toBeNull()
    expect(wordKey('42')).toBeNull()
    expect(wordKey(null)).toBeNull()
  })

  it('cleanWordText сохраняет регистр для показа', () => {
    expect(cleanWordText('  He,  ')).toBe('He')
    expect(cleanWordText('New   York.')).toBe('New York')
  })
})

describe('blankWord — целое слово с пропуском в «Составь предложение»', () => {
  it('пропуск внутри слова даёт всё слово, пропуск-слово — сам ответ', () => {
    const blanks = [{ answer: 'ie' }, { answer: 'again' }]
    expect(blankWord('She tr___s ___.', blanks, 0)).toBe('tries')
    expect(blankWord('She tr___s ___.', blanks, 1)).toBe('again.')
    expect(wordKey(blankWord('She tr___s ___.', blanks, 0))).toBe('tries')
  })
})

describe('collectLessonWords — слова урока для озвучки', () => {
  const nodes = [
    { type: 'text', typeData: { text: { content: 'Hello there' } } },
    { type: 'phrase_assembly', typeData: { phrase_assembly: {
      words: ['I', 'am', 'here.'], distractors: [{ id: 'd1', text: 'is' }],
    } } },
    { type: 'table', typeData: { table: {
      answer: 'he tries again',
      table: { cells: [
        { id: 'c1', value: 'he' },
        { id: 'c2', value: 'tries', options: ['tries', 'try', 'tried'] },
        { id: 'c3', value: 'он' },
      ] },
      distractors: [{ id: 'd2', text: 'pizza' }],
    } } },
    { type: 'fill_blanks', typeData: { fill_blanks: {
      template: 'She tr___s to ___.', blanks: [{ answer: 'ie', options: ['ie', 'y'] }, { answer: 'cook', options: ['cook', 'cooks'] }],
    } } },
    { type: 'word_choice', typeData: { word_choice: { options: [
      { id: 'o1', text: 'goes', isCorrect: true }, { id: 'o2', text: 'go', isCorrect: false },
    ] } } },
  ]

  it('собирает слова из четырёх типов нод, без дублей, только латиницу', () => {
    const m = collectLessonWords(nodes)
    expect([...m.keys()].sort()).toEqual([
      'again', 'am', 'cook', 'cooks', 'goes', 'he', 'here', 'i', 'is', 'pizza', 'tried', 'tries', 'try', 'trys',
    ])
    expect(m.get('here')).toBe('here')       // пунктуация снята
    expect(m.get('i')).toBe('I')             // показ — как в уроке
    expect(m.has('он')).toBe(false)          // кириллица пропущена
    expect(m.has('go')).toBe(false)          // неверный вариант «выбери слово» не озвучивается
    expect(m.has('hello')).toBe(false)       // текстовые ноды не участвуют
  })

  it('type_word: печатаемое слово озвучивается, дополнительные буквы — нет', () => {
    const m = collectLessonWords([{ type: 'type_word', typeData: { type_word: { word: 'Tries', extraLetters: 'xz' } } }])
    expect([...m.keys()]).toEqual(['tries'])
  })

  it('missingWordAudio — чего в базе нет', () => {
    const wanted = collectLessonWords(nodes)
    const lib = new Map([['he', { key: 'he' }], ['tries', { key: 'tries' }]])
    const missing = missingWordAudio(wanted, lib)
    expect(missing.has('he')).toBe(false)
    expect(missing.has('again')).toBe(true)
    expect(missing.size).toBe(wanted.size - 2)
  })
})

describe('fill_blanks: слова с принудительными переносами \\n', () => {
  const fb = (template, blanks) => [{ type: 'fill_blanks', typeData: { fill_blanks: { template, blanks } } }]

  it('blankWord: \\n делит слова, как пробел («one\\ntwo» — два слова)', () => {
    expect(blankWord('one\n___\ntwo', [{ answer: 'x' }], 0)).toBe('x')
    expect(blankWord('go to\ntr___s\nnow', [{ answer: 'ie' }], 0)).toBe('tries')
    expect(blankWord('one\ntr___', [{ answer: 'y' }], 0)).toBe('try')
  })

  it('blankWord: подстановка values вместо верного ответа; остальные пропуски слова — верные', () => {
    const blanks = [{ answer: 'ie' }, { answer: 's' }]
    expect(blankWord('tr___\n___', blanks, 0, { 0: 'y' })).toBe('try')
    expect(blankWord('tr___ed ___', blanks, 0, { 0: 'y' })).toBe('tryed')
  })

  it('collectLessonWords: слова вокруг \\n не склеиваются, берутся все варианты меню', () => {
    const m = collectLessonWords(fb('She\ncook___\nnow', [{ answer: 's', options: ['s', 'ed'] }]))
    expect([...m.keys()].sort()).toEqual(['cooked', 'cooks'])
  })
})
