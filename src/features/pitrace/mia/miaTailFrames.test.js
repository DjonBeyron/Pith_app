import { describe, it, expect } from 'vitest'
import { miaTailTree, withTailFrames } from './miaTailFrames.js'
import { MIA_TAIL_FRAMES, MIA_TAIL_MARKS, TAIL_SLOTS } from './miaTailData.js'
import { buildMiaCat } from './miaCat.js'
import { readFileSync } from 'node:fs'

describe('хвост Мии: кадры', () => {
  it('цикл 36 слотов по 40 мс: кадры идут подряд без дыр и наложений, каждый — замкнутый контур', () => {
    let slot = 0
    for (const f of MIA_TAIL_FRAMES) { expect(f.s).toBe(slot); expect(f.n === 1 || f.n === 4).toBe(true); expect(f.d).toMatch(/^M[-\d. CZ]+Z$/); slot += f.n }
    expect(slot).toBe(TAIL_SLOTS)
    expect(MIA_TAIL_FRAMES.length).toBeGreaterThanOrEqual(9 * 2) // девять утверждённых кадров + промежуточные
  })
  it('штрихи: окна внутри цикла, у поз 1 и 9 штрихов нет', () => {
    expect(MIA_TAIL_MARKS.length).toBe(7)
    for (const m of MIA_TAIL_MARKS) { expect(m.s + m.n).toBeLessThanOrEqual(TAIL_SLOTS); expect(m.n).toBeGreaterThanOrEqual(1); expect(m.n).toBeLessThanOrEqual(4); expect(m.d).toMatch(/^M[-\d. LZ]+/) }
    expect(MIA_TAIL_MARKS.every(m => m.s >= 4 && m.s < 32)).toBe(true)
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
  it('CSS: слоты по 40 мс, четыре длительности, пауза, «довольна» без замирания', () => {
    const css = readFileSync(new URL('../../../styles/player/modules/race-mia.css', import.meta.url), 'utf8')
    expect(css).toContain('animation-delay: calc((var(--s) - 36) * 40ms)'); for (const n of [1, 2, 3, 4]) expect(css).toContain(`@keyframes miaTailSlot${n}`)
    expect(css).toContain('animation-play-state: paused'); expect(css).toContain("[data-tail='pleased'] .cat-tail .mk { display: none; }"); expect(css).toContain('overflow: visible')
  })
  it('withTailFrames без хвоста не падает', () => { expect(withTailFrames({ children: [] })).toEqual({ children: [] }) })
})
