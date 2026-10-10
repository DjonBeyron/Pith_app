import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createVoskRuntime, FREE_AFTER_MS, BROKEN_MS } from './voskRuntime.js'

// Прогрев и освобождение модели Vosk на таймерах: ни настоящей модели, ни библиотеки, ни Cache Storage (всё подставное)
function make(over = {}) {
  let t = 1000
  const model = { id: 'model' }
  const log = vi.fn()
  const endBusy = vi.fn()
  const d = {
    url: () => 'https://x/model.tar.gz', peek: vi.fn(async () => ({ size: 5 })), read: vi.fn(async () => ({ blob: { size: 5 }, size: 5 })),
    load: vi.fn(async (_blob, onStage) => { onStage?.('lib'); await Promise.resolve(); onStage?.('model'); return { model, libMs: 7, modelMs: 9 } }),
    unload: vi.fn(), busy: vi.fn(() => endBusy), now: () => t, log, ...over,
  }
  const rt = createVoskRuntime(d)
  return { rt, d, model, log, endBusy, advance: ms => { t += ms; return vi.advanceTimersByTimeAsync(ms) } }
}

describe('voskRuntime: прогрев и освобождение', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('до открытия панели в память ничего не грузится; снимок «не проверяли»', () => {
    const { rt, d } = make()
    expect(rt.snapshot()).toMatchObject({ cached: null, loaded: false, loading: false, libReady: false })
    expect(d.load).not.toHaveBeenCalled(); expect(d.peek).not.toHaveBeenCalled()
  })

  it('панель открыта + модель в кэше → фоном читаем кэш и грузим в память; acquire не блокирует (возврат сразу)', async () => {
    const { rt, d, model } = make()
    const release = rt.acquire()
    expect(typeof release).toBe('function')
    expect(rt.snapshot()).toMatchObject({ loaded: false, loading: true }) // тап в эти мгновения идёт на системном
    await rt.whenReady()
    expect(rt.snapshot()).toMatchObject({ cached: true, loaded: true, loading: false, libReady: true })
    expect(rt.getModel()).toBe(model)
    expect(d.peek).toHaveBeenCalledWith('https://x/model.tar.gz')
  })

  it('модели нет в кэше → ничего не грузим (системное); битая запись кэша — то же', async () => {
    const a = make({ peek: vi.fn(async () => null) })
    a.rt.acquire(); await a.rt.whenReady()
    expect(a.rt.snapshot()).toMatchObject({ cached: false, loaded: false }); expect(a.d.load).not.toHaveBeenCalled()
    const b = make({ read: vi.fn(async () => null) })
    b.rt.acquire(); await b.rt.whenReady()
    expect(b.rt.snapshot()).toMatchObject({ cached: false, loaded: false }); expect(b.d.load).not.toHaveBeenCalled()
  })

  it('библиотека качается из сети — на это время сеть «занята» (фоновая загрузка уступает); после стадии модели занятость снимается', async () => {
    const { rt, d, endBusy } = make()
    rt.acquire(); await rt.whenReady()
    expect(d.busy).toHaveBeenCalledTimes(1); expect(endBusy).toHaveBeenCalled()
  })

  it('через 30 с после ухода панели модель выгружается; раньше — нет', async () => {
    const { rt, d, model, advance } = make()
    const release = rt.acquire(); await rt.whenReady()
    release()
    await advance(FREE_AFTER_MS - 1)
    expect(d.unload).not.toHaveBeenCalled(); expect(rt.snapshot().loaded).toBe(true)
    await advance(2)
    expect(d.unload).toHaveBeenCalledWith(model); expect(rt.snapshot().loaded).toBe(false)
  })

  it('панель открыли снова до 30 с → освобождение отменено, модель уже готова (повторной загрузки нет)', async () => {
    const { rt, d, advance } = make()
    rt.acquire()(); await rt.whenReady()
    await advance(FREE_AFTER_MS - 5000)
    const again = rt.acquire()
    await advance(FREE_AFTER_MS * 2)
    expect(d.unload).not.toHaveBeenCalled(); expect(d.load).toHaveBeenCalledTimes(1); expect(rt.snapshot().loaded).toBe(true)
    again(); again() // повторный release безопасен
    await advance(FREE_AFTER_MS + 1)
    expect(d.unload).toHaveBeenCalledTimes(1)
  })

  it('две панели сразу (счётчик): модель живёт, пока открыта хоть одна; StrictMode (acquire → release → acquire) не грузит дважды', async () => {
    const { rt, d, advance } = make()
    const a = rt.acquire(); a(); const b = rt.acquire(); const c = rt.acquire()
    await rt.whenReady(); await advance(1)
    b(); await advance(FREE_AFTER_MS * 2)
    expect(d.unload).not.toHaveBeenCalled(); expect(d.load).toHaveBeenCalledTimes(1)
    c(); await advance(FREE_AFTER_MS + 1)
    expect(d.unload).toHaveBeenCalledTimes(1)
  })

  it('панель закрыли ещё во время загрузки → после загрузки модель всё равно освобождается через 30 с', async () => {
    const { rt, d, advance } = make()
    rt.acquire()(); await rt.whenReady()
    await advance(FREE_AFTER_MS + 1)
    expect(d.unload).toHaveBeenCalledTimes(1)
  })

  it('ошибка загрузки (библиотека не подгрузилась офлайн): в журнал [say-vosk], Vosk не используем 10 мин и не пытаемся грузить заново, потом пробуем снова', async () => {
    const load = vi.fn(async () => { throw new Error('Failed to fetch dynamically imported module') })
    const { rt, log, advance } = make({ load })
    rt.acquire(); await rt.whenReady()
    expect(rt.snapshot()).toMatchObject({ loaded: false, brokenUntil: 1000 + BROKEN_MS })
    expect(log.mock.calls.join('\n')).toContain('Failed to fetch dynamically imported module')
    rt.acquire(); await rt.whenReady()
    expect(load).toHaveBeenCalledTimes(1)
    await advance(BROKEN_MS + 1)
    rt.acquire(); await rt.whenReady()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('markBroken (Vosk упал посреди попытки): модель выгружена, пауза 10 мин, clearBroken возвращает работу и греет модель, если панель открыта', async () => {
    const { rt, d, model, log, advance } = make()
    rt.acquire(); await rt.whenReady()
    rt.markBroken('audio-capture: x')
    expect(d.unload).toHaveBeenCalledWith(model)
    expect(rt.snapshot()).toMatchObject({ loaded: false, brokenWhy: 'audio-capture: x', brokenUntil: 1000 + BROKEN_MS })
    expect(log.mock.calls.join('\n')).toContain('audio-capture: x')
    rt.clearBroken(); await rt.whenReady(); await advance(1)
    expect(rt.snapshot()).toMatchObject({ loaded: true, brokenUntil: 0 })
    expect(d.load).toHaveBeenCalledTimes(2)
  })

  it('clearBroken без открытой панели ничего не грузит (память не тратим)', async () => {
    const { rt, d } = make()
    rt.markBroken('x'); rt.clearBroken(); await rt.whenReady()
    expect(d.load).not.toHaveBeenCalled()
  })
})
