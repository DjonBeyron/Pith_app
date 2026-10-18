import { describe, it, expect, vi } from 'vitest'
import { pickEngine } from './sayEnginePick.js'
import { isSayFreeVoskOn, setSayFreeVoskOn, SAY_FREE_VOSK_KEY } from './sayFreeVosk.js'
import { createVoskRecognizer } from '../vosk/voskRecognizer.js'

const READY = { phrase: 'I want to dance', free: true, cached: true, loaded: true, libReady: true, now: 1000 }

describe('свободные фразы на Vosk (эксперимент, по умолчанию выключен)', () => {
  it('флаг: по умолчанию выкл, «1» включает, сброс выключает', () => {
    const m = new Map(); const store = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }
    expect(isSayFreeVoskOn(store)).toBe(false)
    setSayFreeVoskOn(true, store); expect(m.get(SAY_FREE_VOSK_KEY)).toBe('1'); expect(isSayFreeVoskOn(store)).toBe(true)
    setSayFreeVoskOn(false, store); expect(isSayFreeVoskOn(store)).toBe(false)
  })

  it('выкл: pattern → системное; вкл и Vosk готов → Vosk; вкл, но Vosk не в памяти → системное (запасной путь)', () => {
    expect(pickEngine({ ...READY, freeVosk: false })).toEqual({ engine: 'system', reason: 'free' })
    expect(pickEngine({ ...READY, freeVosk: true })).toEqual({ engine: 'vosk', reason: 'ready' })
    expect(pickEngine({ ...READY, freeVosk: true, loaded: false }).engine).toBe('system')
  })

  it('Vosk для pattern: словарь открытый (null), «вся фраза» — по шаблону, уверенность слов не отсекается', async () => {
    const calls = []
    const listen = vi.fn(async (model, grammar, cb, opts) => { calls.push({ grammar, opts }); return { stop() {}, cancel() {} } })
    const views = []
    const r = createVoskRecognizer({ runtime: { getModel: () => ({}) }, onView: v => views.push(v), listen, setTimer: () => 0, clearTimer: () => {} })
    r.start({ reference: 'I want to dance', lang: 'en-US', data: { phrase: 'I want to dance', pattern: 'I want to **' } })
    await Promise.resolve()
    expect(calls[0].grammar).toBeNull()
    expect(calls[0].opts.isComplete('i want to')).toBe(false)
    expect(calls[0].opts.isComplete('i want to dance')).toBe(true)
    r.start({ reference: 'I want to dance', lang: 'en-US', data: { phrase: 'I want to dance' } })
    await Promise.resolve()
    expect(typeof calls[1].grammar).toBe('string')
  })
})
