import { describe, it, expect, vi } from 'vitest'

// import('vosk-browser') падает (как в Safari: «Importing a module script failed») → importVosk уходит на запасную загрузку
const fallback = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('vosk-browser', () => { throw new Error('Importing a module script failed.') })
vi.mock('./voskLibFallback.js', () => ({ loadVoskFallback: fallback.load }))

describe('importVosk: запасной путь', () => {
  it('сбой import → loadVoskFallback(ошибка) → api с классом Model', async () => {
    fallback.load.mockResolvedValue({ Model: function Model() {} })
    const { importVosk } = await import('./voskEngine.js')
    const api = await importVosk()
    expect(typeof api.Model).toBe('function')
    expect(fallback.load).toHaveBeenCalledOnce()
    expect(fallback.load.mock.calls[0][0]).toBeInstanceOf(Error)
  })
  it('запасной путь тоже упал — ошибка уходит наружу (прогрев запишет сбой)', async () => {
    fallback.load.mockRejectedValue(new Error('Importing a module script failed.'))
    const { importVosk } = await import('./voskEngine.js')
    await expect(importVosk()).rejects.toThrow('Importing a module script failed')
  })
})
