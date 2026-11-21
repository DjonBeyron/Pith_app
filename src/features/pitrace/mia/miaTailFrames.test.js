import { describe, it, expect } from 'vitest'
import { miaTailTree, withTailFrames } from './miaTailFrames.js'
import { MIA_TAIL_FRAMES, MIA_TAIL_MARKS, TAIL_SLOTS } from './miaTailData.js'
import { buildMiaCat } from './miaCat.js'
import { readFileSync } from 'node:fs'

describe('хвост Мии: кадры', () => {
  it('ровно девять утверждённых кадров (без промежуточных): подряд, без дыр, каждый — замкнутый контур', () => {
    expect(MIA_TAIL_FRAMES).toHaveLength(9); expect(TAIL_SLOTS).toBe(9)
    MIA_TAIL_FRAMES.forEach((f, i) => { expect(f.s).toBe(i); expect(f.n).toBe(1); expect(f.d).toMatch(/^M[-\d. CZ]+Z$/) })
  })
  it('штрихи: окна внутри цикла, у поз 1 и 9 штрихов нет', () => {
    expect(MIA_TAIL_MARKS.length).toBe(7)
    for (const m of MIA_TAIL_MARKS) { expect(m.s + m.n).toBeLessThanOrEqual(TAIL_SLOTS); expect(m.n).toBe(1); expect(m.d).toMatch(/^M[-\d. LCZ]+/) }
    expect(MIA_TAIL_MARKS.map(m => m.s)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
  it('дерево: контуры .mt и штрихи .mk с --s и data-n; узлов не больше бюджета', () => {
    const t = miaTailTree()
    expect(t).toHaveLength(MIA_TAIL_FRAMES.length + MIA_TAIL_MARKS.length)
    expect(t[0].attrs).toMatchObject({ class: 'mt', fill: '#646774', stroke: '#262432', strokeLinejoin: 'round', style: '--s:0' })
    expect(t.filter(n => n.attrs.class === 'mk').every(n => n.attrs.style.startsWith('--s:'))).toBe(true)
    expect(t.length).toBeLessThanOrEqual(40)
  })
  it('в дереве Мии хвост подменён внутри g.cat-tail; тело и головы не тронуты', () => {
    const cat = buildMiaCat(['pathos']), tail = cat.children.find(c => c.attrs['data-part'] === 'tail'), wrap = tail.children[0]
    expect(wrap.attrs.class).toBe('cat-tail'); expect(wrap.children.length).toBe(miaTailTree().length)
    expect(cat.children.filter(c => c.attrs['data-part'] === 'body')).toHaveLength(1)
  })
  it('CSS: слот --tail-ms (90 мс, было 160), цикл 9 слотов, пауза, «довольна» без замирания', () => {
    const css = readFileSync(new URL('../../../styles/player/modules/race-mia.css', import.meta.url), 'utf8')
    expect(css).toContain('--tail-ms: 90ms'); expect(css).toContain('animation-delay: calc((var(--s) - 9) * var(--tail-ms))'); expect(css).toContain('@keyframes miaTailSlot')
    expect(css).toContain('animation-play-state: paused'); expect(css).toContain("[data-tail='pleased'] .cat-tail .mk { display: none; }"); expect(css).toContain('overflow: visible')
  })
  it('withTailFrames без хвоста не падает', () => { expect(withTailFrames({ children: [] })).toEqual({ children: [] }) })
})
