import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Похвала после верного ответа начинается через GOOD_DELAY_MS (v3.3.113); Пит «занят» уже с зачёта (следующая пилюля не проскакивает в задержку); сброс «занят» при старте; страховка второго запуска (буфера нет в памяти).
vi.mock('react', async orig => ({ ...(await orig()), useState: v => [v, vi.fn()], useRef: v => ({ current: v }), useEffect: () => {} }))
const gate = vi.hoisted(() => ({ ready: true }))
vi.mock('./wordLaneLineGate.js', async orig => ({ ...(await orig()), lineReadiness: () => ({ ready: gate.ready, why: 'прогрев не закончен' }) }))
const say = vi.hoisted(() => vi.fn(() => ({ ms: 1200, rise: 0, timer: 0 })))
vi.mock('./wordLaneCatSay.js', () => ({ startCatLine: say }))
const mem = vi.hoisted(() => ({ missing: false, has: false }))
vi.mock('./wordLaneLineRecover.js', () => ({ bufferMissing: () => mem.missing, recoverLine: vi.fn(() => Promise.resolve(true)), nudgeCtx: vi.fn() }))
vi.mock('./wordLaneClips.js', () => ({ hasWordSlot: () => mem.has }))
const logs = vi.hoisted(() => [])
vi.mock('../../../../shared/lib/debug.js', () => ({ pLog: (...a) => logs.push(a.join(' ')) }))

const { useCatLines } = await import('./useCatLines.js')
const { GOOD_DELAY_MS } = await import('../../../pitrace/raceGood.js')
const { LINE_WAIT_MS } = await import('./wordLaneLineGate.js')
const { recoverLine } = await import('./wordLaneLineRecover.js')

const lines = {
  race_good_1: { text: 'Так держать', url: 'https://x/g1.mp3', duration: 1.2, words: null },
  race_good_2: { text: 'Отлично', url: 'https://x/g2.mp3', duration: 1.2, words: null },
}
const mk = () => useCatLines({ lines, rate: 1, catApi: { current: null }, listenerRef: null })
beforeEach(() => { vi.useFakeTimers(); say.mockClear(); logs.length = 0; gate.ready = true; mem.missing = false; mem.has = false; recoverLine.mockClear() })
afterEach(() => { vi.useRealTimers() })

describe('похвала через GOOD_DELAY_MS после зачёта', () => {
  it('задержка около 500 мс', () => { expect(GOOD_DELAY_MS).toBe(500) })

  it('реплика не стартует в момент зачёта, а через задержку; Пит занят с первого мгновения (следующая пилюля не проскакивает)', () => {
    const cat = mk()
    expect(cat.sayLineLater('race_good_1', null, GOOD_DELAY_MS)).toBe(true)
    expect(say).not.toHaveBeenCalled()
    expect(cat.busyLeft()).toBeGreaterThanOrEqual(GOOD_DELAY_MS) // pitLeft > 0: holdAll держит следующую пилюлю
    vi.advanceTimersByTime(GOOD_DELAY_MS - 10)
    expect(say).not.toHaveBeenCalled()
    expect(cat.busyLeft()).toBeGreaterThan(0)
    vi.advanceTimersByTime(20)
    expect(say).toHaveBeenCalledTimes(1)
    expect(say.mock.calls[0][0]).toMatchObject({ id: 'race_good_1' })
    expect(cat.busyLeft()).toBeGreaterThan(1200) // дальше занятость ведёт сама реплика: звук + пауза после него
  })

  it('в задержку другая реплика не лезет вперёд (Пит занят)', () => {
    const cat = mk()
    cat.sayLineLater('race_good_1', null, GOOD_DELAY_MS)
    expect(cat.sayLine('race_good_2')).toBe(false)
    expect(say).not.toHaveBeenCalled()
  })

  it('непринятая (нет реплики) — резерв не ставится, занятости нет', () => {
    const cat = mk()
    expect(cat.sayLineLater('нет_такой', null, GOOD_DELAY_MS)).toBe(false)
    expect(cat.busyLeft()).toBe(0)
  })

  it('отложенная реплика не сказана (кулдаун / ошибка) — «занят» снимается, а не залипает', () => {
    const cat = mk()
    cat.sayLine('race_good_1') // сказана только что: кулдаун 6 с
    vi.advanceTimersByTime(3000) // Пит договорил
    expect(cat.sayLineLater('race_good_1', null, GOOD_DELAY_MS)).toBe(false) // кулдаун отсекает сразу, резерв не ставится
    expect(cat.busyLeft()).toBe(0)
  })

  it('пауза (stop) отменяет отложенную реплику и сбрасывает занятость', () => {
    const cat = mk()
    cat.sayLineLater('race_good_1', null, GOOD_DELAY_MS)
    cat.stop()
    vi.advanceTimersByTime(2000)
    expect(say).not.toHaveBeenCalled()
    expect(cat.busyLeft()).toBe(0)
  })

  it('onSaid получает итог (для журнала отладки)', () => {
    const cat = mk()
    const onSaid = vi.fn()
    cat.sayLineLater('race_good_2', null, GOOD_DELAY_MS, onSaid)
    vi.advanceTimersByTime(GOOD_DELAY_MS + 5)
    expect(onSaid).toHaveBeenCalledWith(true)
  })
})

