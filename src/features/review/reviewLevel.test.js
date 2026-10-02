import { describe, it, expect } from 'vitest'
import { levelClass, startOfReview } from './reviewLevel.js'

const ladder = {
  permanent: [],
  levels: [
    { words: [{ word: 'new', step: 1 }] },
    { words: [{ word: 'known', step: 4 }] },
    { words: [{ word: 'solid', step: 5 }] },
  ],
}
const view = (picked, phrase = null) => ({ today: { picked, phrase }, ladder })

describe('цвет экрана повторения', () => {
  it('класс ступени: нет ступени — нет класса (фон нейтральный)', () => {
    expect(levelClass(2)).toBe(' reviewScreen--lvl2')
    expect(levelClass(null)).toBe('')
    expect(levelClass(undefined)).toBe('')
  })

  it('со слов дня: первое слово и его ступень', () => {
    expect(startOfReview(view([{ word: 'known', step: 4 }, { word: 'new', step: 1 }]))).toEqual({ word: 'known', level: 2 })
    expect(startOfReview(view([{ word: 'solid', step: 5 }]))).toEqual({ word: 'solid', level: 3 })
  })

  it('«Повторить сейчас» — слово из лестницы', () => {
    expect(startOfReview(view([]), ['new'])).toEqual({ word: 'new', level: 1 })
    expect(startOfReview(view([]), ['нет'])).toBe(null)
  })

  it('слов нет, есть фраза — усвоенный цвет; ничего нет — без цвета', () => {
    expect(startOfReview(view([], { id: 'm', title: 't' }))).toEqual({ word: null, level: 3 })
    expect(startOfReview(view([]))).toBe(null)
    expect(startOfReview(null)).toBe(null)
  })
})
