import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FakeRec, alt, setup } from './speechTestKit.js'
import { RETRY_PAUSE_MS, RESTART_COOLDOWN_MS, STOP_FORCE_MS } from './speechPolicy.js'
import { STRATEGIES, STRATEGY_IDS, MODULE_STRATEGY, resolveStrategy } from './speechRestart.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const withStrategy = id => setup({ getRestart: () => id })
// Один успешный заход: audiostart, результат, end — экземпляр закрыт нашим teardown, ждём паузу стратегии
async function okRun(s, i = 0, flush = true) {
  s.tap()
  const r = s.rec(i)
  r.onaudiostart(); r.onsoundstart(); r.onresult({ results: [alt('I am here')] })
  r.onend()
  if (flush) await s.tick(0)
}

describe('стратегии: таблица и разбор', () => {
  it('S1…S5 заданы по ТЗ, S1 — прежнее поведение, незнакомое → S1', () => {
    expect(STRATEGY_IDS).toEqual(['S1', 'S2', 'S3', 'S4', 'S5'])
    expect(STRATEGIES.S1).toEqual({ reuse: false, stop: false, waitEnd: false, pauseMs: 0 })
    expect(STRATEGIES.S2).toMatchObject({ reuse: true, waitEnd: true, pauseMs: 0 })
    expect(STRATEGIES.S3).toMatchObject({ reuse: false, waitEnd: true, pauseMs: 900 })
    expect(STRATEGIES.S4).toMatchObject({ reuse: false, stop: true, waitEnd: true, pauseMs: 700 })
    expect(STRATEGIES.S5).toMatchObject({ reuse: true, waitEnd: true, pauseMs: 700 })
    expect(MODULE_STRATEGY).toMatchObject({ reuse: false, waitEnd: true, pauseMs: RESTART_COOLDOWN_MS })
    expect(RESTART_COOLDOWN_MS).toBe(600)
    expect(resolveStrategy('zzz').id).toBe('S1')
    expect(resolveStrategy('M').pauseMs).toBe(600)
    expect(resolveStrategy({ waitEnd: true, pauseMs: 5 })).toMatchObject({ id: 'custom', reuse: false, pauseMs: 5 })
  })
})

