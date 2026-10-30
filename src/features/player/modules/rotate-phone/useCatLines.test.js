import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Первая реплика Пита откладывается до готовности прогрева и слота (≤ 3 с), потом — подпись без звука (голоса системы нет); реплика без озвучки подписью не ждёт. Хуки React заменены простыми (вызываем хук один раз)
vi.mock('react', async orig => ({ ...(await orig()), useState: v => [v, vi.fn()], useRef: v => ({ current: v }), useEffect: () => {} }))
const gate = vi.hoisted(() => ({ ready: true, why: 'прогрев не закончен' }))
vi.mock('./wordLaneLineGate.js', async orig => ({ ...(await orig()), lineReadiness: () => ({ ready: gate.ready, why: gate.why }) }))
const say = vi.hoisted(() => vi.fn(() => ({ ms: 2000, rise: 0, timer: 0 })))
vi.mock('./wordLaneCatSay.js', () => ({ startCatLine: say }))

const { useCatLines } = await import('./useCatLines.js')
const { LINE_WAIT_MS, LINE_POLL_MS } = await import('./wordLaneLineGate.js')

const lines = {
  rh_start: { text: 'Сегодня репетируем одну фразу', url: 'https://x/rh.mp3', duration: 2, words: null },
  rh_warmup_miss: { text: 'Это слово и будем тренировать', url: null, duration: null, words: null },
}
beforeEach(() => { vi.useFakeTimers(); say.mockClear(); gate.ready = true })
afterEach(() => { vi.useRealTimers() })

describe('useCatLines: отсрочка первой реплики', () => {
  it('прогрев и слот готовы — реплика стартует сразу, ожидания нет', () => {
    const cat = useCatLines({ lines, rate: 1, catApi: { current: null }, listenerRef: null })
    expect(cat.sayLine('rh_start')).toBe(true)
    expect(say).toHaveBeenCalledTimes(1)
    expect(say.mock.calls[0][0]).toMatchObject({ id: 'rh_start' })
    expect(say.mock.calls[0][0].voice).toBeUndefined()
  })

  it('прогрев не закончен: реплика принята (true), но звук не стартует; как только слот готов — стартует, с временем ожидания; в ожидании Пит «занят» (другие реплики не лезут вперёд)', async () => {
    gate.ready = false
    const cat = useCatLines({ lines, rate: 1, catApi: { current: null }, listenerRef: null })
    expect(cat.sayLine('rh_start')).toBe(true)
    expect(say).not.toHaveBeenCalled()
    expect(cat.busyLeft()).toBeGreaterThan(LINE_WAIT_MS)
    expect(cat.sayLine('rh_warmup_miss')).toBe(false)
    await vi.advanceTimersByTimeAsync(400); gate.ready = true
    await vi.advanceTimersByTimeAsync(LINE_POLL_MS * 2)
    expect(say).toHaveBeenCalledTimes(1)
    expect(say.mock.calls[0][0]).toMatchObject({ id: 'rh_start', waitedMs: expect.any(Number) })
    expect(say.mock.calls[0][0].waitedMs).toBeGreaterThanOrEqual(400)
    expect(say.mock.calls[0][0].voice).toBeUndefined()
  })

  it('слот так и не подготовился за LINE_WAIT_MS (3 с) — реплика остаётся подписью без звука (voice: none), причина передана для журнала', async () => {
    gate.ready = false
    const cat = useCatLines({ lines, rate: 1, catApi: { current: null }, listenerRef: null })
    cat.sayLine('rh_start')
    await vi.advanceTimersByTimeAsync(LINE_WAIT_MS - 100)
    expect(say).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(LINE_POLL_MS * 3)
    expect(say).toHaveBeenCalledTimes(1)
    expect(say.mock.calls[0][0]).toMatchObject({ id: 'rh_start', voice: 'none' })
    expect(say.mock.calls[0][0].waitedMs).toBeGreaterThanOrEqual(LINE_WAIT_MS)
    expect(say.mock.calls[0][0].why).toContain('прогрев не закончен')
  })

  it('реплика без озвучки (подпись) не ждёт ничего — даже при незаконченном прогреве; пауза (stop) отменяет ожидание', async () => {
    gate.ready = false
    const cat = useCatLines({ lines, rate: 1, catApi: { current: null }, listenerRef: null })
    expect(cat.sayLine('rh_warmup_miss')).toBe(true)
    expect(say).toHaveBeenCalledTimes(1)
    say.mockClear()
    const cat2 = useCatLines({ lines, rate: 1, catApi: { current: null }, listenerRef: null })
    cat2.sayLine('rh_start')
    cat2.stop()
    await vi.advanceTimersByTimeAsync(LINE_WAIT_MS * 2)
    expect(say).not.toHaveBeenCalled()
    expect(cat2.busyLeft()).toBe(0)
  })
})
