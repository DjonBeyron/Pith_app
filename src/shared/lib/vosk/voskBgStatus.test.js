import { describe, it, expect, vi, beforeEach } from 'vitest'
import { INITIAL_STATUS, getBgStatus, setBgStatus, resetBgStatus, subscribeBgStatus, bgStatusText } from './voskBgStatus.js'

const S = o => ({ ...INITIAL_STATUS, ...o })
beforeEach(() => resetBgStatus())

describe('статус фоновой загрузки для админа', () => {
  it('подписка получает изменения и сброс; отписка работает', () => {
    const f = vi.fn()
    const off = subscribeBgStatus(f)
    setBgStatus({ state: 'downloading', pct: 5 })
    expect(getBgStatus()).toMatchObject({ state: 'downloading', pct: 5 })
    resetBgStatus()
    expect(getBgStatus()).toEqual(INITIAL_STATUS)
    expect(f).toHaveBeenCalledTimes(2)
    off(); setBgStatus({ state: 'cached' })
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('строка статуса: в кэше / качается X% / ждёт (причина) / ошибка / выключена', () => {
    expect(bgStatusText(S({ state: 'cached' }))).toBe('в кэше')
    expect(bgStatusText(S({}), true)).toBe('в кэше')
    expect(bgStatusText(S({ state: 'downloading', pct: 42, mode: 'range' }))).toBe('качается 42% (кусками)')
    expect(bgStatusText(S({ state: 'downloading', pct: null, loaded: 1048576, mode: 'full' }))).toBe('качается 1.0 МБ (целиком)')
    expect(bgStatusText(S({ state: 'waiting', reason: 'feed' }))).toBe('ждёт (причина: лента)')
    expect(bgStatusText(S({ state: 'waiting', reason: 'video', loaded: 2097152, pct: 5 }))).toBe('ждёт (причина: видео) · скачано 5%')
    expect(bgStatusText(S({ state: 'waiting', reason: 'offline' }))).toContain('офлайн')
    expect(bgStatusText(S({ state: 'waiting', reason: 'saveData' }))).toContain('экономия трафика')
    expect(bgStatusText(S({ state: 'waiting', reason: 'busy' }))).toContain('занято')
    expect(bgStatusText(S({ state: 'error', error: 'Сеть пропала — повторите', attempt: 2 }))).toBe('ошибка: Сеть пропала — повторите (попытка 2)')
    expect(bgStatusText(S({ state: 'off' }))).toBe('выключена')
    expect(bgStatusText(S({}))).toBe('ещё не запускалась')
  })
})
