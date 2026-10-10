import { describe, it, expect, vi } from 'vitest'
import { collectDiagContext } from './sayDiagContext.js'
import { buildDiagRows } from './sayDiagRows.js'
import { INITIAL_STATUS } from '../vosk/voskBgStatus.js'

// Сбор контекста диагностики из подставных источников; живые источники не трогаются
const snap = { cached: true, loaded: true, loading: false, libReady: true, broken: false, brokenUntil: 0, brokenWhy: '' }
function deps(over = {}) {
  return {
    runtime: { snapshot: vi.fn(() => snap), info: vi.fn(() => ({ users: 1, warmAt: 1, loadedAt: 1, freeAt: 0, lastError: '', lastLoad: null, now: 5000 })) },
    perm: { decide: vi.fn(() => ({ action: 'listen' })) }, attempts: { get: () => null }, now: () => 5000, version: '9.9.9',
    peek: vi.fn(async () => ({ size: 100, savedAt: 1 })), readUrl: () => 'https://models.example.com/m.tar.gz', urlSource: () => 'env',
    bgStatus: () => INITIAL_STATUS, bgStopped: () => false, getMode: () => 'auto',
    env: () => ({ recognition: true, audioSession: true, sessionType: 'play-and-record', sessionApi: true, online: true, saveData: false, netType: '', browser: 'Safari', platform: 'iOS 17', pwa: false, secure: true, cacheApi: true, ua: 'u' }),
    micPerm: async () => 'granted', ...over,
  }
}

describe('collectDiagContext', () => {
  it('собирает все поля, выбирает движок по тем же правилам, что и тап; из контекста строятся строки', async () => {
    const d = deps()
    const c = await collectDiagContext({ phrase: 'I have 2 cats' }, d)
    expect(c).toMatchObject({ version: '9.9.9', mode: 'auto', phrase: 'I have 2 cats', pick: { engine: 'vosk', reason: 'ready' }, perm: 'granted', urlHost: 'models.example.com', urlSource: 'env', cacheApi: true, bgStopped: false })
    expect(d.peek).toHaveBeenCalledWith('https://models.example.com/m.tar.gz')
    expect(buildDiagRows(c).find(r => r.id === 'next').level).toBe('ok')
  })
  it('режим админа и состояние Vosk меняют решение; сбой peek / права не роняют сбор', async () => {
    const c = await collectDiagContext({ phrase: 'Hello' }, deps({ getMode: () => 'system', peek: async () => { throw new Error('x') }, micPerm: async () => { throw new Error('y') } }))
    expect(c.pick).toEqual({ engine: 'system', reason: 'mode-system' }); expect(c.cache).toBe(null); expect(c.perm).toBe('unavailable')
    const c2 = await collectDiagContext({ phrase: 'Hello' }, deps({ runtime: { snapshot: () => ({ ...snap, cached: false, loaded: false, libReady: false }), info: () => ({ users: 1, warmAt: 0, loadedAt: 0, freeAt: 0, lastError: '', lastLoad: null, now: 5000 }) } }))
    expect(c2.pick.reason).toBe('no-model')
  })
  it('кривой адрес модели — хост пустой, без исключений', async () => {
    const c = await collectDiagContext({ phrase: 'Hello' }, deps({ readUrl: () => 'не адрес' }))
    expect(c.urlHost).toBe('')
  })
})
