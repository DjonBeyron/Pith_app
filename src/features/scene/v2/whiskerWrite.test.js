import { describe, it, expect, beforeEach } from 'vitest'
import {
  WHISKER_MODE_KEY, WHISKER_MODES, DEFAULT_WHISKER_MODE, readWhiskerMode, writeWhiskerMode, getWhiskerMode, setWhiskerMode, forgetWhiskerMode,
  whiskerModeLine, whiskerWriter, forgetAnchors,
} from './whiskerWrite.js'

// Способы записи угла уса (rotate / transform / attr) и выбор способа на устройстве
const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const broken = { getItem() { throw new Error('private') }, setItem() { throw new Error('private') }, removeItem() { throw new Error('private') } }

function ear(side, d, bbox = { x: 10, y: 20, width: 40, height: 6 }) {
  const attrs = { d }
  const log = { bbox: 0 }
  return {
    w: { el: null, kind: { side, low: false } }, attrs, log, bbox,
    wire(w) {
      w.el = {
        style: { rotate: '', transform: '', transformOrigin: '', transformBox: '' },
        getAttribute: n => attrs[n] ?? null, setAttribute: (n, v) => { attrs[n] = String(v) }, removeAttribute: n => { delete attrs[n] },
        getBBox: () => { log.bbox += 1; return this.bbox },
      }
      return w
    },
  }
}
const make = (side, d, bbox) => { const e = ear(side, d, bbox); e.wire(e.w); return e }

beforeEach(() => { forgetWhiskerMode(); forgetAnchors() })

describe('режим записи: ключ pithy_whisker_mode_v1', () => {
  it('три режима, по умолчанию attr (самый совместимый путь для WebKit)', () => {
    expect(WHISKER_MODE_KEY).toBe('pithy_whisker_mode_v1')
    expect(WHISKER_MODES).toEqual(['rotate', 'transform', 'attr'])
    expect(DEFAULT_WHISKER_MODE).toBe('attr')
  })

  it('читается из хранилища; нет ключа, мусор, закрытое хранилище — по умолчанию', () => {
    expect(readWhiskerMode(memStore())).toBe('attr')
    expect(readWhiskerMode(memStore({ [WHISKER_MODE_KEY]: 'rotate' }))).toBe('rotate')
    expect(readWhiskerMode(memStore({ [WHISKER_MODE_KEY]: 'transform' }))).toBe('transform')
    expect(readWhiskerMode(memStore({ [WHISKER_MODE_KEY]: 'spin' }))).toBe('attr')
    expect(readWhiskerMode(broken)).toBe('attr')
    expect(readWhiskerMode(null)).toBe('attr')
  })

  it('пишется; режим по умолчанию снимает ключ; чужое значение и закрытое хранилище не роняют', () => {
    const s = memStore()
    writeWhiskerMode('rotate', s)
    expect(s.m).toEqual({ [WHISKER_MODE_KEY]: 'rotate' })
    writeWhiskerMode('nope', s)
    expect(s.m).toEqual({ [WHISKER_MODE_KEY]: 'rotate' })
    writeWhiskerMode('attr', s)
    expect(s.m).toEqual({})
    expect(() => writeWhiskerMode('transform', broken)).not.toThrow()
  })

  it('текущий режим живёт в памяти: HUD меняет его сразу, привод читает без обращения к localStorage; закрытое хранилище режим не теряет', () => {
    const s = memStore({ [WHISKER_MODE_KEY]: 'transform' })
    forgetWhiskerMode()
    expect(getWhiskerMode()).toBeDefined()
    setWhiskerMode('rotate', s)
    expect(getWhiskerMode()).toBe('rotate')
    expect(s.m[WHISKER_MODE_KEY]).toBe('rotate')
    setWhiskerMode('bogus', s)
    expect(getWhiskerMode()).toBe('rotate')
    setWhiskerMode('transform', broken)
    expect(getWhiskerMode()).toBe('transform')
  })

  it('строка для журнала отладки: режим и откуда он', () => {
    setWhiskerMode('attr', memStore())
    expect(whiskerModeLine()).toBe('режим attr (по умолчанию)')
    setWhiskerMode('rotate', memStore())
    expect(whiskerModeLine()).toBe('режим rotate (выбран в HUD)')
  })
})

