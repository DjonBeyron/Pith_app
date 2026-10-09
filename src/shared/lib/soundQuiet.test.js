import { describe, it, expect, beforeEach, vi } from 'vitest'
import { holdSoundQuiet, suppressSound, isSoundQuiet, suppressedCount, _resetSoundQuiet } from './soundQuiet.js'

beforeEach(() => _resetSoundQuiet())

describe('окно тишины звуков приложения на время записи голоса', () => {
  it('без удержания звуки не перехватываются', () => {
    const replay = vi.fn()
    expect(isSoundQuiet()).toBe(false)
    expect(suppressSound('message-in', replay)).toBe(false)
    expect(replay).not.toHaveBeenCalled()
  })

  it('пока окно открыто, звук перехвачен; message-in и xp-gain играют ОДИН раз после закрытия, остальные отброшены', () => {
    const release = holdSoundQuiet()
    const msg = vi.fn(), xp = vi.fn(), ok = vi.fn(), typing = vi.fn()
    expect(suppressSound('message-in', msg)).toBe(true)
    expect(suppressSound('message-in', msg)).toBe(true) // дубль того же звука
    expect(suppressSound('xp-gain', xp)).toBe(true)
    expect(suppressSound('answer-correct', ok)).toBe(true)
    expect(suppressSound('typing-1', typing)).toBe(true)
    expect(suppressedCount()).toBe(5)
    expect(msg).not.toHaveBeenCalled()
    release()
    expect(msg).toHaveBeenCalledTimes(1)
    expect(xp).toHaveBeenCalledTimes(1)
    expect(ok).not.toHaveBeenCalled()
    expect(typing).not.toHaveBeenCalled()
    expect(isSoundQuiet()).toBe(false)
  })

  it('несколько владельцев: окно закрывается, когда отпустил последний; повторный release безопасен', () => {
    const a = holdSoundQuiet(), b = holdSoundQuiet()
    const msg = vi.fn()
    suppressSound('message-in', msg)
    a(); a()
    expect(isSoundQuiet()).toBe(true)
    expect(msg).not.toHaveBeenCalled()
    b()
    expect(isSoundQuiet()).toBe(false)
    expect(msg).toHaveBeenCalledTimes(1)
  })

  it('ошибка в отложенном звуке не ломает release', () => {
    const release = holdSoundQuiet()
    suppressSound('message-in', () => { throw new Error('x') })
    expect(() => release()).not.toThrow()
  })
})
