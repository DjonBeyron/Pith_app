import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadVoskFallback, loadFallbackScript, dropVoskChunk, FALLBACK_URL } from './voskLibFallback.js'
import { readyView } from './voskReadyView.js'
import { INITIAL_STATUS } from './voskBgStatus.js'

// Подставной document: script «грузится» по команде теста
function fakeDoc(outcome) {
  const el = { remove() {} }
  const doc = { createElement: () => el, head: { appendChild: vi.fn(() => queueMicrotask(() => outcome(el))) } }
  return { doc, el }
}
afterEach(() => { delete globalThis.Vosk })

describe('запасная загрузка библиотеки Vosk', () => {
  it('порядок: журнал → drop-asset → script → api; адрес с версией', async () => {
    const order = []
    const ask = vi.fn(async msg => { order.push('drop:' + msg.prefix); return { dropped: 1 } })
    const { doc, el } = fakeDoc(e => { order.push('script:' + e.src.split('?')[0]); globalThis.Vosk = { Model: function Model() {} }; e.onload() })
    const log = () => order.push('log')
    const api = await loadVoskFallback(new Error('Importing a module script failed.'), { ask, doc, log, hasSw: true })
    expect(typeof api.Model).toBe('function')
    expect(order.filter(x => x !== 'log')).toEqual(['drop:/assets/vosk-', 'script:' + FALLBACK_URL])
    expect(order[0]).toBe('log')
    expect(el.src).toMatch(/^\/vosk-fallback\.js\?v=\d/)
  })
  it('без воркера шаг drop-asset пропускается', async () => {
    const ask = vi.fn()
    const { doc } = fakeDoc(e => { globalThis.Vosk = { Model() {} }; e.onload() })
    await loadVoskFallback(new Error('x'), { ask, doc, log: () => {}, hasSw: false })
    expect(ask).not.toHaveBeenCalled()
  })
  it('нет ответа воркера (null) — всё равно грузим script', async () => {
    expect(await dropVoskChunk(async () => null)).toBeNull()
    const { doc } = fakeDoc(e => { globalThis.Vosk = { Model() {} }; e.onload() })
    await expect(loadVoskFallback(new Error('x'), { ask: async () => null, doc, log: () => {}, hasSw: true })).resolves.toBeTruthy()
  })
  it('script не загрузился — кидаем исходную ошибку и пишем в журнал', async () => {
    const lines = []
    const { doc } = fakeDoc(e => e.onerror())
    const cause = new Error('Importing a module script failed.')
    await expect(loadVoskFallback(cause, { doc, log: m => lines.push(m), hasSw: false })).rejects.toBe(cause)
    expect(lines.join('\n')).toContain('запасная загрузка /vosk-fallback.js — ошибка')
  })
  it('загрузился, но без Vosk.Model — ошибка; таймаут — ошибка', async () => {
    const { doc } = fakeDoc(e => e.onload())
    await expect(loadFallbackScript(doc)).rejects.toThrow('без Vosk.Model')
    vi.useFakeTimers()
    const p = loadFallbackScript({ createElement: () => ({}), head: { appendChild() {} } }, 50)
    const assertion = expect(p).rejects.toThrow('не уложилась')
    await vi.advanceTimersByTimeAsync(60)
    await assertion
    vi.useRealTimers()
  })
  it('уведомление: сбой на importing-lib несёт stage (кнопка «Перезагрузить»)', () => {
    const result = { ok: false, reason: 'failed', stage: 'importing-lib', text: 'ошибка загрузки библиотеки: x' }
    expect(readyView({ result, bg: { ...INITIAL_STATUS } })).toMatchObject({ status: 'failed', stage: 'importing-lib' })
  })
})
