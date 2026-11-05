import { describe, expect, it } from 'vitest'
import { buildCat, CAT_FACES, NO_TILT } from './wordLaneCatTree.js'

// Головы лиц лежат рядом и сменяются перекрёстным проявлением: контур и якорь головы у всех лиц обязаны совпадать, иначе голова «скачет» при смене эмоции
const find = (node, pred, acc = []) => { if (pred(node)) acc.push(node); (node.children ?? []).forEach(c => find(c, pred, acc)); return acc }
const heads = cat => cat.children.filter(c => c.attrs['data-part'] === 'head')
const outline = h => find(h, n => n.tag === 'path' && n.attrs.fill === '#bc82fa')[0]

describe('кот игры: одинаковый контур головы у всех лиц', () => {
  const cat = buildCat('kit')
  it('по голове на каждое лицо', () => {
    expect(heads(cat).map(h => h.attrs['data-face'])).toEqual(CAT_FACES)
  })
  it('слой наклона у всех лиц прямой (shy не наклоняет голову — контур не сдвигается)', () => {
    for (const h of heads(cat)) {
      const tilt = find(h, n => (n.attrs?.class ?? '') === 'mx-tilt')
      expect(tilt).toHaveLength(1)
      expect(tilt[0].attrs.style).toBe(NO_TILT)
    }
  })
  it('заливка-контур головы (путь, обводка, трансформации) одна и та же у всех лиц', () => {
    const [ref, ...rest] = heads(cat).map(outline)
    expect(ref?.attrs.d).toBeTruthy()
    for (const o of rest) expect(o.attrs).toEqual(ref.attrs)
  })
  it('якорь одинаков: атрибуты слоя головы (кроме метки лица) совпадают', () => {
    const strip = h => { const { 'data-face': _f, ...rest } = h.attrs; return rest }
    const [ref, ...rest] = heads(cat).map(strip)
    for (const r of rest) expect(r).toEqual(ref)
  })
})
