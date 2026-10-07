import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// localStorage-пустышка: node без DOM. Модуль читает её при загрузке —
// поэтому перед каждым тестом сбрасываем модули и грузим заново
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
}

async function load() {
  vi.resetModules()
  return import('./lessonVolume.js')
}

describe('звук урока из шапки: состояние', () => {
  beforeEach(() => store.clear())

  it('по умолчанию звук есть и скорость 1×', async () => {
    const m = await load()
    expect(m.getLessonMuted()).toBe(false)
    expect(m.getVoiceRate()).toBe(1)
  })

  it('mute переключается, пишется в localStorage и переживает перезагрузку', async () => {
    let m = await load()
    m.setLessonMuted(true)
    expect(m.getLessonMuted()).toBe(true)
    expect(store.get('pithy_lesson_muted')).toBe('1')
    m = await load()
    expect(m.getLessonMuted()).toBe(true)
    m.setLessonMuted(false)
    expect(store.get('pithy_lesson_muted')).toBe('0')
  })

  it('скорость: только разрешённые значения, мусор → 1×, чужое число → ближайшее', async () => {
    const m = await load()
    expect(m.VOICE_RATES).toEqual([0.75, 1, 1.25, 1.5, 2])
    expect(m.clampVoiceRate('abc')).toBe(1)
    expect(m.clampVoiceRate(0)).toBe(1)
    expect(m.clampVoiceRate(-2)).toBe(1)
    expect(m.clampVoiceRate(0.5)).toBe(0.75)
    expect(m.clampVoiceRate(1.3)).toBe(1.25)
    expect(m.clampVoiceRate(3)).toBe(2)
    m.setVoiceRate('1.5')
    expect(m.getVoiceRate()).toBe(1.5)
    expect(store.get('pithy_voice_rate')).toBe('1.5')
  })

  it('сохранённая скорость читается при загрузке (и чистится от мусора)', async () => {
    store.set('pithy_voice_rate', '2')
    let m = await load()
    expect(m.getVoiceRate()).toBe(2)
    store.set('pithy_voice_rate', 'nope')
    m = await load()
    expect(m.getVoiceRate()).toBe(1)
  })

  it('подписчики зовутся на каждую смену, повтор того же значения молчит', async () => {
    const m = await load()
    const fn = vi.fn()
    const off = m.subscribeLessonVolume(fn)
    m.setLessonMuted(true)
    m.setLessonMuted(true)
    m.setVoiceRate(2)
    m.setVoiceRate(2)
    expect(fn).toHaveBeenCalledTimes(2)
    off()
    m.setLessonMuted(false)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('localStorage недоступен — состояние всё равно работает', async () => {
    const saved = globalThis.localStorage
    globalThis.localStorage = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
    try {
      const m = await load()
      expect(m.getLessonMuted()).toBe(false)
      expect(() => m.setLessonMuted(true)).not.toThrow()
      expect(m.getLessonMuted()).toBe(true)
    } finally {
      globalThis.localStorage = saved
    }
  })
})

describe('звук урока: применение к элементам', () => {
  beforeEach(() => store.clear())

  it('applyVoiceRate ставит playbackRate и сохраняет тембр', async () => {
    const m = await load()
    m.setVoiceRate(1.25)
    const el = {}
    m.applyVoiceRate(el)
    expect(el.playbackRate).toBe(1.25)
    expect(el.preservesPitch).toBe(true)
    expect(el.webkitPreservesPitch).toBe(true)
    expect(() => m.applyVoiceRate(null)).not.toThrow()
  })

  it('applyLessonVolume: медиа-элемент получает muted (свой || урока) и скорость; часы — только setRate', async () => {
    const m = await load()
    m.setVoiceRate(2)
    const el = {}
    m.applyLessonVolume(el)
    expect(el.muted).toBe(false)
    expect(el.playbackRate).toBe(2)
    m.setLessonMuted(true)
    m.applyLessonVolume(el)
    expect(el.muted).toBe(true)
    m.setLessonMuted(false)
    m.applyLessonVolume(el, true) // «Не могу слушать» повторения
    expect(el.muted).toBe(true)
    const clock = { setRate: vi.fn() }
    m.applyLessonVolume(clock)
    expect(clock.setRate).toHaveBeenCalledWith(2)
    expect(clock.muted).toBeUndefined()
  })

  it('хуки отдают текущее состояние (и работают в SSR-рендере)', async () => {
    const m = await load()
    m.setLessonMuted(true)
    m.setVoiceRate(0.75)
    const Probe = () => createElement('i', null, `${m.useLessonMuted()}/${m.useVoiceRate()}`)
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<i>true/0.75</i>')
  })
})
