import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { lazyRetry } from './lazyRetry.js'

// lazyRetry: ленивый чанк не загрузился → один раз за сессию (на ключ) перезагрузка; при наличии service worker'а — сначала просим его
// сбросить кеш оболочки (purge-shell, не чаще раза за сессию), иначе reload отдал бы ту же устаревшую страницу из кеша
function setup({ controller = true, online = true } = {}) {
  const store = {}
  const posted = []
  const reload = vi.fn()
  vi.stubGlobal('sessionStorage', { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v) } })
  vi.stubGlobal('window', { location: { reload } })
  vi.stubGlobal('navigator', {
    onLine: online,
    serviceWorker: { controller: controller ? { postMessage: (m, ports) => { posted.push(m); ports[0].postMessage({ type: 'shell-status' }) } } : null },
  })
  return { store, posted, reload }
}
const fail = () => Promise.reject(new Error('Failed to fetch dynamically imported module'))
const flush = () => new Promise(r => setTimeout(r, 30))

describe('lazyRetry', () => {
  beforeEach(() => vi.useRealTimers())
  afterEach(() => vi.unstubAllGlobals())

  it('успешный импорт — без побочных эффектов', async () => {
    const env = setup()
    await expect(lazyRetry(() => Promise.resolve({ default: 1 }), 'a')).resolves.toEqual({ default: 1 })
    expect(env.posted).toEqual([]); expect(env.reload).not.toHaveBeenCalled()
  })

  it('с воркером: purge-shell, затем одна перезагрузка; ошибка пробрасывается', async () => {
    const env = setup()
    await expect(lazyRetry(fail, 'a')).rejects.toThrow('dynamically imported')
    await flush()
    expect(env.posted).toEqual([{ type: 'purge-shell' }])
    expect(env.reload).toHaveBeenCalledTimes(1)
  })

  it('не чаще раза за сессию: повторная ошибка того же чанка — без перезагрузки; сброс кеша — один на сессию', async () => {
    const env = setup()
    await expect(lazyRetry(fail, 'a')).rejects.toThrow(); await flush()
    await expect(lazyRetry(fail, 'a')).rejects.toThrow(); await flush()
    await expect(lazyRetry(fail, 'b')).rejects.toThrow(); await flush()
    expect(env.posted).toHaveLength(1) // purge — раз за сессию
    expect(env.reload).toHaveBeenCalledTimes(2) // 'a' и 'b': по разу; второй — обычный reload (кеш уже сброшен)
  })

  it('без сети — ни сброса, ни перезагрузки (страница всё равно не загрузится)', async () => {
    const env = setup({ online: false })
    await expect(lazyRetry(fail, 'a')).rejects.toThrow(); await flush()
    expect(env.posted).toEqual([]); expect(env.reload).not.toHaveBeenCalled()
  })

  it('без воркера — обычная перезагрузка сразу', async () => {
    const env = setup({ controller: false })
    await expect(lazyRetry(fail, 'a')).rejects.toThrow()
    expect(env.reload).toHaveBeenCalledTimes(1); expect(env.posted).toEqual([])
  })
})
