import { describe, it, expect, vi, beforeEach } from 'vitest'
import { probeUrl, probeMany, cachedProbe, invalidateProbes, resetProbeCache } from './urlProbe.js'

const res = (status, headers = {}) => ({ status, headers: { get: k => headers[k.toLowerCase()] ?? null }, body: { cancel: vi.fn() } })

describe('проба ссылки (urlProbe.js)', () => {
  beforeEach(() => resetProbeCache())

  it('HEAD даёт статус, тип и размер', async () => {
    const fetchImpl = vi.fn(async () => res(200, { 'content-type': 'audio/mpeg', 'content-length': '4096' }))
    expect(await probeUrl('https://r2/a.mp3', { fetchImpl })).toEqual({ status: 200, contentType: 'audio/mpeg', contentLength: 4096, error: null })
    expect(fetchImpl.mock.calls[0][1].method).toBe('HEAD')
  })

  it('HEAD не поддержан (405) или упал (CORS) → GET одного байта; размер из content-range', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(res(405))
      .mockResolvedValueOnce(res(206, { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-0/777' }))
    expect(await probeUrl('https://r2/a.mp3', { fetchImpl })).toMatchObject({ status: 206, contentLength: 777 })
    expect(fetchImpl.mock.calls[1][1].headers.Range).toBe('bytes=0-0')
    const broken = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(res(404))
    expect(await probeUrl('https://r2/b.mp3', { fetchImpl: broken })).toMatchObject({ status: 404 })
  })

  it('оба запроса упали → status 0 и причина (не считается сломанной)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await probeUrl('https://r2/c.mp3', { fetchImpl })).toEqual({ status: 0, contentType: null, contentLength: null, error: 'Failed to fetch' })
  })

  it('probeMany: кэш на повтор, сетевые сбои не кэшируются, отмена останавливает, параллельность ограничена', async () => {
    const calls = []
    const probe = vi.fn(async u => { calls.push(u); return u.endsWith('x') ? { status: 0, error: 'net' } : { status: 200, contentType: 'audio/mpeg', contentLength: 1 } })
    const urls = ['https://r2/1', 'https://r2/2', 'https://r2/x']
    const r1 = await probeMany(urls, { probe, concurrency: 2 })
    expect(r1.size).toBe(3)
    expect(cachedProbe('https://r2/1')).toMatchObject({ status: 200 })
    expect(cachedProbe('https://r2/x')).toBeNull()
    const r2 = await probeMany(urls, { probe })
    expect(probe).toHaveBeenCalledTimes(4) // второй раз — только «x»
    expect(r2.get('https://r2/1')).toMatchObject({ status: 200 })
    invalidateProbes(['https://r2/1'])
    expect(cachedProbe('https://r2/1')).toBeNull()
    let stop = false
    const slow = vi.fn(async () => { stop = true; return { status: 200 } })
    const r3 = await probeMany(['https://r2/5', 'https://r2/6'], { probe: slow, concurrency: 1, cancelled: () => stop })
    expect(slow).toHaveBeenCalledTimes(1)
    expect(r3.size).toBe(0)
  })
})
