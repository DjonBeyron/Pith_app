import { describe, it, expect } from 'vitest'
import { VOSK_MODEL_URL, VOSK_URL_KEY, readModelUrl, writeModelUrl, probeModel, modelProblem, importVosk } from './voskEngine.js'

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }
const broken = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') } }
const head = (len, over = {}) => async () => ({ ok: true, status: 200, headers: { get: k => (k === 'content-length' ? len : k === 'content-type' ? 'application/gzip' : null) }, ...over })

describe('voskEngine', () => {
  it('адрес модели: по умолчанию, из хранилища, при ошибке хранилища', () => {
    expect(readModelUrl(mem())).toBe(VOSK_MODEL_URL)
    const s = mem()
    writeModelUrl('https://example.com/m.tar.gz', s)
    expect(readModelUrl(s)).toBe('https://example.com/m.tar.gz')
    expect(s.getItem(VOSK_URL_KEY)).toBe('https://example.com/m.tar.gz')
    expect(readModelUrl(broken)).toBe(VOSK_MODEL_URL)
    expect(() => writeModelUrl('x', broken)).not.toThrow()
  })
  it('проверка адреса: размер по Content-Length; сбой сети/CORS → null (грузим вслепую)', async () => {
    expect(await probeModel('u', head('41943040'))).toEqual({ ok: true, status: 200, size: 41943040, type: 'application/gzip' })
    expect((await probeModel('u', head(null))).size).toBeNull()
    expect(await probeModel('u', async () => { throw new Error('cors') })).toBeNull()
  })
  it('явно неверный адрес: 404 и веб-страница вместо архива отклоняются понятным текстом', async () => {
    expect(modelProblem(await probeModel('u', head(null, { ok: false, status: 404 })))).toMatch(/404/)
    const html = async () => ({ ok: true, status: 200, headers: { get: k => (k === 'content-type' ? 'text/html; charset=utf-8' : null) } })
    expect(modelProblem(await probeModel('u', html))).toMatch(/веб-страница/)
    expect(modelProblem(await probeModel('u', head('10')))).toBeNull()
    expect(modelProblem(null)).toBeNull()
  })
  it('пакет vosk-browser подключается динамически и отдаёт класс Model', async () => {
    const api = await importVosk()
    expect(typeof api.Model).toBe('function')
  })
})
