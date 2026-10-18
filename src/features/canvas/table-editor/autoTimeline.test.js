import { describe, it, expect } from 'vitest'
import { buildAutoTimeline } from './autoTimeline.js'

const cells = [{ id: 'a', value: 'I want' }, { id: 'b', value: 'to' }, { id: 'h', value: 'Начало' }]
const wordTimings = [{ w: 'Смотри', t: 0 }, { w: 'I', t: 1 }, { w: 'want', t: 1.4 }, { w: 'to', t: 2 }, { w: 'дальше', t: 3 }]

describe('buildAutoTimeline', () => {
  const { timeline, timelineLen } = buildAutoTimeline({ cells, wordTimings, duration: 4 })
  it('ставит подсветку по времени слов, длина = аудио + 10', () => {
    expect(timelineLen).toBe(14)
    const a = timeline.layers.find(l => l.cellId === 'a')
    expect(a.highlightOn).toBe(true)
    expect(a.clips[0]).toEqual({ start: 1, end: 2 })
    expect(a.clips[1]).toEqual({ start: 0, end: 14 })
  })
  it('не прозвучавшую ячейку (заголовок) не подсвечивает', () => {
    expect(timeline.layers.find(l => l.cellId === 'h').highlightOn).toBe(false)
  })
  it('добавляет «Проверить» в конце записи', () => {
    const chk = timeline.layers.find(l => l.isCheck)
    expect(chk.clips[0].end).toBe(4)
  })
})

describe('buildAutoTimeline без длины аудио', () => {
  it('«Проверить» ложится после последнего слова, а не на 1-ю секунду', () => {
    const { timeline } = buildAutoTimeline({ cells, wordTimings, duration: null })
    const chk = timeline.layers.find(l => l.isCheck)
    expect(chk.clips[0].start).toBeGreaterThan(2)
  })
})
