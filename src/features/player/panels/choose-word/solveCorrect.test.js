import { describe, it, expect } from 'vitest'
import { pickCorrectOption } from './solveCorrect.js'

describe('pickCorrectOption — авто-ответ админа в «выбери слово»', () => {
  it('берёт первый верный вариант в порядке показа', () => {
    const options = [
      { id: 'a', text: 'мимо' },
      { id: 'b', text: 'верно', isCorrect: true },
      { id: 'c', text: 'тоже верно', isCorrect: true },
    ]
    expect(pickCorrectOption(options)?.id).toBe('b')
  })

  it('верных нет (только сигнальные «знаю/не знаю») — null', () => {
    expect(pickCorrectOption([{ id: 'x', text: 'знаю', signal: 'know' }])).toBeNull()
    expect(pickCorrectOption([])).toBeNull()
    expect(pickCorrectOption()).toBeNull()
  })
})
