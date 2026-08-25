import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  layerShots, computeHighlightedCellIds, lastWordClipEnd, timelineEndSec,
} from '../../../shared/lib/tableDictatorTiming.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// «Дублировать клип» в меню клипа кладёт копию в layer.repeats — та же
// анимация, другое время (см. useTableTimelineEdit.duplicateClip)
const cellLayer = () => ({
  id: 'l1', cellId: 'c1', visible: true, highlightOn: true, collect: true,
  clips: [{ start: 0, end: 1 }, { start: 0, end: 10 }],
  repeats: [{ start: 4, end: 5 }],
})

const wordLayer = () => ({
  id: 'l2', word: 'is', visible: true, collect: true,
  clips: [{ start: 2, end: 3 }],
  repeats: [{ start: 6, end: 7 }],
})

describe('дубль клипа = такой же выстрел, как оригинал', () => {
  it('layerShots отдаёт основной клип и повторы, проявление (clips[1]) не трогает', () => {
    expect(layerShots(cellLayer())).toEqual([{ start: 0, end: 1 }, { start: 4, end: 5 }])
    expect(layerShots({ clips: [] })).toEqual([])
    expect(layerShots(null)).toEqual([])
  })

  it('ячейка подсвечивается и на повторе — в плеере и в предпросмотре редактора', () => {
    const layers = [cellLayer()]
    expect([...computeHighlightedCellIds(layers, 0.5)]).toEqual(['c1'])
    expect([...computeHighlightedCellIds(layers, 4.5)]).toEqual(['c1'])
    expect([...computeHighlightedCellIds(layers, 2)]).toEqual([])
  })

  it('проверка ждёт повтор слова, а не только его первый клип', () => {
    expect(lastWordClipEnd([wordLayer()])).toBe(7)
  })

  it('длина композиции считает повторы и клипы очистки', () => {
    const layers = [cellLayer(), { id: 'l3', cellId: 'c2', clips: [{ start: 0, end: 1 }], clears: [{ start: 12, end: 12.5 }] }]
    expect(timelineEndSec(layers)).toBe(12.5)
  })
})

describe('повтор отыгрывает во всех трёх местах плеера', () => {
  it('ячейки и слова в RAF идут через общий layerShots', () => {
    const raf = read('../../player/panels/table-dictator/useTableDictatorRaf.js')
    expect(raf).toContain('const shots = layerShots(layer)')
    // word-цикл: ищем активный выстрел, а не только clips[0]
    expect(raf).toContain('const shots = layerShots(l)')
    expect(raf).toContain('const shotKey = `${k}#${idx}`')
    expect(raf).toContain('greenedKeys.add(shotKey)')
  })

  it('досборка после конца аудио планирует каждый выстрел', () => {
    const post = read('../../player/panels/table-dictator/dictatorPostAudio.js')
    expect(post).toContain('const shots = layer.highlightOn !== false ? layerShots(layer) : []')
    expect(post).toContain('shots.forEach((clip, shotIdx) => {')
    expect(post).toContain('`cell-${layer.cellId}#${shotIdx}`')
  })
})
