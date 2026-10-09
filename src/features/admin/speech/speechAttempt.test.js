import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { STOP_FORCE_MS } from './speechPolicy.js'
import { FakeRec, alt, interimRes, setup } from './speechTestKit.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('attemptId и новый экземпляр на каждую попытку', () => {
  it('события старого экземпляра не перезаписывают новую попытку', async () => {
    const s = setup()
    s.tap('first phrase')
    const oldResult = s.rec(0).onresult
    const oldEnd = s.rec(0).onend
    const oldError = s.rec(0).onerror
    const id0 = s.last().attemptId
    s.tap('second phrase')
    expect(FakeRec.all).toHaveLength(2)
    expect(s.rec(0).aborted).toBeGreaterThan(0) // прошлый экземпляр погашен до старта нового
    expect(s.last().attemptId).not.toBe(id0)
    oldResult({ results: [alt('stale text')] })
    oldError({ error: 'network' })
    oldEnd()
    await s.tick(0)
    expect(s.last().final).toBeNull()
    expect(s.last().status).toBe('starting')
    expect(s.last().reference).toBe('second phrase')
    expect(s.entries).toHaveLength(0)
  })

  it('после завершения новый тап даёт чистое состояние и свежий экземпляр', async () => {
    const s = setup()
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onresult({ results: [alt("i'm trying to please both")] })
    s.rec(0).onend()
    expect(s.last().final.text).toBe("i'm trying to please both")
    s.tap("I don't know what to say")
    expect(s.last().final).toBeNull()
    expect(s.last().alternatives).toEqual([])
    expect(s.last().reference).toBe("I don't know what to say")
    expect(s.last().runNo).toBe(2)
    expect(FakeRec.all).toHaveLength(2)
    expect(s.rec(1)).not.toBe(s.rec(0))
  })

  it('эталон и язык фиксируются на тап; reset очищает итог', () => {
    const s = setup()
    s.tap('abc def', 'en-GB')
    expect(s.rec(0).lang).toBe('en-GB')
    s.rec(0).onresult({ results: [alt('abc def')] })
    expect(s.last()).toMatchObject({ reference: 'abc def', lang: 'en-GB' })
    s.ctrl.reset()
    expect(s.last()).toMatchObject({ status: 'idle', final: null, reference: '', alternatives: [] })
  })

  it('после таймаута/ошибки кнопка снова доступна (не busy-состояние)', async () => {
    const s = setup()
    s.tap()
    s.rec(0).onerror({ error: 'not-allowed' })
    expect(s.last().status).toBe('error')
    s.tap()
    expect(s.last().status).toBe('starting')
    expect(FakeRec.all).toHaveLength(2)
  })
})

describe('остановка и закрытие без end', () => {
  it('«Стоп» без события end закрывается сам через STOP_FORCE_MS', async () => {
    const s = setup()
    s.tap()
    s.rec(0).onaudiostart()
    s.ctrl.stop()
    expect(s.rec(0).stopped).toBe(1)
    await s.tick(STOP_FORCE_MS + 1)
    expect(s.last().status).toBe('done')
    expect(s.last().error).toBeNull()
  })

  it('финал есть, а end не пришёл — закрываем сами', async () => {
    const s = setup()
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onresult({ results: [alt('hello')] })
    await s.tick(STOP_FORCE_MS + 1)
    expect(s.last().status).toBe('done')
    expect(s.entries[0]).toMatchObject({ outcome: 'ok', last: true })
  })

  it('end без финала, но с interim — берём interim', async () => {
    const s = setup()
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onresult({ results: [interimRes('almost there')] })
    s.rec(0).onend()
    expect(s.last()).toMatchObject({ status: 'done', usedInterim: true })
    expect(s.last().final.text).toBe('almost there')
  })

  it('исключение из start() на тапе: ошибка start-failed, без повторов', async () => {
    const s = setup()
    const orig = FakeRec.prototype.start
    FakeRec.prototype.start = function () { throw new Error('boom') }
    s.tap()
    FakeRec.prototype.start = orig
    await s.tick(5000)
    expect(s.last()).toMatchObject({ status: 'error', error: 'start-failed' })
    expect(FakeRec.all).toHaveLength(1)
  })
})
