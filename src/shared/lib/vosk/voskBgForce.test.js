import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeCaches, gzBytes, rangeServer } from './voskTestKit.js'
import { startBackground, abortBackground, forceBackground } from './voskBackground.js'
import { getBgStatus, resetBgStatus } from './voskBgStatus.js'
import { setStopped, isStopped } from './voskBgPolicy.js'
import { peekCached } from './voskStorage.js'
import { VoskError } from './voskErrors.js'
import { modelUrlSource, VOSK_URL_KEY, VOSK_MODEL_URL } from './voskConfig.js'

// «Загрузить модель сейчас» (админ, диагностика в уроке): качает вне очереди — лента / видео / файлы урока не мешают; офлайн по-прежнему ждёт сети
const URL1 = 'https://models.example.com/vosk.tar.gz'
const bytes = gzBytes(100)
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) } }
function env(over = {}) {
  const flags = { net: true, feed: true, video: true }
  const e = {
    url: URL1, cachesApi: fakeCaches(), store: mem(), fetchFn: rangeServer(bytes), chunkBytes: 30,
    nav: { onLine: true, connection: { saveData: true } }, doc: { visibilityState: 'hidden' },
    busy: { net: () => flags.net, feed: () => flags.feed, video: () => flags.video }, watchBusy: () => () => {},
    lock: vi.fn(async () => () => {}), persist: vi.fn(), log: vi.fn(), rand: () => 0, flags,
    sleep: async (ms, signal) => { if (signal?.aborted) throw new VoskError('cancelled') },
    ...over,
  }
  return e
}
beforeEach(async () => { await abortBackground(); resetBgStatus() })

describe('forceBackground: вне очереди', () => {
  it('лента, видео, файлы урока, фон и экономия трафика не мешают — модель всё равно скачивается', async () => {
    const e = env()
    await forceBackground(e)
    expect(getBgStatus()).toMatchObject({ state: 'cached', pct: 100 })
    expect((await peekCached(URL1, e.cachesApi)).size).toBe(100)
  })
  it('обычный запуск в тех же условиях ждёт (контроль): статус «ждёт», кэш пуст', async () => {
    const e = env()
    let polls = 0
    e.sleep = async (_ms, signal) => { if (signal?.aborted || ++polls > 3) throw new VoskError('cancelled') }
    await startBackground(e)
    expect(getBgStatus().state).not.toBe('cached')
    expect(await peekCached(URL1, e.cachesApi)).toBe(null)
  })
  it('снимает флаг «стоп» админа и перезапускает идущее ожидание', async () => {
    const e = env()
    setStopped(true, e.store)
    await forceBackground(e)
    expect(isStopped(e.store)).toBe(false)
    expect(getBgStatus().state).toBe('cached')
  })
  it('офлайн — не качает: ждёт возвращения сети', async () => {
    const e = env({ nav: { onLine: false } })
    let polls = 0
    e.sleep = async (_ms, signal) => { if (signal?.aborted || ++polls > 2) throw new VoskError('cancelled') }
    await forceBackground(e)
    expect(e.fetchFn.calls).toHaveLength(0)
    expect(getBgStatus().state).not.toBe('cached')
  })
})

describe('modelUrlSource: откуда адрес модели', () => {
  it('сохранён админом / из VITE_VOSK_MODEL_URL / встроенный', () => {
    expect(modelUrlSource(mem(), {})).toBe('builtin')
    expect(modelUrlSource(mem(), { VITE_VOSK_MODEL_URL: ' https://my.host/model.tar.gz ' })).toBe('env')
    const s = mem(); s.setItem(VOSK_URL_KEY, 'https://lab/x.tar.gz')
    expect(modelUrlSource(s, { VITE_VOSK_MODEL_URL: 'https://my.host/model.tar.gz' })).toBe('saved')
    expect(modelUrlSource(mem(), { VITE_VOSK_MODEL_URL: VOSK_MODEL_URL })).toBe('builtin')
    expect(modelUrlSource({ getItem() { throw new Error('x') } }, {})).toBe('builtin')
  })
})
