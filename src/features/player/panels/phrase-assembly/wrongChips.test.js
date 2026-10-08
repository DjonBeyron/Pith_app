import { describe, it, expect } from 'vitest'
import { snapshotWrongIds, wrongChipFlags } from './wrongChips.js'

const chip = (shuffleIdx, word) => ({ shuffleIdx, word, distractorId: null })

describe('wrongChips — красное только у чипов из снимка проверки', () => {
  it('снимок — id чипов, стоявших в ответе', () => {
    expect(snapshotWrongIds([chip(3, 'I'), chip(0, 'am')])).toEqual([3, 0])
    expect(snapshotWrongIds([])).toEqual([])
  })

  it('без снимка красных нет', () => {
    const placed = [chip(1, 'a'), chip(2, 'b')]
    expect(wrongChipFlags(placed, null)).toEqual([false, false])
    expect(wrongChipFlags(placed, [])).toEqual([false, false])
  })

  it('все слова из снимка красные', () => {
    const placed = [chip(1, 'a'), chip(2, 'b')]
    expect(wrongChipFlags(placed, snapshotWrongIds(placed))).toEqual([true, true])
  })

  it('слово, добавленное ПОСЛЕ проверки, красным не становится — даже если верное по смыслу', () => {
    const checked = [chip(1, 'a'), chip(2, 'b')]
    const snap = snapshotWrongIds(checked)
    const after = [...checked, chip(5, 'new')]
    expect(wrongChipFlags(after, snap)).toEqual([true, true, false])
  })

  it('снятие слова из середины не сдвигает красное на соседей (id, а не позиции)', () => {
    const checked = [chip(1, 'a'), chip(2, 'b'), chip(3, 'c')]
    const snap = snapshotWrongIds(checked)
    // убрали «b», добавили новое «d» (id 4) в конец: «a» и «c» из снимка, «d» — нет
    const after = [chip(1, 'a'), chip(3, 'c'), chip(4, 'd')]
    expect(wrongChipFlags(after, snap)).toEqual([true, true, false])
  })

  it('чип, убранный и поставленный обратно после проверки, остаётся в снимке (это уже был неверный ответ)', () => {
    const snap = [1, 2]
    expect(wrongChipFlags([chip(2, 'b')], snap)).toEqual([true])
  })
})
