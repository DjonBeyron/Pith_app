import { describe, it, expect } from 'vitest'
import { miaTailTree, withTailFrames, TAIL_CALM } from './miaTailFrames.js'
import { MIA_TAIL_FRAMES } from './miaTailData.js'
import { buildMiaCat } from './miaCat.js'

describe('хвост Мии из 9 кадров', () => {
  it('девять кадров: у каждого силуэт-контур, штрихи есть не везде (кадры 1 и 9 — без штрихов, 4 и 5 — со штрихами)', () => {
    expect(MIA_TAIL_FRAMES).toHaveLength(9)
    expect(MIA_TAIL_FRAMES.every(f => /^M[-\d. CZ]+Z$/.test(f.tail))).toBe(true)
    expect(MIA_TAIL_FRAMES.map(f => !!f.marks)).toEqual([false, true, true, true, true, true, true, true, false])
  })
  it('дерево: g.mt на кадр, внутри путь хвоста (заливка + обводка) и, если есть, путь штрихов .mk', () => {
    const t = miaTailTree()
    expect(t).toHaveLength(9)
    expect(t[0].children).toHaveLength(1); expect(t[3].children).toHaveLength(2)
    expect(t[3].children[0].attrs).toMatchObject({ fill: '#646774', stroke: '#262432', strokeLinejoin: 'round' })
    expect(t[3].children[1].attrs.class).toBe('mk')
  })
  it('кадр «довольна» (4) — с поднятым хвостом и штрихами, которые CSS скрывает', () => { expect(TAIL_CALM).toBe(3); expect(MIA_TAIL_FRAMES[TAIL_CALM].marks).not.toBe('') })
  it('в дереве Мии хвост подменён кадрами внутри g.cat-tail; тело и головы не тронуты', () => {
    const cat = buildMiaCat(['pathos'])
    const tail = cat.children.find(c => c.attrs['data-part'] === 'tail')
    const wrap = tail.children[0]
    expect(wrap.attrs.class).toBe('cat-tail'); expect(wrap.children).toHaveLength(9); expect(wrap.children.every(g => g.attrs.class === 'mt')).toBe(true)
    expect(cat.children.filter(c => c.attrs['data-part'] === 'body')).toHaveLength(1)
  })
  it('withTailFrames без хвоста не падает', () => { expect(withTailFrames({ children: [] })).toEqual({ children: [] }) })
})
