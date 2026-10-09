import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SEGMENT_SILENCE_MS } from './speechPolicy.js'
import { pushHistory, HISTORY_CAP, readSegments, segmentsText, segmentsConfidence } from './speechSegments.js'
import { FakeRec, alt, interimRes, setup } from './speechTestKit.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const res = (text, isFinal, confidence = 0.9) => Object.assign([{ transcript: text, confidence }], { isFinal })

describe('configure-хук и maxAlternatives (эксперименты пробы)', () => {
  it('по умолчанию хука нет: распознаватель как раньше (3 альтернативы, не continuous), applied пуст', () => {
    const s = setup()
    s.tap()
    expect(s.rec(0).maxAlternatives).toBe(3)
    expect(s.rec(0).continuous).toBe(false)
    expect(s.last().applied).toBeNull()
  })

  it('опция maxAlternatives; configure вызывается один раз на экземпляр с ctx и может переопределить свойства', () => {
    const calls = []
    const s = setup({
      maxAlternatives: 5,
      configure: (rec, ctx) => { calls.push({ rec, ctx }); rec.lang = 'en-GB'; rec.maxAlternatives = 10; return { lang: rec.lang, note: 'x' } },
    })
    s.ctrl.start({ reference: "I'm trying", lang: 'en-US', extra: { modes: ['alts'] } })
    expect(calls).toHaveLength(1)
    expect(calls[0].rec).toBe(s.rec(0))
    expect(calls[0].ctx).toMatchObject({ retry: 0, reference: "I'm trying", lang: 'en-US', extra: { modes: ['alts'] } })
    expect(s.rec(0)).toMatchObject({ lang: 'en-GB', maxAlternatives: 10, started: true })
    expect(s.last().applied).toEqual({ lang: 'en-GB', note: 'x' })
    expect(s.last().extra).toEqual({ modes: ['alts'] })
  })

  it('исключение в configure не ломает попытку', () => {
    const s = setup({ configure: () => { throw new Error('boom') } })
    s.tap()
    expect(s.rec(0).started).toBe(true)
    expect(s.last().status).toBe('starting')
  })

  it('автоповтор: configure вызывается заново на новом экземпляре', async () => {
    const calls = []
    const s = setup({ configure: (rec, ctx) => { calls.push(ctx.retry) } })
    s.tap()
    s.rec(0).onerror({ error: 'network' })
    await s.tick(1000)
    expect(calls).toEqual([0, 1])
    expect(FakeRec.all).toHaveLength(2)
  })

  it('logFields получает { view, extra } — запись журнала видит итог и снимок режимов', async () => {
    const seen = []
    const s = setup({ logFields: (m, i, ctx) => { seen.push(ctx); return { marker: ctx.extra?.modes } } })
    s.ctrl.start({ reference: 'I am trying', lang: 'en-US', extra: { modes: ['alts'] } })
    s.rec(0).onaudiostart()
    s.rec(0).onresult({ results: [alt('I am trying')] })
    s.rec(0).onend()
    await s.tick(10)
    expect(seen[0].view.final.text).toBe('I am trying')
    expect(seen[0].extra).toEqual({ modes: ['alts'] })
    expect(s.entries[0].marker).toEqual(['alts'])
  })
})

describe('история interim', () => {
  it('пишет каждое обновление с метками времени и финал с final; дубли подряд схлопываются', async () => {
    let t = 0
    const s = setup({ perfNow: () => t })
    s.tap()
    s.rec(0).onaudiostart()
    t = 400; s.rec(0).onresult({ results: [interimRes('I am')] })
    t = 800; s.rec(0).onresult({ results: [interimRes('I am try')] })
    t = 900; s.rec(0).onresult({ results: [interimRes('I am try')] })
    t = 1450; s.rec(0).onresult({ results: [alt('I am trying')] })
    expect(s.last().history).toEqual([
      { t: 400, text: 'I am' }, { t: 800, text: 'I am try' }, { t: 1450, text: 'I am trying', final: true },
    ])
  })

  it('pushHistory ограничивает 80 записей (старейшие отбрасываются)', () => {
    let h = []
    for (let i = 0; i < HISTORY_CAP + 20; i++) h = pushHistory(h, { t: i, text: `w${i}` })
    expect(h).toHaveLength(HISTORY_CAP)
    expect(h[0].text).toBe('w20')
  })

  it('новая попытка начинает историю заново', async () => {
    const s = setup()
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onresult({ results: [interimRes('hello')] })
    s.rec(0).onerror({ error: 'network' })
    await s.tick(1000)
    expect(s.last().history).toEqual([])
  })
})

