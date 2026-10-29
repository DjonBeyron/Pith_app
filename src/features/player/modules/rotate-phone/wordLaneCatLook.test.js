import { describe, it, expect } from 'vitest'
import { createCatLook, drawCatMouth, NO_LOOK, TALK_OFF_MS } from './wordLaneCatLook.js'
import { TAIL_MS } from '../../../scene/v2/talkTail.js'
import { PUPIL_DILATE, PUPIL_MS, IDLE_MIN_MS, MAX_LOOK } from '../../../scene/v2/pupilLook.js'
import { MASCOT_PACKS } from '../../../scene/v2/sprites/mascot/mascots.js'

const K = MASCOT_PACKS.kit.fit.k

// Корень <g class="scn-cat"> с style / classList; таймеры и случайность — руками
function setup({ rands = [] } = {}) {
  const vars = {}
  const classes = new Set()
  const root = {
    style: { setProperty: (k, v) => { vars[k] = v }, removeProperty: k => { delete vars[k] } },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
  }
  const timers = []
  let id = 0
  const t = {
    setTimeout: (fn, ms) => { timers.push({ id: ++id, fn, ms }); return id },
    clearTimeout: i => { const k = timers.findIndex(x => x.id === i); if (k >= 0) timers.splice(k, 1) },
  }
  const fire = ms => { const k = timers.findIndex(x => x.ms === ms); if (k < 0) throw new Error(`нет таймера на ${ms} мс`); const [x] = timers.splice(k, 1); x.fn() }
  let r = 0
  const rand = () => (r < rands.length ? rands[r++] : 0.5)
  const look = createCatLook({ getRoot: () => root, skin: 'kit', timers: t, rand })
  const idle = () => timers.filter(x => x.ms >= IDLE_MIN_MS)
  return { look, vars, classes, timers, fire, idle }
}

describe('кот: «живой Пит v2» — зрачки', () => {
  it('начало речи: взгляд прямо (в игре один персонаж), зрачок расширяется на PUPIL_MS и возвращается — переменные на общем родителе голов', () => {
    const s = setup()
    s.look.lineStart()
    expect(+s.vars['--look-x']).toBe(0)
    expect(+s.vars['--look-y']).toBe(0)
    expect(s.vars['--pupil']).toBe(String(PUPIL_DILATE))
    s.fire(PUPIL_MS)
    expect(s.vars['--pupil']).toBeUndefined()
  })

  it('граница слова: саккада пишет --look-x / --look-y в пределах MAX_LOOK px спрайта, без саккады взгляд возвращается в центр', () => {
    const s = setup({ rands: [0.1, 1, 0.5, /* саккада */ 0.9 /* без саккады */] })
    s.look.lineStart()
    s.look.word()
    expect(Math.abs(+s.vars['--look-x'] * K)).toBeGreaterThan(0)
    expect(Math.abs(+s.vars['--look-x'] * K)).toBeLessThanOrEqual(MAX_LOOK)
    expect(Math.abs(+s.vars['--look-y'] * K)).toBeLessThanOrEqual(MAX_LOOK)
    s.look.word()
    expect(+s.vars['--look-x']).toBeCloseTo(0)
  })

  it('дрейф в тишине: idle(true) заводит таймер, idle(false) его снимает; повторное idle(true) таймер не дублирует', () => {
    const s = setup()
    expect(s.idle()).toHaveLength(0)
    s.look.idle(true)
    s.look.idle(true)
    expect(s.idle()).toHaveLength(1)
    s.look.idle(false)
    expect(s.idle()).toHaveLength(0)
  })

  it('дрейф уводит взгляд в сторону и возвращает; пока идёт речь (lineStart), кот в сторону не смотрит', () => {
    const s = setup({ rands: [0.5, 0.9, 0.5] })
    s.look.idle(true)
    s.fire(s.idle()[0].ms)
    expect(+s.vars['--look-x']).not.toBe(0)
    const quiet = setup()
    quiet.look.lineStart()
    quiet.look.idle(true)
    quiet.fire(quiet.idle()[0].ms)
    expect(+quiet.vars['--look-x']).toBe(0)
  })

  it('stop: таймеры сняты, переменные и класс убраны', () => {
    const s = setup()
    s.look.lineStart(); s.look.talking(true); s.look.idle(true)
    s.look.stop()
    expect(s.timers).toHaveLength(0)
    expect(s.vars).toEqual({})
    expect(s.classes.has('is-talking')).toBe(false)
  })
})

