import { describe, it, expect, vi, beforeEach } from 'vitest'
import { playWithGain } from './soundVolume.js'

const makeCtx = () => ({
  state: 'running',
  decodeAudioData: vi.fn(async () => ({ duration: 0.5 })),
  createBufferSource: vi.fn(() => ({ connect() {}, start: vi.fn() })),
  createGain: vi.fn(() => ({ gain: {}, connect() {} })),
  destination: {},
})

describe('playWithGain: устаревший звук', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))) })

  it('буфер загрузился позже порога — звук не стартует, ошибка помечена stale', async () => {
    const ctx = makeCtx()
    await expect(playWithGain(ctx, 'stale-a', '/x.mp3', 0.5, { requestedAt: performance.now() - 1000, staleMs: 300 })).rejects.toMatchObject({ stale: true })
    expect(ctx.createBufferSource).not.toHaveBeenCalled()
  })

  it('успел в срок (или порога нет) — играет и возвращает длительность', async () => {
    const ctx = makeCtx()
    expect(await playWithGain(ctx, 'stale-b', '/x.mp3', 0.5, { requestedAt: performance.now(), staleMs: 300 })).toBe(0.5)
    expect(await playWithGain(makeCtx(), 'stale-b', '/x.mp3', 0.5)).toBe(0.5)
  })
})
