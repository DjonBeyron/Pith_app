import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FakeRec, alt, setup } from './speechTestKit.js'
import { STOP_FORCE_MS } from './speechPolicy.js'
import { STRATEGIES, createRestartGate } from './speechRestart.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const withStrategy = id => setup({ getRestart: () => id })
async function okRun(s, i = 0, flush = true) {
  s.tap()
  const r = s.rec(i)
  r.onaudiostart(); r.onsoundstart(); r.onresult({ results: [alt('I am here')] })
  r.onend()
  if (flush) await s.tick(0)
}

describe('S2/S5: один экземпляр переиспользуется', () => {
  it('S2: end уже был — start() на том же объекте сразу, в жесте; новых экземпляров нет', async () => {
    const s = withStrategy('S2')
    await okRun(s, 0, false)
    s.tap()
    expect(FakeRec.all).toHaveLength(1)
    expect(s.rec(0).starts).toBe(2)
    expect(s.last()).toMatchObject({ preparing: false, cooling: false })
    s.rec(0).onaudiostart()
    s.rec(0).onresult({ results: [alt('again')] })
    expect(s.last().final.text).toBe('again')
  })

  it('S2: end ещё не пришёл — тап ждёт его и стартует на следующем такте (не внутри обработчика end)', async () => {
    const s = withStrategy('S2')
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onerror({ error: 'not-allowed' }) // закрыли abort(), end ещё нет
    s.tap()
    expect(s.last()).toMatchObject({ preparing: true, cooling: true })
    expect(s.rec(0).starts).toBe(1)
    s.rec(0).onend()
    expect(s.rec(0).starts).toBe(1) // внутри end не стартуем
    await s.tick(1)
    expect(FakeRec.all).toHaveLength(1)
    expect(s.rec(0).starts).toBe(2)
  })

  it('S5: тот же экземпляр + пауза 700 мс', async () => {
    const s = withStrategy('S5')
    await okRun(s)
    s.tap()
    await s.tick(699)
    expect(s.rec(0).starts).toBe(1)
    await s.tick(2)
    expect(FakeRec.all).toHaveLength(1)
    expect(s.rec(0).starts).toBe(2)
  })

  it('end прошлого экземпляра не пришёл (вышли по STOP_FORCE_MS) — его не переиспользуем, берём новый', async () => {
    const s = withStrategy('S2')
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onerror({ error: 'not-allowed' })
    s.tap()
    await s.tick(STOP_FORCE_MS + 10)
    expect(FakeRec.all).toHaveLength(2)
  })

  it('S1 каждый раз новый экземпляр', async () => {
    const s = withStrategy('S1')
    await okRun(s)
    s.tap()
    expect(FakeRec.all).toHaveLength(2)
  })
})

describe('createRestartGate', () => {
  it('стратегия без ожидания (S1) — затвор не включается', () => {
    const changes = []
    const g = createRestartGate({ onChange: c => changes.push(c), getStrategy: () => STRATEGIES.S1 })
    g.close({}, true)
    expect(g.cooling()).toBe(false)
    expect(changes).toEqual([])
    let ran = 0
    expect(g.whenReady(() => ran++, STRATEGIES.S1)).toBe(true)
    expect(ran).toBe(1)
  })

  it('пауза считается по стратегии ЗАПУСКАЕМОЙ попытки, а не той, что закрыла прошлую: S1 → сразу S3 всё равно ждёт 900 мс после end', async () => {
    const g = createRestartGate({ getStrategy: () => STRATEGIES.S1 })
    g.close({}, true) // закрыли под S1 (без пауз), end уже был
    let ran = 0
    expect(g.whenReady(() => ran++, STRATEGIES.S3)).toBe(false)
    await vi.advanceTimersByTimeAsync(899)
    expect(ran).toBe(0)
    await vi.advanceTimersByTimeAsync(2)
    expect(ran).toBe(1)
    expect(g.whenReady(() => ran++, STRATEGIES.S3)).toBe(true) // пауза давно прошла
  })

  it('смена стратегии между нажатиями в контроллере: прошлый запуск под S1, тап уже под S3 — ждём end + 900 мс', async () => {
    let id = 'S1'
    const s = setup({ getRestart: () => id })
    await okRun(s)
    id = 'S3'
    s.tap()
    expect(FakeRec.all).toHaveLength(1)
    expect(s.last().preparing).toBe(true)
    await s.tick(905)
    expect(FakeRec.all).toHaveLength(2)
  })
})
