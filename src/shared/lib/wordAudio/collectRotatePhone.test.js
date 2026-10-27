import { describe, it, expect } from 'vitest'
import { collectLessonWords } from './collectLessonWords.js'

describe('нода «Переверни телефон»: слова для озвучки', () => {
  it('куски фразы и слова-запутыватели раунда «Различи» попадают в список «нужна озвучка»', () => {
    const node = { type: 'rotate_phone', typeData: { rotate_phone: { phrase: "I'm | trying | to learn", confusers: [[], ['tying', 'drying'], []] } } }
    const keys = [...collectLessonWords([node]).keys()]
    expect(keys).toEqual(expect.arrayContaining(["i'm", 'trying', 'to learn', 'tying', 'drying']))
  })
  it('без запутывателей — только куски', () => {
    const node = { type: 'rotate_phone', typeData: { rotate_phone: { phrase: 'try' } } }
    expect([...collectLessonWords([node]).keys()]).toEqual(['try'])
  })
})
