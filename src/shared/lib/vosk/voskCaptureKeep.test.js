import { describe, it, expect, vi, beforeEach } from 'vitest'
import { acquireCaptureContext, releaseCapture, closeKeptCapture, keptCapture, busyCaptures } from './voskCapture.js'
import { closeAll, resetRegistry } from '../audioContextRegistry.js'

// v3.3.165: один контекст захвата на игру — слушатель на готовом потоке игры берёт тот же AudioContext, между ходами только отключает узлы (без «освобождено… running→closed»);
// закрывают его closeKeptCapture (пауза / конец игры / закрытие потока) и обновление аудиосессии (closeAll реестра).
class Ctx {
  static made = 0
  constructor() { Ctx.made += 1; this.state = 'running'; this.sampleRate = 48000; this.close = vi.fn(async () => { this.state = 'closed' }); this.resume = vi.fn(async () => { this.state = 'running' }) }
}
const store = { getItem: () => null }
beforeEach(() => { closeKeptCapture('сброс', () => {}); resetRegistry(); Ctx.made = 0 })

describe('контекст захвата игры живёт между ходами', () => {
  it('три хода подряд — один AudioContext, close() не зовётся, в журнале «слушатель отпущен … оставлен», а не «освобождено»', () => {
    const log = vi.fn()
    let first = null
    for (let i = 0; i < 3; i++) {
      const ctx = acquireCaptureContext(Ctx, { keep: true, store })
      first ??= ctx
      expect(ctx).toBe(first)
      const node = { disconnect: vi.fn() }
      releaseCapture({ stream: null, nodes: [node], ctx, log })
      expect(node.disconnect).toHaveBeenCalled()
    }
    expect(Ctx.made).toBe(1); expect(first.close).not.toHaveBeenCalled()
    expect(log.mock.calls.every(c => c[0].startsWith('[mic] слушатель отпущен: треков 0, узлы отключены, контекст захвата оставлен running'))).toBe(true)
    expect(log.mock.calls.some(c => c[0].includes('освобождено'))).toBe(false)
    expect(keptCapture()).toEqual({ state: 'running', users: 0 })
  })
  it('оставленный без слушателя не считается «микрофон слушает» (проверка вывода), со слушателем — считается', () => {
    const ctx = acquireCaptureContext(Ctx, { keep: true, store })
    expect(busyCaptures()).toHaveLength(1)
    releaseCapture({ ctx, log: () => {} })
    expect(busyCaptures()).toHaveLength(0)
  })
  it('прерванный (suspended) оставленный контекст будится resume; закрытый — заменяется новым', () => {
    const a = acquireCaptureContext(Ctx, { keep: true, store }); releaseCapture({ ctx: a, log: () => {} })
    a.state = 'suspended'
    expect(acquireCaptureContext(Ctx, { keep: true, store })).toBe(a); expect(a.resume).toHaveBeenCalled()
    releaseCapture({ ctx: a, log: () => {} })
    a.state = 'closed'
    const b = acquireCaptureContext(Ctx, { keep: true, store })
    expect(b).not.toBe(a); expect(Ctx.made).toBe(2)
  })
  it('closeKeptCapture закрывает и пишет журнал; renew (closeAll реестра) — тоже, ссылка забывается', async () => {
    const log = vi.fn()
    const a = acquireCaptureContext(Ctx, { keep: true, store }); releaseCapture({ ctx: a, log: () => {} })
    expect(closeKeptCapture('пауза', log)).toBe(true); expect(a.close).toHaveBeenCalled(); expect(keptCapture()).toBeNull()
    await Promise.resolve(); await Promise.resolve()
    expect(log).toHaveBeenCalledWith('[mic] контекст захвата игры закрыт (пауза): running→closed')
    expect(closeKeptCapture('ещё раз', log)).toBe(false)
    const b = acquireCaptureContext(Ctx, { keep: true, store })
    await closeAll()
    expect(b.close).toHaveBeenCalled(); expect(keptCapture()).toBeNull()
    expect(acquireCaptureContext(Ctx, { keep: true, store })).not.toBe(b)
  })
  it('свой поток (keep: false) — как раньше: новый контекст на попытку и close() в конце', async () => {
    const log = vi.fn()
    const ctx = acquireCaptureContext(Ctx, { keep: false, store })
    releaseCapture({ ctx, log })
    await Promise.resolve(); await Promise.resolve()
    expect(ctx.close).toHaveBeenCalled(); expect(log.mock.calls[0][0]).toMatch(/освобождено: треков 0, контекст running→closed/)
    expect(keptCapture()).toBeNull()
  })
})
