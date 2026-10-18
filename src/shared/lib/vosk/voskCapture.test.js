import { describe, it, expect, vi } from 'vitest'
import { createCaptureContext, releaseCapture, isCtx16kOn, CTX16K_KEY } from './voskCapture.js'

const store = v => ({ getItem: k => (k === CTX16K_KEY ? v : null) })

describe('захват микрофона Vosk: контекст и освобождение', () => {
  it('по умолчанию — родная частота (без sampleRate: 16000); флаг «1» возвращает старое поведение, без поддержки — откат', () => {
    const made = []
    class Ctx { constructor(o) { made.push(o); this.resume = vi.fn(() => Promise.resolve()) } }
    createCaptureContext(Ctx, store(null))
    expect(made[0]).toBeUndefined()
    createCaptureContext(Ctx, store('1'))
    expect(made[1]).toEqual({ sampleRate: 16000 })
    class Old { constructor(o) { if (o) throw new Error('nope'); made.push('plain') } }
    createCaptureContext(Old, store('1'))
    expect(made[2]).toBe('plain')
    expect(isCtx16kOn(store('1'))).toBe(true)
    expect(isCtx16kOn(store(null))).toBe(false)
  })

  it('порядок: треки → узлы → close() → только потом done (аудиосессия); пишет строку в журнал', async () => {
    const order = []
    const track = { readyState: 'live', stop: () => order.push('track') }
    const node = { onaudioprocess: () => {}, disconnect: () => order.push('node') }
    let closed
    const ctx = { state: 'running', sampleRate: 48000, close: () => { order.push('close'); return new Promise(r => { closed = r }) } }
    const log = vi.fn()
    releaseCapture({ stream: { getTracks: () => [track] }, nodes: [node], ctx, done: () => order.push('done'), log })
    expect(order).toEqual(['track', 'node', 'close'])
    closed(); await Promise.resolve(); await Promise.resolve()
    expect(order).toEqual(['track', 'node', 'close', 'done'])
    expect(log.mock.calls[0][0]).toMatch(/треков 1.*48000/)
  })

  it('ошибка close(), уже закрытый контекст и отсутствие контекста не оставляют сессию занятой', async () => {
    const done = vi.fn()
    releaseCapture({ stream: null, ctx: { state: 'running', close: () => Promise.reject(new Error('x')) }, done, log: () => {} })
    await Promise.resolve(); await Promise.resolve()
    expect(done).toHaveBeenCalledTimes(1)
    releaseCapture({ stream: null, ctx: { state: 'closed' }, done, log: () => {} })
    releaseCapture({ stream: null, ctx: null, done, log: () => {} })
    expect(done).toHaveBeenCalledTimes(3)
  })
})
