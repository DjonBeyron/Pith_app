import { describe, it, expect, vi } from 'vitest'
import { VOSK_MODEL_URL, VOSK_URL_KEY, readModelUrl, writeModelUrl, resetModelUrl, heapMb, killModel, importVosk } from './voskEngine.js'

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) } }
const broken = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') }, removeItem() { throw new Error('x') } }

describe('voskEngine', () => {
  it('адрес модели: по умолчанию, из хранилища, при ошибке хранилища', () => {
    expect(VOSK_URL_KEY).toBe('pithy_admin_vosk_model_url_v1')
    expect(readModelUrl(mem())).toBe(VOSK_MODEL_URL)
    const s = mem()
    writeModelUrl('https://example.com/m.tar.gz', s)
    expect(readModelUrl(s)).toBe('https://example.com/m.tar.gz')
    expect(s.getItem(VOSK_URL_KEY)).toBe('https://example.com/m.tar.gz')
    expect(readModelUrl(broken)).toBe(VOSK_MODEL_URL)
    expect(() => writeModelUrl('x', broken)).not.toThrow()
  })
  it('прежний ключ адреса читается; «Вернуть по умолчанию» стирает оба', () => {
    const s = mem({ pithy_admin_voice_vosk_url_v1: 'https://old.example/m.tar.gz' })
    expect(readModelUrl(s)).toBe('https://old.example/m.tar.gz')
    writeModelUrl('https://new.example/m.tar.gz', s)
    expect(readModelUrl(s)).toBe('https://new.example/m.tar.gz')
    expect(resetModelUrl(s)).toBe(VOSK_MODEL_URL)
    expect(readModelUrl(s)).toBe(VOSK_MODEL_URL)
    expect(() => resetModelUrl(broken)).not.toThrow()
  })
  it('память страницы: только если браузер даёт performance.memory', () => {
    expect(heapMb({ memory: { usedJSHeapSize: 54 * 1048576 } })).toBe(54)
    expect(heapMb({})).toBeNull()
    expect(heapMb(null)).toBeNull()
  })
  it('выгрузка: просим модель закрыться и сразу гасим воркер; ошибки не мешают', () => {
    const worker = { terminate: vi.fn() }
    const model = { terminate: vi.fn(), worker }
    killModel(model)
    expect(model.terminate).toHaveBeenCalled()
    expect(worker.terminate).toHaveBeenCalled()
    expect(() => killModel({ terminate() { throw new Error('dead') }, worker: { terminate() { throw new Error('dead') } } })).not.toThrow()
    expect(() => killModel({})).not.toThrow()
  })
  it('пакет vosk-browser подключается динамически и отдаёт класс Model', async () => {
    const api = await importVosk()
    expect(typeof api.Model).toBe('function')
  })
})
