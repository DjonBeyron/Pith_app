import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
const m = vi.hoisted(() => ({ closeGameMic: vi.fn(), shutGameMic: vi.fn(), hasGameMic: vi.fn(() => true), isGameMicIdle: vi.fn(() => true), stopAllMics: vi.fn(() => 1) }))
vi.mock('./gameMic.js', () => ({ closeGameMic: m.closeGameMic, shutGameMic: m.shutGameMic, hasGameMic: m.hasGameMic, isGameMicIdle: m.isGameMicIdle }))
vi.mock('./micRegistry.js', () => ({ stopAllMics: m.stopAllMics }))
const { leaveGameMic, shutAllMics, LEAVE_SHUT_MS } = await import('./gameMicLeave.js')

describe('выход из игры (gameMicLeave)', () => {
  beforeEach(() => { vi.useFakeTimers(); Object.values(m).forEach(f => f.mockClear()); m.hasGameMic.mockReturnValue(true); m.isGameMicIdle.mockReturnValue(true) })
  afterEach(() => vi.useRealTimers())

  it('выход: дорожка выключается сразу, через LEAVE_SHUT_MS — игровой поток и все остальные дорожки закрываются', () => {
    leaveGameMic('выход из игры')
    expect(m.closeGameMic).toHaveBeenCalledTimes(1); expect(m.shutGameMic).not.toHaveBeenCalled()
    vi.advanceTimersByTime(LEAVE_SHUT_MS)
    expect(m.shutGameMic).toHaveBeenCalledWith('выход из игры'); expect(m.stopAllMics).toHaveBeenCalledWith('выход из игры')
  })
  it('новая игра успела взять поток (он не «выключен») — не закрываем', () => {
    leaveGameMic(); m.isGameMicIdle.mockReturnValue(false)
    vi.advanceTimersByTime(LEAVE_SHUT_MS * 2)
    expect(m.shutGameMic).not.toHaveBeenCalled(); expect(m.stopAllMics).not.toHaveBeenCalled()
  })
  it('shutAllMics — сразу, без ожидания, и снимает отложенное закрытие', () => {
    leaveGameMic(); expect(shutAllMics('урок закрыт')).toBe(1)
    expect(m.shutGameMic).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(LEAVE_SHUT_MS * 2); expect(m.shutGameMic).toHaveBeenCalledTimes(1)
  })
})
