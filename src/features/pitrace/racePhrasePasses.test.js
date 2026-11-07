import { describe, it, expect, vi } from 'vitest'
import { maxPause, passTwoRes, passNote, passOutcome, phraseUnits, PAUSE_MAX_MS } from './racePhrasePasses.js'
import { phraseEvent, phraseSummary, phraseHits, phraseCount } from './raceStatePhrases.js'
import { outcomesOf } from './raceMemory.js'
import { createPhraseVoice } from './racePhraseVoice.js'
import { phrasesOf, phraseWordKeys } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'

// Два прохода «Скажи»: порог «без остановок», итог прохода 2, память и итог по двум проходам, голос Пита. Сцена — racePhraseScenePasses.test.js
const [nice, from] = phrasesOf({ phrases: PHRASE_FIXTURE })
const rep = (p, pass, res, round = 2) => ({ phraseKey: p.key, text: p.text, ru: p.ru, words: phraseWordKeys(p), round, mode: round === 1 ? 'pick' : 'say', target: p, cands: [{ key: p.key, text: p.text }], res, pass })
const ev = (kind, p, pass, res) => phraseEvent(kind, rep(p, pass, res))

describe('проход 2: без остановок', () => {
  it('наибольшая пауза — между соседними по времени словами (порядок прихода любой); меньше двух слов — 0', () => {
    expect(maxPause([0, 300, 1500, 1700])).toBe(1200); expect(maxPause([1500, 0, 300])).toBe(1200)
    expect(maxPause([5])).toBe(0); expect(maxPause([])).toBe(0); expect(maxPause(null)).toBe(0)
  })
  it(`порог ${PAUSE_MAX_MS} мс: ровно — без остановок, дольше — «с паузами» (засчитано, но нечисто); чисто — ещё и все слова`, () => {
    expect(PAUSE_MAX_MS).toBe(900)
    expect(passTwoRes(1, [0, 900])).toEqual({ ratio: 1, smooth: true, maxPause: 900, clean: true })
    expect(passTwoRes(1, [0, 901])).toMatchObject({ smooth: false, clean: false, maxPause: 901 })
    expect(passTwoRes(0.75, [0, 100, 200])).toMatchObject({ smooth: true, clean: false })
  })
  it('журнал: проход 1 — чисто / нечисто; проход 2 — чисто / с паузами / нечисто и макс. пауза; не успел — доля слов', () => {
    expect(passNote({ ok: true, ratio: 1, clean: true }, 1)).toBe('верно, слова 100 %, чисто')
    expect(passNote({ ok: true, ratio: 1, clean: true, smooth: true, maxPause: 640 }, 2)).toBe('верно, слова 100 %, чисто, макс. пауза 640 мс')
    expect(passNote({ ok: true, ratio: 1, clean: false, smooth: false, maxPause: 1500 }, 2)).toBe('верно, слова 100 %, с паузами, макс. пауза 1500 мс')
    expect(passNote({ ok: false, ratio: 0.25 }, 2)).toBe('не успел, слова 25 %')
  })
})

