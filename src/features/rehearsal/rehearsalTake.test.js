import { describe, it, expect, vi, afterEach } from 'vitest'
import { createTake, TAKE_MAX_MS, STOP_WAIT_MS } from './rehearsalTake.js'
import { CHUNKS, DICTOR, STUDENT_CLEAN, STUDENT_PAUSE } from './mirror/mirrorFixtures.js'

// Дубль акта 5 без микрофона: запись (подставная), слушатель игры (подставной: words / startedAt / flush) → данные зеркала
const dictorOf = () => ({ ...DICTOR, leadMs: 0, play() {}, cancel() {} })
const stream = { getTracks: () => [{ readyState: 'live' }] }
const okRec = (take = { url: 'blob:take', durationMs: 2600, rms: 0.09 }) => ({ ok: true, error: null, stop: vi.fn(async () => take), cancel: vi.fn() })
const failRec = code => { const p = Promise.reject(Object.assign(new Error(code), { code })); p.catch(() => {}); return { ok: false, error: code, stop: () => p, cancel() {} } }
/** Слушатель, стартовавший за 2,4 с до записи (плашка «Дубль…»): слова фикстуры (секунды от записи) → мс его шкалы */
const listenerFor = (student, { recAt = 50000, lead = 2400 } = {}) => ({
  startedAt: () => recAt - lead,
  words: () => student.words.map(w => ({ ...w, start: Math.round(w.start * 1000) + lead, end: Math.round(w.end * 1000) + lead })),
  flush: vi.fn(async () => {}),
})
const make = (o = {}) => createTake({ chunks: CHUNKS, rate: 1, lang: 'en-US', getStream: () => stream, dictorOf, loudness: async () => 0.1, now: () => 50000, ...o })

afterEach(() => vi.useRealTimers())

describe('createTake: запись и слова', () => {
  it('begin: запись на потоке игры с потолком TAKE_MAX_MS; getUserMedia не зовётся (поток чужой)', () => {
    const record = vi.fn(() => okRec())
    make({ record }).begin(null)
    expect(record).toHaveBeenCalledWith({ stream, maxMs: TAKE_MAX_MS, log: expect.any(Function) }); expect(TAKE_MAX_MS).toBe(9000)
  })

  it('finish: слушатель отдаёт итог (flush), запись останавливается, слова приводятся к шкале записи, measure и note — чисто', async () => {
    const rec = okRec(); const l = listenerFor(STUDENT_CLEAN)
    const t = make({ record: () => rec })
    t.begin(l)
    const r = await t.finish(l)
    expect(l.flush).toHaveBeenCalledTimes(1); expect(rec.stop).toHaveBeenCalledTimes(1)
    expect(r.take).toMatchObject({ url: 'blob:take' }); expect(r.error).toBeNull()
    expect(r.words.map(w => [w.word, w.start, w.end])).toEqual([["i'm", 400, 700], ['trying', 780, 1300], ['to', 1380, 1500], ['learn', 1500, 2000]])
    expect(r.mirror.student).toMatchObject({ url: 'blob:take', durationMs: 2600, unit: 'ms' })
    expect(r.mirror.note.key).toBe('clean'); expect(r.mirror.tempo).toBeGreaterThan(0.9); expect(r.mirror.tempo).toBeLessThan(1.1)
  })

  it('долгая пауза внутри фразы доходит до заметки (шкала заходов и запись согласованы)', async () => {
    const l = listenerFor(STUDENT_PAUSE)
    const t = make({ record: () => okRec({ url: 'blob:take', durationMs: 3600, rms: 0.09 }) })
    t.begin(l)
    const r = await t.finish(l)
    expect(r.mirror.note.key).toBe('pause'); expect(r.mirror.measure.pauses[0]).toMatchObject({ before: 'to learn' })
  })

  it('слушатель, который закрыли и пересоздали во время дубля (микрофон переоткрыт): слова обоих', async () => {
    const first = listenerFor({ words: STUDENT_CLEAN.words.slice(0, 2) }); const second = { startedAt: () => 50000 + 1000, words: () => [{ word: 'to', conf: 1, start: 380, end: 500 }, { word: 'learn', conf: 1, start: 500, end: 1000 }], flush: vi.fn(async () => {}) }
    const t = make({ record: () => okRec() })
    t.begin(first)
    const r = await t.finish(second)
    expect(r.words.map(w => w.word)).toEqual(["i'm", 'trying', 'to', 'learn']); expect(first.flush).toHaveBeenCalled(); expect(second.flush).toHaveBeenCalled()
    expect(r.words[2]).toMatchObject({ start: 1380, end: 1500 })
  })

  it('поток приходит обещанием (микрофон переоткрывался): запись стартует, когда он готов; время старта — этот момент', async () => {
    let resolve; const record = vi.fn(() => okRec())
    const clock = { t: 50000 }
    const t = make({ record, now: () => clock.t, getStream: () => new Promise(r => { resolve = r }) })
    const l = { startedAt: () => 50000, words: () => [{ word: 'trying', start: 1500, end: 2000 }], flush: async () => {} }
    t.begin(l)
    expect(record).not.toHaveBeenCalled()
    clock.t = 50500; resolve(stream); await Promise.resolve()
    expect(record).toHaveBeenCalledTimes(1)
    const r = await t.finish(l)
    expect(r.words[0]).toMatchObject({ word: 'trying', start: 1000, end: 1500 }) // старт записи на 500 мс позже слушателя
  })
})