describe('«Пит занят» и страховка второго запуска', () => {
  it('reset(): если «занят» был поднят — строка «[cat] busy сброшен при старте» и реплики снова идут', () => {
    const cat = mk()
    cat.holdBusy(5000)
    expect(cat.sayLine('race_good_1')).toBe(false)
    expect(logs.some(l => l.includes('пропущена') && l.includes('busy'))).toBe(true)
    logs.length = 0
    cat.reset('старте')
    expect(logs.some(l => l.includes('[cat] busy сброшен при старте'))).toBe(true)
    expect(cat.busyLeft()).toBe(0)
    expect(cat.sayLine('race_good_1')).toBe(true)
  })
  it('reset() без поднятого флага молчит', () => {
    const cat = mk()
    cat.reset('старте')
    expect(logs.some(l => l.includes('busy сброшен'))).toBe(false)
  })
  it('пропуск реплики пишет причину: Пит занят ещё N мс (busy); повтор в пределах 1,5 с не засоряет журнал', () => {
    const cat = mk()
    cat.holdBusy(3000)
    cat.sayLine('race_good_1'); cat.sayLine('race_good_1'); cat.sayLine('race_good_1')
    expect(logs.filter(l => l.includes('пропущена'))).toHaveLength(1)
  })

  it('буфера реплики нет в памяти: докачка запущена, реплика ждёт; появился — говорит со звуком', async () => {
    mem.missing = true
    const cat = mk()
    expect(cat.sayLine('race_good_1')).toBe(true)
    expect(recoverLine).toHaveBeenCalledTimes(1)
    expect(say).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300); mem.missing = false
    await vi.advanceTimersByTimeAsync(200)
    expect(say).toHaveBeenCalledTimes(1)
    expect(say.mock.calls[0][0].voice).toBeUndefined()
  })

  it('не дождались, а буфер уже есть (контекст не успел запуститься) — всё равно пробуем играть, а не молчим', async () => {
    gate.ready = false; mem.has = true
    const cat = mk()
    cat.sayLine('race_good_1')
    await vi.advanceTimersByTimeAsync(LINE_WAIT_MS + 300)
    expect(say).toHaveBeenCalledTimes(1)
    expect(say.mock.calls[0][0].voice).toBeUndefined() // не 'none': звук пробуем
    expect(logs.some(l => l.includes('пробую играть'))).toBe(true)
  })

  it('не дождались и буфера нет — только подпись (voice none) и причина в журнале', async () => {
    gate.ready = false; mem.has = false
    const cat = mk()
    cat.sayLine('race_good_1')
    await vi.advanceTimersByTimeAsync(LINE_WAIT_MS + 300)
    expect(say.mock.calls[0][0]).toMatchObject({ voice: 'none' })
    expect(logs.some(l => l.includes('звука нет в памяти'))).toBe(true)
  })
})
