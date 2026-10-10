import { describe, it, expect } from 'vitest'
import { formsOfWord, isInflectedWord, wrongFormsOfWord, coreOf } from './wordForms.js'
import { sameFamily } from './wordFamily.js'

describe('wordForms: родственные формы слова для закрытого словаря', () => {
  it('таблица главнее правил: trying → try / tried / tries; goes → go / going (без нелепых goeses)', () => {
    expect(formsOfWord('trying')).toEqual(['try', 'tried', 'tries'])
    expect(formsOfWord('goes')).toEqual(['go', 'going'])
    expect(formsOfWord('has')).toEqual(['have'])
    expect(formsOfWord('am')).toEqual(['is', 'are'])
  })
  it('мн. число и -s: cats → cat; shells → shell', () => {
    expect(formsOfWord('cats')).toEqual(['cat'])
    expect(formsOfWord('shells')).toEqual(['shell'])
    expect(formsOfWord('bus')).toEqual([]) // us / ss / is — не мн. число
  })
  it('обычное слово: -s / -ed / -ing с правилами (y→ies, e-drop, удвоение): play, try, like, stop', () => {
    expect(formsOfWord('play')).toEqual(['plays', 'played', 'playing'])
    expect(formsOfWord('try')).toEqual(['tries', 'tried', 'trying'])
    expect(formsOfWord('stop')).toEqual(['stops', 'stopped', 'stopping'])
    expect(formsOfWord('school')).toContain('schools')
  })
  it('неправильные глаголы: see → saw / seen; формы по правилам из одной «семьи» (sameFamily)', () => {
    expect(formsOfWord('see')).toEqual(expect.arrayContaining(['saw', 'seen', 'sees']))
    for (const w of ['play', 'try', 'like', 'stop', 'cats', 'school']) for (const f of formsOfWord(w)) expect(sameFamily(f, w), `${w} → ${f}`).toBe(true)
  })
  it('служебные слова, короткие слова, сокращения и цифры формы не получают; слов без жалких форм нет в выдаче', () => {
    for (const w of ['the', 'to', 'I', "I'm", "it's", '2', '', null]) expect(formsOfWord(w)).toEqual([])
    expect(formsOfWord('Playing,')).toEqual(['play']) // регистр и знаки не мешают
  })
  it('не-слова из таблицы (goed, childs) в словарь не попадают; само слово и дубли — тоже нет', () => {
    expect(formsOfWord('went')).toEqual(['go'])
    expect(formsOfWord('children')).toEqual([])
    for (const w of ['going', 'try', 'cats', 'watches']) { const f = formsOfWord(w); expect(new Set(f).size).toBe(f.length); expect(f).not.toContain(w) }
  })
  it('isInflectedWord: слово уже в «изменённой» форме (когда ключевых слов нет)', () => {
    for (const w of ['trying', 'goes', 'cats', 'saw', 'am', 'played', 'has']) expect(isInflectedWord(w), w).toBe(true)
    for (const w of ['hello', 'world', 'school', 'the', 'bus', 'this']) expect(isInflectedWord(w), w).toBe(false)
  })
  it('прежний API пробы «Голос» на месте: wrongFormsOfWord / coreOf', () => {
    expect(wrongFormsOfWord('trying')).toEqual(['try', 'tried', 'tries'])
    expect(coreOf('Going,')).toBe('going')
  })
})