describe('createTake: сбои записи → зеркало с диктором и заметкой о сбое', () => {
  const failed = async (record, o = {}) => { const t = make({ record, ...o }); t.begin(null); return t.finish(null) }
  it.each(['no-recorder', 'dead-stream', 'failed'])('recordTake не стартовала (%s): take = null, student и measure null, note «fail», диктор на месте', async code => {
    const log = vi.fn()
    const r = await failed(() => failRec(code), { log })
    expect(r.take).toBeNull(); expect(r.error).toBe(code)
    expect(r.mirror).toMatchObject({ student: null, measure: null, tempo: null }); expect(r.mirror.note.key).toBe('fail'); expect(r.mirror.dictor.words.length).toBeGreaterThan(0)
    expect(log).toHaveBeenCalledWith(expect.stringContaining(code))
  })
  it('stop() отклонился (пустой файл): сбой с кодом empty', async () => {
    const rec = { ok: true, error: null, stop: () => Promise.reject(Object.assign(new Error('empty'), { code: 'empty' })), cancel() {} }
    const r = await failed(() => rec)
    expect(r.error).toBe('empty'); expect(r.mirror.note.key).toBe('fail')
  })
  it('нет потока (getStream бросил / null): запись всё равно пробуется и сообщает сбой; finish не бросает', async () => {
    const record = vi.fn(() => failRec('dead-stream'))
    const r = await failed(record, { getStream: () => { throw new Error('mic') } })
    expect(record).toHaveBeenCalledWith({ stream: null, maxMs: TAKE_MAX_MS, log: expect.any(Function) }); expect(r.mirror.note.key).toBe('fail')
  })
  it('поток-обещание отклонён — запись с null (сбой), не зависание', async () => {
    const record = vi.fn(() => failRec('dead-stream'))
    const t = make({ record, getStream: () => Promise.reject(new Error('denied')) })
    t.begin(null); await Promise.resolve(); await Promise.resolve()
    expect(record).toHaveBeenCalledWith({ stream: null, maxMs: TAKE_MAX_MS, log: expect.any(Function) })
    expect((await t.finish(null)).mirror.note.key).toBe('fail')
  })
  it('запись не отдала файл за STOP_WAIT_MS — сбой timeout', async () => {
    vi.useFakeTimers()
    const rec = { ok: true, error: null, stop: () => new Promise(() => {}), cancel() {} }
    const t = make({ record: () => rec }); t.begin(null)
    const p = t.finish(null)
    await vi.advanceTimersByTimeAsync(STOP_WAIT_MS + 10)
    const r = await p
    expect(r.error).toBe('timeout'); expect(r.take).toBeNull()
  })
  it('flush слушателя упал — дубль всё равно собирается', async () => {
    const l = { ...listenerFor(STUDENT_CLEAN), flush: () => Promise.reject(new Error('x')) }
    const t = make({ record: () => okRec() }); t.begin(l)
    expect((await t.finish(l)).mirror.note.key).toBe('clean')
  })
  it('громкость диктора не посчиталась (ошибка) — заметки про громкость нет, остальное работает', async () => {
    const l = listenerFor(STUDENT_CLEAN)
    const t = make({ record: () => okRec(), loudness: () => Promise.reject(new Error('no audio')) }); t.begin(l)
    const r = await t.finish(l)
    expect(r.mirror.measure.loud).toBeNull(); expect(r.mirror.note.key).toBe('clean')
  })
})

describe('createTake: отмена', () => {
  it('cancel до готовности потока — запись не начнётся; cancel после begin отменяет идущую запись', async () => {
    let resolve; const record = vi.fn(() => okRec())
    const a = make({ record, getStream: () => new Promise(r => { resolve = r }) })
    a.begin(null); a.cancel(); resolve(stream); await Promise.resolve()
    expect(record).not.toHaveBeenCalled()
    const rec = okRec(); const b = make({ record: () => rec })
    b.begin(null); b.cancel()
    expect(rec.cancel).toHaveBeenCalledTimes(1)
  })
})
