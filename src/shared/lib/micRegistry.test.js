import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installMicRegistry, stopAllMics, openMicCount } from './micRegistry.js'

// Реестр потоков микрофона: обёртка над getUserMedia помнит каждый выданный поток, stopAllMics() гасит все живые дорожки.
const track = () => { const t = { readyState: 'live', stop: vi.fn(() => { t.readyState = 'ended' }) }; return t }
const stream = (...ts) => ({ getTracks: () => ts, getAudioTracks: () => ts })

describe('реестр потоков микрофона', () => {
  let md, a, b
  beforeEach(() => { a = track(); b = track(); md = { getUserMedia: vi.fn().mockResolvedValueOnce(stream(a)).mockResolvedValueOnce(stream(b)) } })
  afterEach(() => stopAllMics('тест'))

  it('поток, открытый кем угодно через getUserMedia, виден реестру и останавливается stopAllMics', async () => {
    expect(installMicRegistry(md)).toBe(true)
    await md.getUserMedia({ audio: true }); await md.getUserMedia({ audio: { echoCancellation: true } })
    expect(openMicCount()).toBe(2)
    expect(stopAllMics('выход')).toBe(2)
    expect(a.stop).toHaveBeenCalled(); expect(b.stop).toHaveBeenCalled(); expect(openMicCount()).toBe(0)
  })
  it('уже остановленные дорожки не считаются; без mediaDevices ничего не ломается', async () => {
    expect(installMicRegistry(null)).toBe(false)
    expect(stopAllMics('пусто')).toBe(0)
  })
})
