import { describe, it, expect } from 'vitest'
import { typeWholeWord } from './solveCorrect.js'
import { typedMatches, typedMax } from '../../../../shared/lib/typeWordKeys.js'

describe('typeWholeWord — авто-ответ админа в «напечатай слово»', () => {
  it('слово как напечатал бы ученик: первая буква заглавная, дальше как в нижнем ряду клавиш', () => {
    expect(typeWholeWord('tries')).toBe('Tries')
    expect(typeWholeWord('Hold on')).toBe('Hold on')
  })

  it('проверка панели принимает итог как верный', () => {
    for (const w of ['tries', 'Hold on', "I'm", 'ёлка']) expect(typedMatches(typeWholeWord(w), w)).toBe(true)
  })

  it('не длиннее лимита печати, пустое слово — пустая строка', () => {
    expect(typeWholeWord('recipe').length).toBeLessThanOrEqual(typedMax('recipe'))
    expect(typeWholeWord('')).toBe('')
    expect(typeWholeWord()).toBe('')
  })
})
