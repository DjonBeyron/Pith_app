import { describe, it, expect } from 'vitest'
import { miaTailTree, withTailFrames } from './miaTailFrames.js'
import { MIA_TAIL } from './miaTailData.js'
import { MARK_SLOTS } from './miaTailDrive.js'
import { buildMiaCat } from './miaCat.js'

describe('хвост Мии: данные и дерево', () => {
  it('девять поз: у каждой хребет из 48 точек и толщина; штрихи есть не везде (позы 1 и 9 — без них, 4 и 5 — со штрихами)', () => {
    expect(MIA_TAIL).toHaveLength(9)
    expect(MIA_TAIL.every(f => f.q.length === 96 && f.q.every(Number.isFinite) && f.w > 40 && f.w < 70)).toBe(true)
    expect(MIA_TAIL.map(f => f.marks.length > 0)).toEqual([false, true, true, true, true, true, true, true, false])
    expect(MIA_TAIL.every(f => f.marks.length <= MARK_SLOTS && f.marks.every(m => m.j >= 0 && m.j < 47 && /^M[-\d. LZ]+Z$/.test(m.d)))).toBe(true)
  })
  it('дерево: контур хвоста (заливка + обводка) и пустые пути штрихов — всего 1 + MARK_SLOTS узлов', () => {
    const t = miaTailTree()
    expect(t).toHaveLength(1 + MARK_SLOTS)
    expect(t[0].attrs).toMatchObject({ class: 'mt-tail', fill: '#646774', stroke: '#262432', strokeLinejoin: 'round' }); expect(t[0].attrs.d).toMatch(/^M[-\d. L]+Z$/)
    expect(t.slice(1).every(n => n.attrs.class === 'mk' && n.attrs.d === '')).toBe(true)
  })
  it('в дереве Мии хвост подменён внутри g.cat-tail; тело и головы не тронуты', () => {
    const cat = buildMiaCat(['pathos']), tail = cat.children.find(c => c.attrs['data-part'] === 'tail'), wrap = tail.children[0]
    expect(wrap.attrs.class).toBe('cat-tail'); expect(wrap.children).toHaveLength(1 + MARK_SLOTS)
    expect(cat.children.filter(c => c.attrs['data-part'] === 'body')).toHaveLength(1)
  })
  it('withTailFrames без хвоста не падает', () => { expect(withTailFrames({ children: [] })).toEqual({ children: [] }) })
})
