import { describe, it, expect } from 'vitest'
import { correctPhotoIndex } from './solveCorrect.js'

const photos = [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }]

describe('correctPhotoIndex — авто-ответ админа в «выбери фото»', () => {
  it('первый верный индекс из correctIndexes', () => {
    expect(correctPhotoIndex(photos, [2, 1])).toBe(2)
  })

  it('индекс за пределами списка фото пропускается', () => {
    expect(correctPhotoIndex(photos, [7, 1])).toBe(1)
    expect(correctPhotoIndex(photos, [-1, 0])).toBe(0)
  })

  it('верных нет — null', () => {
    expect(correctPhotoIndex(photos, [])).toBeNull()
    expect(correctPhotoIndex([], [0])).toBeNull()
    expect(correctPhotoIndex()).toBeNull()
  })
})