describe('continuous («По словам, с паузами»)', () => {
  it('сегменты копятся, итог = склейка после SEGMENT_SILENCE_MS тишины', async () => {
    const s = setup({ configure: rec => { rec.continuous = true } })
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onresult({ results: [res("I'm", false)] })
    s.rec(0).onresult({ results: [res("I'm", true, 0.8)] })
    await s.tick(600)
    s.rec(0).onresult({ results: [res("I'm", true, 0.8), res('try', true, 0.6)] })
    expect(s.last().final).toBeNull()
    expect(s.last().segments.map(x => x.text)).toEqual(["I'm", 'try'])
    await s.tick(SEGMENT_SILENCE_MS - 100)
    expect(s.last().final).toBeNull() // тишина ещё не набежала
    await s.tick(200)
    expect(s.last().final).toEqual({ text: "I'm try", confidence: expect.closeTo(0.7, 5) })
    expect(s.last().alternatives).toHaveLength(1)
    expect(s.rec(0).stopped).toBe(1)
    s.rec(0).onend()
    await s.tick(10)
    expect(s.entries[0].outcome).toBe('ok')
  })

  it('«Стоп» без итога: берём склейку сегментов, usedInterim только если финальных не было', async () => {
    const s = setup({ configure: rec => { rec.continuous = true } })
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onresult({ results: [res('I am', true, 0.9), res('try', false, 0)] })
    s.ctrl.stop()
    s.rec(0).onend()
    await s.tick(10)
    expect(s.last().final.text).toBe('I am try')
    expect(s.last().usedInterim).toBe(false)
    expect(s.entries[0].outcome).toBe('ok')
  })

  it('speechstart продлевает ожидание конца', async () => {
    const s = setup({ configure: rec => { rec.continuous = true } })
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onresult({ results: [res('one', true)] })
    await s.tick(SEGMENT_SILENCE_MS - 200)
    s.rec(0).onspeechstart()
    await s.tick(SEGMENT_SILENCE_MS - 200)
    expect(s.last().final).toBeNull()
    await s.tick(300)
    expect(s.last().final.text).toBe('one')
  })

  it('обычный режим (без continuous) не затронут: первый final закрывает попытку', () => {
    const s = setup()
    s.tap()
    s.rec(0).onaudiostart()
    s.rec(0).onresult({ results: [alt('hello')] })
    expect(s.last().final.text).toBe('hello')
    expect(s.last().segments).toEqual([])
  })
})

describe('speechSegments', () => {
  it('readSegments хранит момент появления и финализации; склейка и средняя уверенность', () => {
    const a = readSegments([res('a', false)], [], 100)
    expect(a[0]).toMatchObject({ text: 'a', isFinal: false, t: 100, tFinal: null })
    const b = readSegments([res('a', true, 0.5), res('b', false, 0)], a, 300)
    expect(b[0]).toMatchObject({ t: 100, tFinal: 300 })
    expect(b[1]).toMatchObject({ t: 300, tFinal: null })
    const c = readSegments([res('a', true, 0.5), res('b', true, 0.7)], b, 500)
    expect(c[0].tFinal).toBe(300)
    expect(segmentsText(c)).toBe('a b')
    expect(segmentsConfidence(c)).toBeCloseTo(0.6)
    expect(segmentsConfidence(b.slice(1))).toBeNull()
  })
})
