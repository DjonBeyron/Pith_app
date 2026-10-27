import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  PRESETS, nextRemindLabel, confirmText, deviceClock, pushBranch, presetOf, parseTime,
  remindAsked, markRemindAsked, remindRowText,
} from './remindAsk.js'

const at = (h, m) => new Date(2026, 9, 27, h, m, 0)

describe('remindAsk — тексты', () => {
  it('пресеты: 9:00, 14:00, 20:00', () => {
    expect(PRESETS).toEqual([[9, 0], [14, 0], [20, 0]])
  })

  it('«Сегодня», если время ещё впереди, иначе «Завтра»', () => {
    expect(nextRemindLabel({ hh: 20, mm: 0 }, at(12, 0))).toBe('Сегодня в 20:00')
    expect(nextRemindLabel({ hh: 7, mm: 40 }, at(12, 0))).toBe('Завтра в 7:40')
    expect(nextRemindLabel({ hh: 20, mm: 0 }, at(20, 0))).toBe('Завтра в 20:00') // ровно сейчас — уже не впереди
    expect(nextRemindLabel({ hh: 20, mm: 5 }, at(20, 4))).toBe('Сегодня в 20:05')
  })

  it('подтверждение с конкретикой', () => {
    const sel = { hh: 20, mm: 0, enabled: true }
    expect(confirmText(sel, { now: at(21, 0) })).toBe('Готово. Завтра в 20:00 придёт одно уведомление про слово')
    expect(confirmText(sel, { now: at(9, 0) })).toBe('Готово. Сегодня в 20:00 придёт одно уведомление про слово')
  })

  it('«Не нужно» — Пит не пишет', () => {
    expect(confirmText({ enabled: false })).toBe('Хорошо. Пит не будет писать — загляни, когда захочешь')
    expect(confirmText(null)).toBe('Хорошо. Пит не будет писать — загляни, когда захочешь')
  })

  it('пояса ещё нет (needs_tz) — без обещания точного дня', () => {
    expect(confirmText({ hh: 20, mm: 0, enabled: true }, { needsTz: true }))
      .toBe('Готово. Пит напомнит в 20:00 по твоему времени')
  })

  it('гость — обещание «после входа», не уведомление', () => {
    expect(confirmText({ hh: 9, mm: 30, enabled: true }, { guest: true })).toContain('когда войдёшь в аккаунт')
  })

  it('часы устройства', () => {
    expect(deviceClock(at(21, 5))).toBe('по твоим часам сейчас 21:05')
    expect(deviceClock(at(7, 40))).toBe('по твоим часам сейчас 07:40')
  })

  it('строка настроек', () => {
    expect(remindRowText(null)).toBe('Напоминание: не выбрано')
    expect(remindRowText({ hh: 20, mm: 0, enabled: true })).toBe('Напоминание: 20:00')
    expect(remindRowText({ hh: 20, mm: 0, enabled: false })).toBe('Напоминание: выключено')
  })
})

describe('remindAsk — ветка уведомлений', () => {
  const base = { isIos: false, standalone: false, permission: 'default' }
  it('обычный браузер, разрешение не спрашивали — просим по тапу', () => {
    expect(pushBranch(base)).toBe('ask')
    expect(pushBranch({ ...base, isIos: true, standalone: true })).toBe('ask')
  })
  it('iPhone не с экрана «Домой» — предлагаем добавить', () => {
    expect(pushBranch({ ...base, isIos: true, permission: 'unsupported' })).toBe('add_home')
    expect(pushBranch({ ...base, isIos: true })).toBe('add_home')
  })
  it('уже включены / запрещены / не поддерживаются — не уговариваем', () => {
    expect(pushBranch({ ...base, permission: 'granted' })).toBe('granted')
    expect(pushBranch({ ...base, permission: 'denied' })).toBe('denied')
    expect(pushBranch({ ...base, isIos: true, permission: 'denied' })).toBe('denied')
    expect(pushBranch({ ...base, permission: 'unsupported' })).toBe('denied')
  })
  it('гость — отдельная ветка', () => {
    expect(pushBranch({ ...base, guest: true })).toBe('guest')
  })
})

describe('remindAsk — выбор и разбор', () => {
  it('preset для события', () => {
    expect(presetOf({ hh: 9, mm: 0, enabled: true }, false)).toBe('9')
    expect(presetOf({ hh: 14, mm: 0, enabled: true }, false)).toBe('14')
    expect(presetOf({ hh: 20, mm: 0, enabled: true }, false)).toBe('20')
    expect(presetOf({ hh: 20, mm: 0, enabled: true }, true)).toBe('custom') // набрал сам
    expect(presetOf({ hh: 7, mm: 40, enabled: true }, true)).toBe('custom')
    expect(presetOf({ enabled: false }, false)).toBe('none')
  })

  it('parseTime: «20:05» → часы и минуты, мусор → null', () => {
    expect(parseTime('20:05')).toEqual({ hh: 20, mm: 5 })
    expect(parseTime('07:40:30')).toEqual({ hh: 7, mm: 40 })
    expect(parseTime('')).toBeNull()
    expect(parseTime('25:00')).toBeNull()
    expect(parseTime(undefined)).toBeNull()
  })
})

describe('remindAsk — флаг «уже спрашивали»', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('ставится один раз и читается', () => {
    const store = {}
    vi.stubGlobal('localStorage', { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v) } })
    expect(remindAsked()).toBe(false)
    markRemindAsked()
    expect(store.pithy_remind_asked_v1).toBe('1')
    expect(remindAsked()).toBe(true)
  })
  it('без хранилища не спрашиваем', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('нет') }, setItem: () => { throw new Error('нет') } })
    expect(remindAsked()).toBe(true)
    expect(() => markRemindAsked()).not.toThrow()
  })
})