describe('кот: is-talking (усы)', () => {
  it('talking(true) ставит класс сразу; talking(false) снимает его не сразу, а через TALK_OFF_MS', () => {
    const s = setup()
    s.look.talking(true)
    expect(s.classes.has('is-talking')).toBe(true)
    s.look.talking(false)
    expect(s.classes.has('is-talking')).toBe(true)
    expect(s.timers.map(x => x.ms)).toEqual([TALK_OFF_MS])
    s.fire(TALK_OFF_MS)
    expect(s.classes.has('is-talking')).toBe(false)
  })

  it('короткая пауза в речи класс не снимает: talking(true) отменяет ожидающее снятие', () => {
    const s = setup()
    s.look.talking(true); s.look.talking(false)
    s.look.talking(true)
    expect(s.timers).toHaveLength(0)
    expect(s.classes.has('is-talking')).toBe(true)
  })

  it('вызовы каждый кадр не множат таймеры: false много раз — один таймер, true много раз — ни одного; без речи false вообще ничего не заводит', () => {
    const s = setup()
    s.look.talking(false)
    expect(s.timers).toHaveLength(0)
    for (let i = 0; i < 20; i++) s.look.talking(true)
    expect(s.timers).toHaveLength(0)
    for (let i = 0; i < 20; i++) s.look.talking(false)
    expect(s.timers).toHaveLength(1)
  })
})

describe('кот: усы доезжают до покоя (хвост is-tail), а не обрываются', () => {
  it('речь кончилась: через TALK_OFF_MS is-talking снят, но в ТОТ ЖЕ момент поставлен is-tail — анимация усов не пропадает ни на кадр; хвост снимается через TAIL_MS', () => {
    const s = setup()
    s.look.talking(true)
    s.look.talking(false)
    s.fire(TALK_OFF_MS)
    expect(s.classes.has('is-talking')).toBe(false)
    expect(s.classes.has('is-tail')).toBe(true)
    expect(s.timers.map(x => x.ms)).toEqual([TAIL_MS])
    s.fire(TAIL_MS)
    expect(s.classes.has('is-tail')).toBe(false)
  })

  it('заговорил снова, пока хвост идёт: is-talking вернулся, хвост и его таймер сняты (анимация та же, фаза не сбрасывается)', () => {
    const s = setup()
    s.look.talking(true); s.look.talking(false); s.fire(TALK_OFF_MS)
    s.look.talking(true)
    expect(s.classes.has('is-talking')).toBe(true)
    expect(s.classes.has('is-tail')).toBe(false)
    expect(s.timers).toHaveLength(0)
  })

  it('release() (пауза игры): без выдержки TALK_OFF_MS — is-talking снят сразу, хвост поставлен, ожидающее снятие отменено; без речи ничего не делает', () => {
    const s = setup()
    s.look.release()
    expect(s.classes.has('is-tail')).toBe(false)
    s.look.talking(true); s.look.talking(false)
    s.look.release()
    expect(s.classes.has('is-talking')).toBe(false)
    expect(s.classes.has('is-tail')).toBe(true)
    expect(s.timers.map(x => x.ms)).toEqual([TAIL_MS])
    s.look.release()
    expect(s.timers).toHaveLength(1) // повторный release не множит таймеры
  })

  it('stop (кот убран): ни is-talking, ни is-tail, ни таймеров', () => {
    const s = setup()
    s.look.talking(true); s.look.release()
    s.look.stop()
    expect(s.classes.size).toBe(0)
    expect(s.timers).toHaveLength(0)
  })
})

describe('слабое устройство: NO_LOOK', () => {
  it('все методы есть и ничего не делают', () => {
    for (const k of ['lineStart', 'word', 'lineEnd', 'idle', 'talking', 'release', 'stop']) expect(() => NO_LOOK[k](true)).not.toThrow()
    expect(Object.isFrozen(NO_LOOK)).toBe(true)
  })
})

// Голова: атрибуты и четыре узла рта
function fakeHead() {
  const attrs = { 'data-skin': 'kit', 'data-face': 'base', 'data-mouth': 'closed' }
  const nodes = {}
  const node = () => { const a = {}; return { a, setAttribute: (k, v) => { a[k] = v } } }
  return {
    attrs,
    getAttribute: k => (k in attrs ? attrs[k] : null),
    setAttribute: (k, v) => { attrs[k] = String(v) },
    removeAttribute: k => { delete attrs[k] },
    querySelector: sel => (nodes[sel] ??= node()),
  }
}

describe('рот кота: data-vis на голове для широких форм', () => {
  it('код D / E — data-vis пишется, data-mouth снимается; другая форма — data-vis меняется на неё', () => {
    const h = fakeHead()
    drawCatMouth(h, 'D')
    expect(h.attrs['data-vis']).toBe('D')
    expect(h.attrs['data-mouth']).toBeUndefined()
    drawCatMouth(h, 'E')
    expect(h.attrs['data-vis']).toBe('E')
    drawCatMouth(h, 'B')
    expect(h.attrs['data-vis']).toBe('B')
  })

  it('«open» без буквы — широкая форма D; closed / half data-vis снимают', () => {
    const h = fakeHead()
    drawCatMouth(h, 'open')
    expect(h.attrs['data-vis']).toBe('D')
    drawCatMouth(h, 'half')
    expect(h.attrs['data-vis']).toBeUndefined()
    expect(h.attrs['data-mouth']).toBe('half')
    drawCatMouth(h, 'D')
    drawCatMouth(h, 'closed')
    expect(h.attrs['data-vis']).toBeUndefined()
    expect(h.attrs['data-mouth']).toBe('closed')
  })

  it('нет головы — ничего не делает', () => {
    expect(() => drawCatMouth(undefined, 'D')).not.toThrow()
  })
})