describe('итог фразы по двум проходам', () => {
  const clean1 = { ok: true, clean: true }, unclean1 = { ok: true, clean: false }, fail = { ok: false, clean: false }
  it('again — проход 1 не сказан; hard — проход 2 не чисто (или проход 1 нечисто); good — оба чисто', () => {
    expect(passOutcome(fail, { ok: true, clean: true })).toBe('again')
    expect(passOutcome(clean1, { ok: true, clean: false, smooth: false })).toBe('hard')
    expect(passOutcome(clean1, fail)).toBe('hard')
    expect(passOutcome(unclean1, { ok: true, clean: true })).toBe('hard')
    expect(passOutcome(clean1, { ok: true, clean: true })).toBe('good')
    expect(passOutcome(clean1, null)).toBe('good'); expect(passOutcome(unclean1, null)).toBe('hard')
  })
  it('событие хода: pass, а у прохода 2 — smooth и maxPause', () => {
    expect(ev('win', nice, 1, { ratio: 1, clean: true })).toMatchObject({ pass: 1, ok: true, clean: true }); expect(ev('win', nice, 1, { ratio: 1, clean: true }).smooth).toBeUndefined()
    expect(ev('win', nice, 2, passTwoRes(1, [0, 1500]))).toMatchObject({ pass: 2, ok: true, clean: false, smooth: false, maxPause: 1500 })
    expect(ev('fail', nice, 2, { ratio: 0.25 })).toMatchObject({ pass: 2, ok: false, smooth: false })
  })
  it('память слов: фраза «Скажи» — одна единица по двум проходам (again → промах, hard → зачёт нечисто, good → зачёт)', () => {
    const list = [
      ev('win', nice, 1, { ratio: 1, clean: true }), ev('win', nice, 2, passTwoRes(1, [0, 300])), // good
      ev('win', from, 1, { ratio: 1, clean: true }), ev('win', from, 2, passTwoRes(1, [0, 1500])), // hard
    ]
    expect(phraseUnits(list).map(u => [u.ok, u.unclean])).toEqual([[true, false], [true, true]])
    expect(phraseHits(list, 'nice')).toEqual({ hit: 1, miss: 0, unclean: 0 }); expect(phraseHits(list, 'where')).toEqual({ hit: 1, miss: 0, unclean: 1 })
    const failed = [ev('fail', nice, 1, { ratio: 0.25 }), ev('win', nice, 2, passTwoRes(1, [0, 100]))]
    expect(phraseHits(failed, 'nice')).toEqual({ hit: 0, miss: 1, unclean: 0 })
    const words = [{ text: 'nice', ...phraseHitsOf(list, 'nice') }, { text: 'where', ...phraseHitsOf(list, 'where') }, { text: 'meet', ...phraseHitsOf(failed, 'meet') }]
    const out = outcomesOf({ weak: [], words })
    expect(out.nice.outcome).toBe('good'); expect(out.where.outcome).toBe('hard'); expect(out.meet.outcome).toBe('again')
  })
  it('итог: «Фразы N/M» — по ходам (оба прохода); слабая фраза — проход 1 или 2 не чисто, у строки p2 «с паузами»', () => {
    const list = [ev('win', nice, 1, { ratio: 1, clean: true }), ev('win', nice, 2, passTwoRes(1, [0, 300])), ev('win', from, 1, { ratio: 1, clean: true }), ev('win', from, 2, passTwoRes(1, [0, 1500]))]
    expect(phraseCount(list)).toEqual({ ok: 4, total: 4 })
    const sum = phraseSummary(list)
    expect(sum.map(r => r.weak)).toEqual([false, true])
    expect(sum[1].p2).toEqual({ ok: true, clean: false, smooth: false, maxPause: 1500 }); expect(sum[1].r2).toEqual({ ok: true, clean: true, ratio: 1 })
  })
})

function phraseHitsOf(list, text) { const h = phraseHits(list, text); return { hit: h.hit, miss: h.miss, phraseHits: h.hit, phraseMisses: h.miss, phraseUnclean: h.unclean } }

describe('голос Пита на двух проходах', () => {
  const make = () => {
    const said = [], timers = []
    const cat = { busyLeft: () => 0, holdBusy: () => {} }
    const v = createPhraseVoice({ ctx: () => ({ sayLine: id => said.push(`line:${id}`), sayText: (t, op) => said.push(`${op?.ru ? 'ru' : 'en'}:${t}`), cat }), hasRu: () => true, log: () => {}, setTimer: fn => { timers.push(fn); return timers.length }, clearTimer: () => {} })
    const flush = () => { for (let i = 0; i < 50 && timers.length; i++) timers.shift()() }
    return { v, said, flush }
  }
  it('проход 1 засчитан — молча; перед проходом 2 — «теперь повтори фразу без остановок» и подпись', () => {
    const a = make(); a.v.react('win', { mode: 'say', pass: 1, target: nice, res: { ok: true } }); a.flush(); expect(a.said).toEqual([])
    const show = vi.fn(); a.v.pre({ mode: 'say', pass: 2, target: nice }, { show }); a.flush()
    expect(a.said).toEqual(['line:race_phrase_again']); expect(show).toHaveBeenCalledWith('теперь повтори фразу без остановок')
  })
  it('проход 2: чисто — «да, это оно»; с паузами — «хорошо, только без пауз»; не успел — фраза', () => {
    const a = make(); a.v.react('win', { mode: 'say', pass: 2, target: nice, res: { smooth: true } }); a.flush(); expect(a.said).toEqual(['line:race_phrase_yes'])
    const b = make(); b.v.react('win', { mode: 'say', pass: 2, target: nice, res: { smooth: false } }); b.flush(); expect(b.said).toEqual(['line:race_phrase_pauses'])
    const c = make(); c.v.react('fail', { mode: 'say', pass: 2, target: from }); c.flush(); expect(c.said).toEqual(['en:Where', 'en:are', 'en:you', 'en:from'])
  })
})
