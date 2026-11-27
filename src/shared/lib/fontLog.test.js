import { describe, it, expect } from 'vitest'
import { watchFonts } from './fontLog.js'

const fakeSet = () => { const h = {}; return { h, addEventListener: (t, f) => { (h[t] ??= new Set()).add(f) }, removeEventListener: (t, f) => h[t]?.delete(f), fire: (t, faces) => h[t]?.forEach(f => f({ fontfaces: faces })) } }

describe('журнал загрузки шрифтов', () => {
  it('пишет начало, конец и ошибку с семейством, весом и диапазоном; отписка снимает слушателей', () => {
    const fonts = fakeSet(), out = []
    const off = watchFonts(s => out.push(s), fonts)
    fonts.fire('loading', [{ family: 'Comfortaa', weight: '700', unicodeRange: 'U+0301, U+0400-045F' }])
    fonts.fire('loadingdone', [{ family: 'Comfortaa', weight: '700', unicodeRange: 'U+0301, U+0400-045F' }, { family: 'Montserrat', weight: '400', unicodeRange: 'U+0-10FFFF' }])
    fonts.fire('loadingerror', [])
    expect(out).toEqual(['[fonts] начали грузить: Comfortaa 700 U+0301, U+0400-045F', '[fonts] загружено: Comfortaa 700 U+0301, U+0400-045F, Montserrat 400', '[fonts] не загрузилось: —'])
    off(); fonts.fire('loading', []); expect(out).toHaveLength(3)
  })
  it('нет FontFaceSet — пустая отписка', () => { expect(watchFonts(() => {}, null)()).toBeUndefined() })
})
