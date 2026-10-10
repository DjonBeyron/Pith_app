import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createVoskRecognizer } from './voskRecognizer.js'
import { buildRaw } from './voskRaw.js'
import { readSayData } from '../speech/sayPhraseData.js'

// «both» не слышно: что адаптер кладёт в view.raw (сырой результат Vosk по словам, что отбросил фильтр, как остановились) и какое последнее слово считает «хвостовым»
const data = readSayData({ phrase: "I'm trying to please both" })
const w = (word, conf, start = 0, end = 1) => ({ word, conf, start, end })

function make() {
  const views = []
  let cb
  const handle = { stop: vi.fn(), cancel: vi.fn() }
  const listen = vi.fn((_m, _g, c) => { cb = c; return Promise.resolve(handle) })
  const rec = createVoskRecognizer({ runtime: { getModel: () => ({}) }, listen, onView: v => views.push(v), onFail: vi.fn() })
  rec.start({ reference: data.phrase, lang: 'en-US', data })
  cb.onReady({})
  return { views, cb: () => cb, last: () => views.at(-1) }
}

describe('voskRecognizer: сырой результат в виде (view.raw)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('«both» с уверенностью 0.2 в конце — принято мягким порогом и попадает в оценку; raw показывает пословно', () => {
    const t = make()
    t.cb().onPartial("i'm trying to please")
    const words = [w("i'm", 0.9, 0.1, 0.4), w('trying', 0.9, 0.5, 0.9), w('to', 0.8, 1, 1.1), w('please', 0.8, 1.2, 1.6), w('both', 0.2, 1.7, 2.0)]
    t.cb().onResult("i'm trying to please both", { words, stopBy: 'auto', tailMs: 400, drainMs: null, afterStopMs: 20, resultMs: 3000 })
    expect(t.last()).toMatchObject({ status: 'done', final: { text: "i'm trying to please both" } })
    const raw = t.last().raw
    expect(raw).toMatchObject({ kept: "i'm trying to please both", partial: "i'm trying to please", tailWord: 'both', stopBy: 'auto', tailMs: 400, minConf: 0.3, tailMinConf: 0.15 })
    expect(raw.rows.at(-1)).toMatchObject({ word: 'both', conf: 0.2, start: 1.7, end: 2.0, need: 0.15, drop: null })
  })

  it('«both» с уверенностью 0.1 отброшен: в итог не идёт, но raw хранит его с причиной (low) — видно, что Vosk слово выдал', () => {
    const t = make()
    t.cb().onResult("i'm trying to please both", { words: [w("i'm", 0.9), w('trying', 0.9), w('to', 0.9), w('please', 0.9), w('both', 0.1)], stopBy: 'manual' })
    expect(t.last().final.text).toBe("i'm trying to please")
    expect(t.last().raw.rows.at(-1)).toMatchObject({ word: 'both', drop: 'low', need: 0.15 })
    expect(t.last().raw.kept).toBe("i'm trying to please")
  })

  it('всё отброшено (no-speech): raw всё равно в виде — видно, что именно отбросили', () => {
    const t = make()
    t.cb().onResult('[unk]', { words: [w('[unk]', 1)], stopBy: 'auto' })
    expect(t.last()).toMatchObject({ status: 'error', error: 'no-speech' })
    expect(t.last().raw.rows).toEqual([expect.objectContaining({ word: '[unk]', drop: 'unk' })])
  })
})

describe('buildRaw', () => {
  it('нет статистики и слов — безопасные null и пустые списки', () => {
    expect(buildRaw({ rawText: ' x ', cleaned: { text: '', rows: [] }, minConf: 0.3 })).toMatchObject({ rows: [], rawText: 'x', kept: '', stopBy: null, tailMs: null, lateChunks: null })
  })
})
