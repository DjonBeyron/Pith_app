import { describe, it, expect, vi } from 'vitest'
import { sayReducer, initialSayState } from './sayFlow.js'
import { emptyView } from './speechView.js'
import { readSayData } from './sayPhraseData.js'
import { createVoskRecognizer } from '../vosk/voskRecognizer.js'

// Оценка результата ОДИНАКОВА для обоих движков: те же тексты через системные виды (как их отдаёт speechController) и через виды адаптера Vosk приходят в один и тот же
// sayFlow → judgeRun (speechMatch / strict / threshold / firstSeenRule) → подсказки и реплика. «I'm try» остаётся ошибкой и не «исправляется».
const ALL_OK = { phase: 'passed' }
const w = (word, conf = 0.9) => ({ word, conf, start: 0, end: 1 })

function settle(data, view) {
  let s = sayReducer(initialSayState({ action: 'listen' }), { type: 'begin', data })
  s = sayReducer(s, { type: 'view', view: { ...emptyView, runNo: 1, status: 'listening', attempt: 1 } })
  return sayReducer(s, { type: 'view', view: { ...view, runNo: 1 } })
}
// Вид системного распознавания: итог + interim-история
function systemView(text, partials = []) {
  const history = [...partials.map(([t, x]) => ({ t, text: x })), ...(text ? [{ t: 1500, text, final: true }] : [])]
  if (!text) return { ...emptyView, status: 'error', error: 'no-speech', attempt: 1, history }
  return { ...emptyView, status: 'done', attempt: 1, final: { text, confidence: 0.9 }, alternatives: [{ text, confidence: 0.9 }], lastInterim: partials.at(-1)?.[1] ?? text, history }
}
// Вид адаптера Vosk на подставном движке: тот же текст приходит как partial-ы и итог
function voskView(data, text, partials = [], words = null) {
  vi.useFakeTimers()
  try {
    const views = []
    let cb
    const handle = { stop: vi.fn(), cancel: vi.fn() }
    const rec = createVoskRecognizer({ runtime: { getModel: () => ({}) }, listen: (_m, _g, c) => { cb = c; return Promise.resolve(handle) }, onView: v => views.push(v), onFail: vi.fn() })
    rec.start({ reference: data.phrase, lang: 'en-US', data })
    cb.onReady({})
    let at = 0
    for (const [t, x] of partials) { vi.advanceTimersByTime(t - at); at = t; cb.onPartial(x) }
    vi.advanceTimersByTime(1500 - at)
    cb.onResult(text, { words: words ?? text.split(' ').filter(Boolean).map(x => w(x)), afterStopMs: 10 })
    return views.at(-1)
  } finally { vi.useRealTimers() }
}
const both = (data, text, partials) => ({ sys: settle(data, systemView(text, partials)), vosk: settle(data, voskView(data, text, partials)) })
const same = (a, b) => {
  expect(b.phase).toBe(a.phase)
  expect(b.verdict?.passed).toBe(a.verdict?.passed)
  expect(b.verdict?.matched).toEqual(a.verdict?.matched)
  expect(b.verdict?.missed).toEqual(a.verdict?.missed)
  expect(b.hint?.kind).toBe(a.hint?.kind)
  expect(b.reply?.text).toBe(a.reply?.text)
}

