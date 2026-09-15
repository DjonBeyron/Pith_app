import { describe, it, expect } from 'vitest'
import { phraseAssemblySlots, tableSlots, signalForSlot } from './signalSlots.js'

describe('phraseAssemblySlots', () => {
  it('один слот на слово, по порядку', () => {
    expect(phraseAssemblySlots(['I', 'try', 'again'])).toEqual([
      { index: 0, label: 'I' },
      { index: 1, label: 'try' },
      { index: 2, label: 'again' },
    ])
  })

  it('пусто без слов', () => {
    expect(phraseAssemblySlots([])).toEqual([])
    expect(phraseAssemblySlots(undefined)).toEqual([])
  })
})

describe('tableSlots', () => {
  const cells = [
    { id: 'c1', value: 'I' },
    { id: 'c2', value: 'will try' }, // слитая ячейка (rowspan/colspan) — один тап
  ]

  it('слитая ячейка — ОДИН слот, а не два по числу слов', () => {
    const slots = tableSlots('I will try', cells)
    expect(slots).toEqual([
      { index: 0, label: 'I', kind: 'cell' },
      { index: 1, label: 'will try', kind: 'cell' },
    ])
  })

  it('слово вне таблицы — свой слот с kind extra', () => {
    const slots = tableSlots('I will try again', cells)
    expect(slots).toEqual([
      { index: 0, label: 'I', kind: 'cell' },
      { index: 1, label: 'will try', kind: 'cell' },
      { index: 2, label: 'again', kind: 'extra' },
    ])
  })

  it('пустой ответ — пустой список слотов', () => {
    expect(tableSlots('', cells)).toEqual([])
  })
})

describe('signalForSlot', () => {
  const nodes = [{ id: 'n1' }, { id: 'n2' }]

  it('нет сигнала на этот слот — null', () => {
    expect(signalForSlot([{ slot: 0, ref: 'n1' }], 1, nodes)).toBeNull()
  })

  it('сигнал есть, нода жива — отдаёт и сигнал, и ноду', () => {
    expect(signalForSlot([{ slot: 1, ref: 'n2' }], 1, nodes)).toEqual({
      signal: { slot: 1, ref: 'n2' },
      node: { id: 'n2' },
    })
  })

  it('сигнал ссылается на удалённую ноду — null (общий путь, не сбой)', () => {
    expect(signalForSlot([{ slot: 0, ref: 'gone' }], 0, nodes)).toBeNull()
  })

  it('поле signals отсутствует — null, без падения', () => {
    expect(signalForSlot(undefined, 0, nodes)).toBeNull()
  })
})
