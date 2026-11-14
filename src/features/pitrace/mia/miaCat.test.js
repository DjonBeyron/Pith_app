import { describe, it, expect } from 'vitest'
import { buildMiaCat, nextFace, MIA_FACES, NO_TILT } from './miaCat.js'

describe('Мия с лицами', () => {
  it('головы всех лиц лежат рядом (по одной на лицо), тело и хвост общие; у голов data-face / data-skin', () => {
    const cat = buildMiaCat()
    const heads = cat.children.filter(c => c.attrs['data-part'] === 'head')
    expect(heads.map(h => h.attrs['data-face'])).toEqual(MIA_FACES); expect(heads.every(h => h.attrs['data-skin'] === 'mia2')).toBe(true)
    expect(cat.children.filter(c => c.attrs['data-part'] === 'body')).toHaveLength(1); expect(cat.children.filter(c => c.attrs['data-part'] === 'tail')).toHaveLength(1)
  })
  it('наклон головы снят у всех лиц (перекрёстная смена без скачка); одно лицо — одна голова', () => {
    const hasTilt = n => ((n.attrs?.class ?? '').includes('mx-tilt') ? n.attrs.style === NO_TILT : true) && (n.children ?? []).every(hasTilt)
    expect(buildMiaCat().children.filter(c => c.attrs['data-part'] === 'head').every(hasTilt)).toBe(true)
    expect(buildMiaCat(['smirk']).children.filter(c => c.attrs['data-part'] === 'head')).toHaveLength(1)
  })
  it('nextFace: всегда другое лицо; одно лицо — то же', () => {
    for (const r of [0, 0.3, 0.99]) expect(nextFace(MIA_FACES, 'pathos', r)).not.toBe('pathos')
    expect(nextFace(['smirk'], 'smirk', 0.5)).toBe('smirk')
  })
  it('бюджет узлов: Мия с тремя лицами укладывается (сцена ≤ 250 вместе с коробкой)', () => {
    const count = n => 1 + (n.children ?? []).reduce((a, c) => a + count(c), 0)
    expect(count(buildMiaCat())).toBeLessThan(215); expect(count(buildMiaCat(['smirk']))).toBeLessThan(120)
  })
})
