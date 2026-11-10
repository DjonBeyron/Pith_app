import { describe, it, expect, vi, beforeEach } from 'vitest'

// Переоткрытие оглохшего игрового потока — один путь для игры и стенда пилюль: dropGameMic + openGameMic; после паузы (нужен жест) — нет; без игрового потока — нет.
const mic = vi.hoisted(() => ({ has: true, drop: vi.fn(), open: vi.fn(() => Promise.resolve('granted')) }))
vi.mock('./gameMic.js', () => ({ hasGameMic: () => mic.has, dropGameMic: mic.drop, openGameMic: mic.open }))
const { renewGameMic } = await import('./gameMicRenew.js')
const { gameMicGesture } = await import('./gameMicGesture.js')

describe('renewGameMic', () => {
  beforeEach(() => { mic.has = true; mic.drop.mockClear(); mic.open.mockClear(); gameMicGesture.grant() })
  it('поток есть — выбросить и открыть заново; строка журнала', async () => {
    const log = vi.fn()
    expect(await renewGameMic({ why: '[mic] стенд: rms 0', log })).toBe('granted')
    expect(mic.drop).toHaveBeenCalledTimes(1); expect(mic.open).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('[mic] стенд: rms 0 — переоткрываю')
  })
  it('после паузы нужен жест — не открываем (gesture: false — открываем всё равно); без игрового потока — none', async () => {
    gameMicGesture.require()
    expect(await renewGameMic({ log: () => {} })).toBe('gesture')
    expect(mic.open).not.toHaveBeenCalled()
    expect(await renewGameMic({ log: () => {}, gesture: false })).toBe('granted')
    mic.has = false
    expect(await renewGameMic({ log: () => {} })).toBe('none')
  })
})
