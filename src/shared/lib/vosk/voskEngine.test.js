import { describe, it, expect, vi } from 'vitest'
import { heapMb, killModel, importVosk } from './voskEngine.js'

describe('voskEngine', () => {
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