describe('способы записи угла', () => {
  it('rotate: style.rotate = «N.NNdeg», clear снимает', () => {
    const e = make('l', 'M1')
    const wr = whiskerWriter('rotate')
    expect(wr.apply(e.w, 3.456)).toBe(true)
    expect(e.w.el.style.rotate).toBe('3.46deg')
    expect(e.w.el.style.transform).toBe('')
    expect(e.attrs.transform).toBeUndefined()
    wr.clear(e.w)
    expect(e.w.el.style.rotate).toBe('')
  })

  it('transform: style.transform = «rotate(N.NNdeg)», clear снимает', () => {
    const e = make('l', 'M1')
    const wr = whiskerWriter('transform')
    wr.apply(e.w, -2)
    expect(e.w.el.style.transform).toBe('rotate(-2.00deg)')
    expect(e.w.el.style.rotate).toBe('')
    wr.clear(e.w)
    expect(e.w.el.style.transform).toBe('')
  })

  it('attr: атрибут transform="rotate(N cx cy)" с явным центром — у левого уса правый край fill-box, у правого левый, середина по высоте', () => {
    const l = make('l', 'M-l'), r = make('r', 'M-r')
    const wr = whiskerWriter('attr')
    wr.apply(l.w, 4); wr.apply(r.w, -4)
    expect(l.attrs.transform).toBe('rotate(4.00 50 23)') // 10 + 40, 20 + 6/2
    expect(r.attrs.transform).toBe('rotate(-4.00 10 23)')
    expect(l.w.el.style.rotate).toBe('')
    expect(l.w.el.style.transform).toBe('')
  })

  it('attr: CSS-якорь (transform-box / transform-origin) на время записи нейтрализован inline, при снятии — возвращён; без записи атрибута и стилей не остаётся', () => {
    const e = make('l', 'M1')
    const wr = whiskerWriter('attr')
    wr.apply(e.w, 1)
    expect(e.w.el.style.transformOrigin).toBe('0 0')
    expect(e.w.el.style.transformBox).toBe('view-box')
    wr.clear(e.w)
    expect(e.attrs.transform).toBeUndefined()
    expect(e.w.el.style.transformOrigin).toBe('')
    expect(e.w.el.style.transformBox).toBe('')
  })

  it('attr: центр считается один раз (getBBox вызван единожды на ус) и делится по контуру между усами разных голов', () => {
    const a = make('l', 'M-same'), b = make('l', 'M-same')
    const wr = whiskerWriter('attr')
    wr.apply(a.w, 1); wr.apply(a.w, 2); wr.apply(a.w, 3)
    expect(a.log.bbox).toBe(1)
    wr.apply(b.w, 1)
    expect(b.log.bbox).toBe(0) // якорь взят из кэша по контуру (скрытая голова base / love / shy)
    expect(b.attrs.transform).toBe(a.attrs.transform.replace(/^rotate\(3\.00/, 'rotate(1.00'))
  })

  it('attr: скрытый ус (getBBox → нули или ошибка) — не пишет, пробует позже (не на каждом кадре), потом пишет', () => {
    const e = make('r', 'M-hidden', { x: 0, y: 0, width: 0, height: 0 })
    const wr = whiskerWriter('attr')
    expect(wr.apply(e.w, 2)).toBe(false)
    expect(e.attrs.transform).toBeUndefined()
    const calls = e.log.bbox
    for (let i = 0; i < 10; i++) wr.apply(e.w, 2)
    expect(e.log.bbox).toBe(calls) // между попытками пауза
    e.bbox = { x: 5, y: 5, width: 10, height: 2 }
    for (let i = 0; i < 25; i++) wr.apply(e.w, 2)
    expect(e.attrs.transform).toBe('rotate(2.00 5 6)')
    const thrower = make('l', 'M-throws')
    thrower.w.el.getBBox = () => { throw new Error('display: none') }
    expect(whiskerWriter('attr').apply(thrower.w, 1)).toBe(false)
  })

  it('неизвестный режим — как по умолчанию (attr)', () => {
    expect(whiskerWriter('x')).toBe(whiskerWriter('attr'))
    expect(whiskerWriter(undefined)).toBe(whiskerWriter(DEFAULT_WHISKER_MODE))
  })
})
