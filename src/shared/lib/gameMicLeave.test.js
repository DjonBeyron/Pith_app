import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
const m = vi.hoisted(() => ({ closeAll: vi.fn(() => Promise.resolve({ closed: 2, kinds: ['sounds', 'game'], timedOut: 0 })), active: false, settle: vi.fn(() => true), closeGameMic: vi.fn(), shutGameMic: vi.fn(), hasGameMic: vi.fn(() => true), isGameMicIdle: vi.fn(() => true), stopAllMics: vi.fn(() => 1) }))
vi.mock('./gameMic.js', () => ({ closeGameMic: m.closeGameMic, shutGameMic: m.shutGameMic, hasGameMic: m.hasGameMic, isGameMicIdle: m.isGameMicIdle }))
vi.mock('./audioContextRegistry.js', () => ({ closeAll: m.closeAll }))
vi.mock('./gameMicSession.js', () => ({ gameAudioSession: { get active() { return m.active }, settle: m.settle } }))
vi.mock('./micRegistry.js', () => ({ stopAllMics: m.stopAllMics }))
const { leaveGameMic, shutAllMics, resetAudioAfterGame, LEAVE_SHUT_MS } = await import('./gameMicLeave.js')

describe('выход из игры (gameMicLeave)', () => {
  beforeEach(() => { vi.useFakeTimers(); Object.values(m).forEach(f => typeof f === 'function' && f.mockClear?.()); m.active = false; m.hasGameMic.mockReturnValue(true); m.isGameMicIdle.mockReturnValue(true) })
  afterEach(() => vi.useRealTimers())

  it('выход: дорожка выключается сразу, через LEAVE_SHUT_MS — игровой поток и все остальные дорожки закрываются', () => {
    leaveGameMic('выход из игры')
    expect(m.closeGameMic).toHaveBeenCalledTimes(1); expect(m.shutGameMic).not.toHaveBeenCalled()
    vi.advanceTimersByTime(LEAVE_SHUT_MS)
    expect(m.shutGameMic).toHaveBeenCalledWith('выход из игры'); expect(m.stopAllMics).toHaveBeenCalledWith('выход из игры')
  })
  it('новая игра успела начаться (begin → active) — не закрываем', () => {
    leaveGameMic(); m.active = true // begin() новой игры
    vi.advanceTimersByTime(LEAVE_SHUT_MS * 2)
    expect(m.shutGameMic).not.toHaveBeenCalled(); expect(m.stopAllMics).not.toHaveBeenCalled()
  })
  it('shutAllMics — сразу, без ожидания, и снимает отложенное закрытие', () => {
    leaveGameMic(); expect(shutAllMics('урок закрыт')).toBe(1)
    expect(m.shutGameMic).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(LEAVE_SHUT_MS * 2); expect(m.shutGameMic).toHaveBeenCalledTimes(1)
  })

  it('resetAudioAfterGame: тип auto → закрыть ВСЕ контексты, тип остаётся auto; начавшуюся заново игру не трогает', async () => {
    const nav = { audioSession: { type: 'playback' } }
    const types = []
    Object.defineProperty(nav, 'audioSession', { value: { get type() { return types.at(-1) ?? 'playback' }, set type(v) { types.push(v) } } })
    const r = await resetAudioAfterGame('выход', { nav })
    expect(types).toEqual(['auto']); expect(m.closeAll).toHaveBeenCalledTimes(1); expect(r.closed).toBe(2); expect(m.settle).not.toHaveBeenCalled() // тип остаётся auto
    m.closeAll.mockClear(); m.settle.mockClear(); m.active = true
    expect(await resetAudioAfterGame('выход', { nav })).toBeNull(); expect(m.closeAll).not.toHaveBeenCalled(); expect(m.settle).not.toHaveBeenCalled()
  })
  it('после выхода кто-то снова включил дорожку (idle=false) — всё равно закрываем: игры нет (регресс «после второго выхода точка висит»)', () => {
    leaveGameMic(); m.isGameMicIdle.mockReturnValue(false)
    vi.advanceTimersByTime(LEAVE_SHUT_MS)
    expect(m.shutGameMic).toHaveBeenCalledTimes(1); expect(m.stopAllMics).toHaveBeenCalledTimes(1)
  })
})
