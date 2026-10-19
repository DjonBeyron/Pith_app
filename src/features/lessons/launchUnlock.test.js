import { describe, it, expect, vi } from 'vitest'
import { unlockSafely } from './launchUnlock.js'

describe('разблокировка звука в жесте запуска', () => {
  it('исключение в одном шаге не обрывает остальные и сам старт', () => {
    const calls = []
    const steps = {
      preloadSounds: () => calls.push('a'),
      unlockAudio: () => { throw new Error('boom') },
      primeAudio: () => calls.push('c'),
      unlockSceneAudioForLesson: nodes => calls.push(`d:${nodes.length}`),
    }
    expect(() => unlockSafely([1, 2], steps)).not.toThrow()
    expect(calls).toEqual(['a', 'c', 'd:2'])
  })
  it('ошибка шага пишется в лог', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    unlockSafely([], { x: () => { throw new Error('speech') } })
    spy.mockRestore()
  })
})
