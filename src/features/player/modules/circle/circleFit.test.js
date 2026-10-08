import { describe, it, expect } from 'vitest'
import { circleFit } from './circleFit.js'

// Видимый прямоугольник (в координатах рамки) из стиля: считаем матрицу руками
// так же, как браузер — размер, центр рамки, translate, scale от центра
function visible(style, box) {
  if (style.width === '100%') {
    // запасной путь: рамка целиком, cover; здесь проверяем только transform
    const m = /translate\((-?[\d.]+)px,(-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(style.transform)
    return { w: box.w * +m[3], h: box.h * +m[3], x: +m[1], y: +m[2], kind: 'fallback' }
  }
  const m = /translate\(calc\(-50% \+ (-?[\d.]+)px\), calc\(-50% \+ (-?[\d.]+)px\)\) scale\(([\d.]+)\)/.exec(style.transform)
  return { w: parseFloat(style.width) * +m[3], h: parseFloat(style.height) * +m[3], x: +m[1], y: +m[2], kind: 'fit' }
}

const BOX = { w: 200, h: 200 }

describe('circleFit — cover-размер кадра в рамке', () => {
  it.each([
    ['16:9', 1920, 1080, 355.5556, 200],
    ['9:16', 1080, 1920, 200, 355.5556],
    ['1:1', 480, 480, 200, 200],
  ])('%s: меньшая сторона = рамке, большая вылезает', (_n, w, h, ew, eh) => {
    const s = circleFit({ box: BOX, mediaW: w, mediaH: h, crop: { x: 0, y: 0, scale: 1 } })
    expect(parseFloat(s.width)).toBeCloseTo(ew, 3)
    expect(parseFloat(s.height)).toBeCloseTo(eh, 3)
  })

  it.each([1, 1.5, 2])('zoom %s и сдвиг идут в transform как есть', zoom => {
    const s = circleFit({ box: BOX, mediaW: 1080, mediaH: 1920, crop: { x: 12, y: -30, scale: zoom } })
    const v = visible(s, BOX)
    expect(v.x).toBe(12); expect(v.y).toBe(-30)
    expect(v.w).toBeCloseTo(200 * zoom, 3)
  })
})

describe('circleFit — видео и постер дают одну и ту же геометрию', () => {
  it('одинаковые размеры кадра → стили равны (в т.ч. при сдвиге и zoom)', () => {
    const crop = { x: 7, y: 11, scale: 1.8 }
    const video  = circleFit({ box: BOX, mediaW: 1080, mediaH: 1920, crop })
    const poster = circleFit({ box: BOX, mediaW: 1080, mediaH: 1920, crop })
    expect(poster).toEqual(video)
  })

  it('запасной путь (размеры неизвестны) геометрически равен точному для квадрата', () => {
    for (const [w, h] of [[1920, 1080], [1080, 1920], [480, 480]]) {
      for (const crop of [{ x: 0, y: 0, scale: 1 }, { x: 9, y: -4, scale: 2 }]) {
        const fb = circleFit({ box: BOX, crop })
        const ex = circleFit({ box: BOX, mediaW: w, mediaH: h, crop })
        // cover на 100%×100% даёт тот же видимый прямоугольник рамки, что и
        // точный размер: и transform (сдвиг, zoom) совпадает
        const a = visible(fb, BOX), b = visible(ex, BOX)
        expect(a.x).toBe(b.x); expect(a.y).toBe(b.y)
        expect(a.w / BOX.w).toBeCloseTo(crop.scale, 6) // рамка × zoom
      }
    }
  })

  it('запасной путь растягивает элемент на рамку (а не оставляет натуральный размер)', () => {
    const s = circleFit({ box: null, mediaW: 0, mediaH: 0, crop: { x: 0, y: 0, scale: 1 } })
    expect(s.width).toBe('100%'); expect(s.height).toBe('100%'); expect(s.objectFit).toBe('cover')
  })
})
