import { describe, it, expect } from 'vitest'
import { paint } from './useReadKaraoke.js'
import { karaokePlan, karaokeFrame } from './readKaraoke.js'

// Запись кадра в DOM: заливка слоёв clip-path, курсор transform; без перерисовок React. DOM подставлен простыми объектами
const style = () => { const s = { props: {}, setProperty(k, v) { s.props[k] = v } }; return s }
const fakeEl = () => ({ style: style() })
const fakeCursor = () => ({ style: style(), firstChild: fakeEl(), lastChild: fakeEl() })
const plan = karaokePlan([{ chunk: 0, at: 0, ms: 400 }, { chunk: 1, at: 800, ms: 400 }], ['a', 'b'])
const geo = [{ l: 10, t: 5, w: 100, h: 30 }, { l: 210, t: 5, w: 100, h: 30 }]
const setup = () => ({ m: { fills: [fakeEl(), fakeEl()], geo }, cursor: fakeCursor(), last: { fills: [], cur: false } })

describe('paint: кадр → DOM', () => {
  it('заливка: clip-path у слоя слова пропорционален доле, записывается только при изменении', () => {
    const { m, cursor, last } = setup()
    paint(karaokeFrame(plan, 200), m, cursor, false, last)
    expect(m.fills[0].style.clipPath).toBe('inset(0 50% 0 0)'); expect(m.fills[1].style.clipPath).toBe('inset(0 100% 0 0)')
    m.fills[0].style.clipPath = 'трогали'
    paint(karaokeFrame(plan, 200), m, cursor, false, last)
    expect(m.fills[0].style.clipPath).toBe('трогали') // кадр тот же — DOM не трогаем
  })
  it('курсор: translate3d по слову (левый край + доля ширины), «|» полной высоты, высота слова в --rk-h', () => {
    const { m, cursor, last } = setup()
    paint(karaokeFrame(plan, 200), m, cursor, false, last)
    expect(cursor.style.transform).toBe('translate3d(60.0px, 5.0px, 0)')
    expect(cursor.style.props['--rk-h']).toBe('30px')
    expect(cursor.firstChild.style.transform).toBe('scaleY(1.000)'); expect(cursor.lastChild.style.transform).toBe('scale(0.000)')
  })
  it('между словами кружок плывёт от правого края слова к левому краю следующего', () => {
    const { m, cursor, last } = setup()
    paint(karaokeFrame(plan, 600), m, cursor, false, last) // середина паузы 400..800
    const x = Number(/translate3d\(([\d.]+)px/.exec(cursor.style.transform)[1])
    expect(x).toBeGreaterThan(110); expect(x).toBeLessThan(210)
    expect(cursor.lastChild.style.transform).toBe('scale(1.000)'); expect(cursor.firstChild.style.transform).toBe('scaleY(0.000)')
  })
  it('нет курсора в кадре — «|» и кружок схлопнуты в ноль один раз', () => {
    const { m, cursor, last } = setup()
    paint(karaokeFrame(plan, 100), m, cursor, false, last)
    paint(karaokeFrame(plan, 5000), m, cursor, false, last)
    expect(cursor.firstChild.style.transform).toBe('scaleY(0)'); expect(cursor.lastChild.style.transform).toBe('scale(0)')
  })
  it('lite: слово заливается целиком, когда началось, курсор не двигается', () => {
    const { m, cursor, last } = setup()
    paint(karaokeFrame(plan, 100), m, cursor, true, last)
    expect(m.fills[0].style.clipPath).toBe('inset(0 0% 0 0)'); expect(m.fills[1].style.clipPath).toBe('inset(0 100% 0 0)')
    expect(cursor.style.transform).toBeUndefined()
  })
  it('нет узла курсора (рендер без него) — только заливка', () => {
    const { m, last } = setup()
    expect(() => paint(karaokeFrame(plan, 200), m, null, false, last)).not.toThrow()
    expect(m.fills[0].style.clipPath).toBe('inset(0 50% 0 0)')
  })
})