describe('затвор: пауза после end', () => {
  it('S1 (по умолчанию): ничего не ждём — следующий запуск сразу, как раньше', async () => {
    const s = withStrategy('S1')
    await okRun(s)
    s.tap()
    expect(FakeRec.all).toHaveLength(2)
    expect(s.last().cooling).toBe(false)
    expect(s.last().preparing).toBe(false)
  })

  it('S3: после end нужна пауза 900 мс; тап внутри окна встаёт в очередь («Подготовка микрофона…») и стартует по её окончании', async () => {
    const s = withStrategy('S3')
    await okRun(s)
    expect(s.last().cooling).toBe(true) // кнопка пробы блокируется
    s.tap()
    expect(FakeRec.all).toHaveLength(1)
    expect(s.last()).toMatchObject({ status: 'starting', preparing: true, notice: 'Подготовка микрофона…' })
    await s.tick(899)
    expect(FakeRec.all).toHaveLength(1)
    await s.tick(2)
    expect(FakeRec.all).toHaveLength(2)
    expect(s.rec(1).started).toBe(true)
    expect(s.last()).toMatchObject({ preparing: false, cooling: false, attempt: 1 })
  })

  it('после паузы тап стартует синхронно (внутри жеста), без очереди', async () => {
    const s = withStrategy('S3')
    await okRun(s)
    await s.tick(901)
    expect(s.last().cooling).toBe(false)
    s.tap()
    expect(s.rec(1).started).toBe(true)
  })

  it('end не пришёл: ждём до STOP_FORCE_MS (+ пауза), экземпляр при этом гасится abort()', async () => {
    const s = withStrategy('S3')
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onerror({ error: 'not-allowed' }) // заход закончен ошибкой, end не пришёл
    expect(s.rec(0).aborted).toBe(1)
    s.tap()
    await s.tick(STOP_FORCE_MS + 899)
    expect(FakeRec.all).toHaveLength(1)
    await s.tick(2)
    expect(FakeRec.all).toHaveLength(2)
  })

  it('end пришёл раньше таймера: пауза считается от end, а не от конца попытки', async () => {
    const s = withStrategy('S3')
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onerror({ error: 'not-allowed' })
    s.tap()
    await s.tick(1000)
    s.rec(0).onend() // gate повесил onend на закрытый экземпляр
    await s.tick(899)
    expect(FakeRec.all).toHaveLength(1)
    await s.tick(2)
    expect(FakeRec.all).toHaveLength(2)
  })

  it('очередь: второй тап заменяет первый; «Стоп» отменяет ожидающий запуск; reset тоже', async () => {
    const s = withStrategy('S3')
    await okRun(s)
    s.ctrl.start({ reference: 'one', lang: 'en-US' })
    s.ctrl.start({ reference: 'two', lang: 'en-GB' })
    await s.tick(1000)
    expect(FakeRec.all).toHaveLength(2)
    expect(s.last()).toMatchObject({ reference: 'two', lang: 'en-GB' })
    s.rec(1).onaudiostart(); s.rec(1).onresult({ results: [alt('x')] }); s.rec(1).onend()
    await s.tick(0)
    s.tap()
    s.ctrl.stop()
    expect(s.last()).toMatchObject({ status: 'done', preparing: false })
    await s.tick(2000)
    expect(FakeRec.all).toHaveLength(2)
    const r = withStrategy('S3')
    await okRun(r)
    r.tap(); r.ctrl.reset()
    await r.tick(2000)
    expect(FakeRec.all).toHaveLength(1) // setup обнулил список: у r один экземпляр, новый запуск сброшен
  })

  it('S4: stop() вместо abort(), ждём end, затем 700 мс', async () => {
    const s = withStrategy('S4')
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onerror({ error: 'not-allowed' })
    expect(s.rec(0).stopped).toBe(1)
    expect(s.rec(0).aborted).toBe(0)
    s.tap()
    s.rec(0).onend()
    await s.tick(699)
    expect(FakeRec.all).toHaveLength(1)
    await s.tick(2)
    expect(FakeRec.all).toHaveLength(2)
  })

  it('S4: финал гасится stop(), даже когда endOnFinal=abort', () => {
    const s = setup({ getRestart: () => 'S4', endOnFinal: 'abort' })
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onresult({ results: [alt('I am here')] })
    expect(s.rec(0).stopped).toBe(1)
    expect(s.rec(0).aborted).toBe(0)
  })

  it('автоповтор тоже ждёт end и паузу стратегии (не раньше RETRY_PAUSE_MS и не раньше конца закрытия)', async () => {
    const s = withStrategy('S3')
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onerror({ error: 'network' })
    await s.tick(RETRY_PAUSE_MS + 1)
    expect(FakeRec.all).toHaveLength(1) // end не пришёл — ждём
    s.rec(0).onend()
    await s.tick(899)
    expect(FakeRec.all).toHaveLength(1)
    await s.tick(2)
    expect(FakeRec.all).toHaveLength(2)
    expect(s.last().attempt).toBe(2)
  })

  it('«Стоп» во время ожидания автоповтора на затворе отменяет его', async () => {
    const s = withStrategy('S3')
    s.tap()
    s.rec(0).onerror({ error: 'network' })
    await s.tick(RETRY_PAUSE_MS + 1)
    s.ctrl.stop()
    s.rec(0).onend()
    await s.tick(5000)
    expect(FakeRec.all).toHaveLength(1)
    expect(s.last().status).toBe('done')
  })

  it('модуль (стратегия M): тап в течение 600 мс после end ставится в очередь и стартует по окончании паузы', async () => {
    const s = setup({ getRestart: () => 'M', endOnFinal: 'abort' })
    s.tap()
    s.rec(0).onaudiostart(); s.rec(0).onresult({ results: [alt('I am here')] })
    s.rec(0).onend()
    await s.tick(0)
    s.tap()
    expect(s.last().preparing).toBe(true)
    await s.tick(RESTART_COOLDOWN_MS - 5)
    expect(FakeRec.all).toHaveLength(1)
    await s.tick(10)
    expect(FakeRec.all).toHaveLength(2)
  })

  it('события закрытого экземпляра по-прежнему игнорируются (обработчики сняты, кроме служебного end)', async () => {
    const s = withStrategy('S3')
    s.tap()
    const first = s.rec(0)
    s.ctrl.reset()
    expect(first.onresult).toBe(null)
    expect(typeof first.onend).toBe('function')
    expect(s.ctrl.isAudioActive()).toBe(false)
  })
})
