import { describe, it, expect } from 'vitest'
import { placeInfoPopup, INFO_POP_MAX_W, INFO_POP_EDGE } from './infoPopupPlace.js'

const btn = (left, top, size = 22) => ({ left, top, width: size, height: size, right: left + size, bottom: top + size })

describe('placeInfoPopup — попап «i» всегда внутри экрана', () => {
  for (const vw of [320, 360, 390, 1280]) {
    it(`окно ${vw}px: кнопка у левого, правого края и по центру — попап с полем ≥ ${INFO_POP_EDGE}px, уголок внутри попапа`, () => {
      for (const x of [0, 8, vw / 2, vw - 30, vw - 22]) {
        const p = placeInfoPopup({ rect: btn(x, 100), vw, vh: 700 })
        expect(p.width).toBeLessThanOrEqual(INFO_POP_MAX_W)
        expect(p.width).toBeLessThanOrEqual(vw - 2 * INFO_POP_EDGE)
        expect(p.left).toBeGreaterThanOrEqual(INFO_POP_EDGE)
        expect(p.left + p.width).toBeLessThanOrEqual(vw - INFO_POP_EDGE)
        expect(p.caretX).toBeGreaterThan(0)
        expect(p.caretX).toBeLessThan(p.width)
      }
    })
  }

  it('уголок смотрит на кнопку: при кнопке у правого края он смещён вправо, у левого — влево', () => {
    const left = placeInfoPopup({ rect: btn(10, 100), vw: 360, vh: 700 })
    const right = placeInfoPopup({ rect: btn(320, 100), vw: 360, vh: 700 })
    expect(right.caretX).toBeGreaterThan(left.caretX)
  })

  it('есть место снизу — попап под кнопкой (top), maxHeight не вылезает за низ экрана', () => {
    const p = placeInfoPopup({ rect: btn(100, 100), vw: 390, vh: 700 })
    expect(p.side).toBe('down')
    expect(p.top).toBeGreaterThan(122)
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(700 - INFO_POP_EDGE)
    expect(p.bottom).toBeUndefined()
  })

  it('снизу тесно, сверху просторно — попап переворачивается над кнопкой (bottom), maxHeight не вылезает за верх', () => {
    const p = placeInfoPopup({ rect: btn(100, 600), vw: 390, vh: 700 })
    expect(p.side).toBe('up')
    expect(p.top).toBeUndefined()
    const topEdge = 700 - p.bottom - p.maxHeight
    expect(topEdge).toBeGreaterThanOrEqual(INFO_POP_EDGE - 1)
  })

  it('маленькое окно с обеих сторон тесно — maxHeight не меньше минимума, чтобы попап не схлопнулся', () => {
    expect(placeInfoPopup({ rect: btn(100, 150), vw: 320, vh: 300 }).maxHeight).toBeGreaterThanOrEqual(96)
  })
})
