import { describe, it, expect, vi, beforeEach } from 'vitest'

// Хук режимов игры (useGameAudioModes): эффект выполняется сразу, без рендера React
const state = vi.hoisted(() => ({ cleanup: null }))
vi.mock('react', async orig => ({ ...(await orig()), useEffect: fn => { state.cleanup = fn() } }))
const mic = vi.hoisted(() => ({ has: true, drop: vi.fn(), open: vi.fn() }))
vi.mock('../../../../shared/lib/gameAudioSignals.js', () => ({ reportAudioLoss: (...a) => loss(...a) }))
vi.mock('../../../../shared/lib/gameMic.js', () => ({ hasGameMic: () => mic.has, dropGameMic: mic.drop, openGameMic: mic.open, peekGameMic: () => null, parkGameMic: () => ({ parked: false, wasTaken: false }), reopenGameMic: () => Promise.resolve('unavailable'), isGameMicIdle: () => false }))

import { useGameAudioModes, endGameAudio } from './useGameAudioModes.js'
import { gameMicHold } from '../../../../shared/lib/gameMicHold.js'
import { gameAudioSession } from '../../../../shared/lib/gameMicSession.js'

const loss = vi.fn()
beforeEach(() => { loss.mockClear(); mic.has = true; mic.drop.mockClear(); mic.open.mockReset(); state.cleanup = null })

describe('useGameAudioModes', () => {
  it('монтирование начинает сессию игры и ставит обработчик «дорожка не ожила»; размонтирование закрывает окна речи и снимает обработчик', () => {
    const begin = vi.spyOn(gameAudioSession, 'begin')
    const end = vi.spyOn(gameAudioSession, 'end')
    const reset = vi.spyOn(gameMicHold, 'reset')
    useGameAudioModes(() => {})
    expect(begin).toHaveBeenCalled()
    state.cleanup()
    expect(reset).toHaveBeenCalled()
    expect(end).toHaveBeenCalled()
    begin.mockRestore(); end.mockRestore(); reset.mockRestore()
  })

  it('дорожка не ожила после глушения: поток сбрасывается, микрофон НЕ открывается (вне жеста iOS показал бы диалог), игра получает сигнал паузы; без игрового потока ничего', async () => {
    const reopened = vi.fn()
    let dead
    const spy = vi.spyOn(gameMicHold, 'setDeadHandler').mockImplementation(fn => { dead ??= fn })
    useGameAudioModes(reopened)
    dead('ended')
    expect(mic.drop).toHaveBeenCalledTimes(1)
    expect(mic.open).not.toHaveBeenCalled()
    expect(loss).toHaveBeenCalledWith('mic-dead-ended')
    await Promise.resolve()
    expect(reopened).not.toHaveBeenCalled()
    mic.has = false
    dead('ended')
    expect(mic.drop).toHaveBeenCalledTimes(1); expect(loss).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('endGameAudio безопасен без начатой игры', () => {
    expect(() => endGameAudio()).not.toThrow()
  })
})
