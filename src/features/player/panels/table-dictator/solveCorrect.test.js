import { describe, it, expect } from 'vitest'
import { dictatorSolvedState } from './solveCorrect.js'
import { evaluateDictator } from './dictatorCheck.js'

const cellTok  = (cellId, value) => ({ type: 'cell', cellId, value })
const extraTok = value => ({ type: 'extra', value })

describe('dictatorSolvedState — авто-ответ админа в диктанте', () => {
  it('ячейки — строками по порядку, слова вне таблицы — по индексу чипа (как RAF/легаси)', () => {
    const tokens = [cellTok('c1', 'I'), cellTok('c2', 'am'), extraTok("I'm"), extraTok('here')]
    const s = dictatorSolvedState({ tokens, shuffledExtras: ['here', 'there', "I'm"] })
    expect(s.assembled).toEqual(['I', 'am'])
    expect(s.usedCellIds).toEqual(['c1', 'c2'])
    expect(s.extrasAssembled).toEqual([{ value: "I'm", key: 'extra-2' }, { value: 'here', key: 'extra-0' }])
  })

  it('повтор слова берёт второй чип, апостроф/регистр не мешают', () => {
    const tokens = [extraTok('was'), extraTok('WAS'), extraTok('I’m')]
    const s = dictatorSolvedState({ tokens, shuffledExtras: ['was', "i'm", 'was'] })
    expect(s.extrasAssembled.map(t => t.key)).toEqual(['extra-0', 'extra-2', 'extra-1'])
  })

  it('слово без чипа — null', () => {
    expect(dictatorSolvedState({ tokens: [extraTok('x')], shuffledExtras: ['y'] })).toBeNull()
  })

  it('собранное состояние evaluateDictator считает верным (ловушка остаётся в чипах)', () => {
    const tokens = [cellTok('c1', 'I'), extraTok('try'), cellTok('c2', 'cook')]
    const s = dictatorSolvedState({ tokens, shuffledExtras: ['tries', 'try'] })
    const r = evaluateDictator({ tokens, ...s, answer: 'I try cook' })
    expect(r.isCorrect).toBe(true)
    expect(r.phrase).toBe('I try cook')
  })
})