describe('одна и та же оценка для системного движка и Vosk', () => {
  it('верная фраза (и «i am» вместо «i\'m») засчитывается одинаково — обычный и «Строго» режим', () => {
    for (const strict of [false, true]) {
      const d = readSayData({ phrase: "I'm trying", keywords: 'trying', strict })
      for (const text of ["i'm trying", 'i am trying']) {
        const { sys, vosk } = both(d, text, [[300, "i'm"], [700, text]])
        expect(sys).toMatchObject(ALL_OK); same(sys, vosk)
      }
    }
  })

  it("«I'm try» остаётся ошибкой и не «исправляется»: ключевое слово trying не засчитано, подсказка и реплика те же", () => {
    for (const strict of [false, true]) {
      const d = readSayData({ phrase: "I'm trying", keywords: 'trying', strict })
      const { sys, vosk } = both(d, "i'm try", [[300, "i'm"], [800, "i'm try"]])
      expect(sys.phase).toBe('failed'); expect(vosk.phase).toBe('failed')
      expect(vosk.verdict.missed).toContain('trying'); expect(vosk.reply.text).toBe("I'm try")
      same(sys, vosk)
    }
  })

  it('«Строго» + мелькание: ошибочная форма «try» держалась дольше порога и затем «исправилась» — не засчитано у обоих; мимолётная (быстрее порога) — засчитано у обоих', () => {
    const d = readSayData({ phrase: "I'm trying", keywords: 'trying', strict: true })
    const long = both(d, "i'm trying", [[300, "i'm"], [500, "i'm try"], [1300, "i'm trying"]]) // «try» стояла 800 мс
    expect(long.sys.phase).toBe('failed'); same(long.sys, long.vosk)
    const quick = both(d, "i'm trying", [[300, "i'm"], [500, "i'm try"], [650, "i'm trying"]]) // 150 мс — мелькнула и исчезла
    expect(quick.sys.phase).toBe('passed'); same(quick.sys, quick.vosk)
  })

  it('порог слов ноды и «почти получилось»: подсказка partial с теми же списками слов', () => {
    const d = readSayData({ phrase: 'She has a red cat', threshold: 100 })
    const { sys, vosk } = both(d, 'she has a cat', [[400, 'she has a cat']])
    expect(sys.hint.kind).toBe('partial'); same(sys, vosk)
    expect(vosk.hint.text).toContain('red')
  })

  it('чужая фраза → «mismatch»; тишина → silence; всё одинаково', () => {
    const d = readSayData({ phrase: "I'm trying", keywords: 'trying' })
    const other = both(d, 'hello world', [[400, 'hello world']])
    expect(other.sys.hint.kind).toBe('mismatch'); same(other.sys, other.vosk)
    const quiet = both(d, '', [])
    expect(quiet.sys.hint.kind).toBe('silence'); expect(quiet.vosk.hint.kind).toBe('silence'); expect(quiet.vosk.reply).toBeNull()
  })

  it('слово ниже порога уверенности Vosk (0.3) = нераспознанное: «i\'m» с conf 0.2 не засчитано, как будто движок его не услышал', () => {
    const d = readSayData({ phrase: "I'm trying", keywords: 'trying' })
    const vosk = settle(d, voskView(d, "i'm trying", [[400, "i'm trying"]], [w("i'm", 0.2), w('trying', 0.9)]))
    const sys = settle(d, systemView('trying', [[400, 'trying']]))
    expect(vosk.phase).toBe('failed'); same(sys, vosk)
    // а при 0.3 слово принимается
    expect(settle(d, voskView(d, "i'm trying", [[400, "i'm trying"]], [w("i'm", 0.3), w('trying', 0.9)])).phase).toBe('passed')
  })

  it('ПОСЛЕДНЕЕ слово эталона проверяется мягче (0.15): «trying» с conf 0.2 принимается, с 0.1 — нет (как будто движок его не услышал)', () => {
    const d = readSayData({ phrase: "I'm trying", keywords: 'trying' })
    expect(settle(d, voskView(d, "i'm trying", [[400, "i'm trying"]], [w("i'm", 0.9), w('trying', 0.2)])).phase).toBe('passed')
    const low = settle(d, voskView(d, "i'm trying", [[400, "i'm trying"]], [w("i'm", 0.9), w('trying', 0.1)]))
    const sys = settle(d, systemView("i'm", [[400, "i'm"]]))
    expect(low.phase).toBe('failed'); same(sys, low)
  })

  it('[unk] вместо слова не засчитывается как слово', () => {
    const d = readSayData({ phrase: "I'm trying", keywords: 'trying' })
    const r = settle(d, voskView(d, "i'm [unk]", [[400, "i'm [unk]"]], [w("i'm"), w('[unk]', 1)]))
    expect(r.phase).toBe('failed'); expect(r.verdict.missed).toContain('trying'); expect(r.reply.text).toBe("I'm")
  })

  it('ошибка движка Vosk (vosk-error): без текстовой подсказки и реплики, круг снова готов', () => {
    const d = readSayData({ phrase: "I'm trying" })
    const r = settle(d, { ...emptyView, status: 'error', error: 'vosk-error', attempt: 1 })
    expect(r.phase).toBe('failed'); expect(r.hint).toBeNull(); expect(r.reply).toBeNull()
  })

  it('отказ микрофона у Vosk (not-allowed) → запасной режим «отказ», как у системного', () => {
    const d = readSayData({ phrase: "I'm trying" })
    const r = settle(d, { ...emptyView, status: 'error', error: 'not-allowed', attempt: 1 })
    expect(r).toMatchObject({ phase: 'fallback', fallbackReason: 'denied' })
  })
})
