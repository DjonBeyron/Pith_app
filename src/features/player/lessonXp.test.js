import { describe, it, expect } from 'vitest'
import { buildXpMap, rewardNodes } from './lessonXp.js'

const node = (id, type, data = {}) => ({ id, type, typeData: { [type]: data } })

describe('buildXpMap — кому достаётся XP урока', () => {
  it('сборка фразы получает награду наравне с выбором слова', () => {
    const nodes = [node('w', 'word_choice'), node('p', 'phrase_assembly')]
    const map = buildXpMap(nodes, 20)
    expect(map.get('w')).toBe(10)
    expect(map.get('p')).toBe(10)
  })

  it('все наградные типы участвуют', () => {
    const nodes = [
      node('w', 'word_choice'), node('p', 'phrase_assembly'),
      node('f', 'photo_choice'), node('t', 'table', { mode: 'manual' }),
    ]
    const map = buildXpMap(nodes, 40)
    expect([...map.values()]).toEqual([10, 10, 10, 10])
  })

  // Таблица «Авто» собирается сама — награда там по умолчанию снята
  // (см. shared/lib/nodeReward.js), но включается галочкой
  it('таблица в режиме «Авто» по умолчанию XP не делит', () => {
    const map = buildXpMap([node('p', 'phrase_assembly'), node('t', 'table')], 20)
    expect(map.get('p')).toBe(20)
    expect(map.has('t')).toBe(false)
  })

  it('таблица «Авто» с включённой галочкой XP делит', () => {
    const nodes = [node('p', 'phrase_assembly'), node('t', 'table', { reward: true })]
    const map = buildXpMap(nodes, 20)
    expect(map.get('t')).toBe(10)
  })

  it('обычные ноды награды не получают', () => {
    const map = buildXpMap([node('t', 'text'), node('p', 'phrase_assembly')], 10)
    expect(map.has('t')).toBe(false)
    expect(map.get('p')).toBe(10)
  })

  it('снятая галочка «Получить награду» исключает ноду', () => {
    const nodes = [node('p', 'phrase_assembly', { reward: false }), node('w', 'word_choice')]
    const map = buildXpMap(nodes, 10)
    expect(map.has('p')).toBe(false)
    expect(map.get('w')).toBe(10)
  })

  it('галочка включена по умолчанию — поля reward может не быть вовсе', () => {
    expect(rewardNodes([node('p', 'phrase_assembly')])).toHaveLength(1)
    expect(rewardNodes([node('p', 'phrase_assembly', { reward: true })])).toHaveLength(1)
  })

  it('остаток раздаётся по одному, ничего не теряется', () => {
    const nodes = ['a', 'b', 'c'].map(id => node(id, 'word_choice'))
    const map = buildXpMap(nodes, 10)
    expect([...map.values()].reduce((a, b) => a + b, 0)).toBe(10)
    expect([...map.values()]).toEqual([4, 3, 3])
  })

  // Из-за этого награда раньше «не летела» у части нод: XP урока меньше
  // числа наградных нод, и последним доставался ноль
  it('XP меньше числа нод — каждому всё равно достаётся хотя бы 1', () => {
    const nodes = ['a', 'b', 'c'].map(id => node(id, 'phrase_assembly'))
    const map = buildXpMap(nodes, 2)
    expect([...map.values()]).toEqual([1, 1, 1])
  })

  it('ни одна нода с включённой галочкой не остаётся без награды', () => {
    const nodes = Array.from({ length: 9 }, (_, i) => node('n' + i, 'phrase_assembly'))
    const map = buildXpMap(nodes, 4)
    expect([...map.values()].every(v => v >= 1)).toBe(true)
  })

  it('у урока не задан XP — карта пустая, награды нет ни у кого', () => {
    expect(buildXpMap([node('p', 'phrase_assembly')], 0).size).toBe(0)
  })

  it('наградных нод нет — карта пустая', () => {
    expect(buildXpMap([node('t', 'text')], 100).size).toBe(0)
  })
})
