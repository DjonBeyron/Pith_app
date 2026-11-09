import { describe, it, expect, vi } from 'vitest'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay, stubDraft } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'

// Два прохода «Скажи» в сцене ленты: проход 1 по словам → взлёт → проход 2 той же фразой открытым текстом; «без остановок» — по моментам услышанных слов (часы сцены)
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
/** До выезда пилюли хода n (номер в пуле) */
const untilPill = (s, n) => { for (let i = 0; i < 2000 && s.pool.taken.length <= n; i++) s.go(16); return s.pool.taken[n] }

describe('«Скажи»: два прохода фразы', () => {
  it('проход 1 по словам с паузами по 1 с — зачёт и взлёт; сразу та же фраза вторым ходом: data-pass="2", весь текст открыт, не бледная; сказать подряд — «чисто»', () => {
    const log = vi.fn(); const s = setupScene(say(), { listen: createPhraseListener, log })
    const p1 = untilPill(s, 0)
    expect(p1.attrs.has('data-pass')).toBe(false); expect(p1.attrs.has('data-faded')).toBe(true)
    expect(s.run.api.state()).toMatchObject({ pass: 1, listening: true })
    stubDraft('nice'); s.go(1000); stubDraft('nice to'); s.go(1000); stubDraft('nice to meet'); s.go(1000); stubSay('nice to meet you'); s.go(700) // взлёт — когда заливка доехала (racePhraseFill)
    expect(s.fx.win).toHaveBeenCalledTimes(1)
    expect(s.fx.win.mock.calls[0][2]).toMatchObject({ pass: 1, res: { ok: true, ratio: 1, clean: true } }) // по словам в проходе 1 — можно
    expect(p1.rose).toBe(true)
    expect(log.mock.calls.map(c => c[0]).find(l => l.startsWith('[phrases]') && l.includes('итог'))).toMatch(/ход 1\/6, проход 1\/2: цель «Nice to meet you» итог верно, слова 100 %, чисто$/)
    const p2 = untilPill(s, 1)
    expect(s.fx.pre.mock.calls.at(-1)[0].rep).toMatchObject({ pass: 2, phraseKey: 'nice to meet you' })
    expect(p2.cap).toBe('Nice to meet you'); expect(p2.vals['data-pass']).toBe('2'); expect(p2.attrs.has('data-faded')).toBe(false)
    expect(s.run.api.state().mask.map(w => w.state)).toEqual(['full', 'full', 'full', 'full'])
    expect(s.run.api.state()).toMatchObject({ pass: 2, listening: true })
    s.go(800); stubSay('nice to meet you'); s.go(700)
    expect(s.fx.win).toHaveBeenCalledTimes(2)
    expect(s.fx.win.mock.calls[1][2]).toMatchObject({ pass: 2, res: { ok: true, ratio: 1, clean: true, smooth: true, maxPause: 0 } })
    expect(log.mock.calls.at(-1)[0]).toMatch(/ход 2\/6, проход 2\/2: цель «Nice to meet you» итог верно, слова 100 %, чисто, макс\. пауза 0 мс$/)
    s.run.stop()
  })
  it('проход 2 с паузой 1,5 с — засчитан, но «с паузами» (нечисто), макс. пауза в журнале; паузы ≤ 0,9 с — чисто', () => {
    const log = vi.fn(); const s = setupScene(say(), { listen: createPhraseListener, log })
    untilPill(s, 0); stubSay('nice to meet you')
    untilPill(s, 1); s.go(500)
    stubSay('nice to'); s.go(1500); stubSay('nice to meet you'); s.go(700)
    const r = s.fx.win.mock.calls[1][2].res
    expect(r).toMatchObject({ ok: true, clean: false, smooth: false }); expect(r.maxPause).toBeGreaterThanOrEqual(1490); expect(r.maxPause).toBeLessThanOrEqual(1520)
    expect(log.mock.calls.at(-1)[0]).toMatch(/проход 2\/2: .* итог верно, слова 100 %, с паузами, макс\. пауза 1\d{3} мс$/)
    untilPill(s, 2); stubSay('where are you from') // следующая фраза, проход 1
    untilPill(s, 3); s.go(500)
    stubSay('where are'); s.go(800); stubSay('where are you from'); s.go(700)
    expect(s.fx.win.mock.calls[3][2].res).toMatchObject({ smooth: true, clean: true })
    s.run.stop()
  })
  it('слушатель знает проход: setPhrases(…, { wordByWord }) — проход 1 true, проход 2 false (ранние итоги, racePhraseEarlyFinal.js)', () => {
    const seen = []
    const listen = o => { const l = createPhraseListener(o), set = l.setPhrases; l.setPhrases = (n, opts) => { seen.push(opts?.wordByWord); set(n, opts) }; return l }
    const s = setupScene(say(), { listen })
    untilPill(s, 0); stubSay('nice to meet you'); untilPill(s, 1)
    expect(seen).toEqual([true, false])
    s.run.stop()
  })
  it('проход 1, слова не по порядку (журнал владельца, ход 3/6 «Where are you from»): линия стоит после «where», пока не сказано «are»', () => {
    const s = setupScene(say(), { listen: createPhraseListener })
    untilPill(s, 0); stubSay('nice to meet you'); untilPill(s, 1); s.go(500); stubSay('nice to meet you')
    const p = untilPill(s, 2); s.go(300)
    stubDraft('where'); s.go(600); const one = p.fill; expect(one).toBeGreaterThan(0.2); expect(one).toBeLessThan(0.3)
    stubDraft('where you'); s.go(300); stubDraft('where from'); s.go(600); expect(p.fill).toBeCloseTo(one, 6) // «you», «from» вперёд — линия не двигается
    expect(s.run.api.state().mask.map(w => w.state)).toEqual(['full', 'peek', 'full', 'full']) // сказанные вперёд — белые (запомнены); подсказка — у пропущенного «are», там же линия
    stubDraft('are'); s.go(600); expect(p.fill).toBeGreaterThan(0.9)
    s.run.stop()
  })
  it('проход 1 упущен — проход 2 всё равно идёт (это и есть тренировка)', () => {
    const s = setupScene(say(), { listen: createPhraseListener })
    untilPill(s, 0)
    s.go(18000)
    expect(s.fx.fail).toHaveBeenCalledTimes(1); expect(s.fx.fail.mock.calls[0][0].rep.pass).toBe(1)
    const p2 = untilPill(s, 1)
    expect(p2.vals['data-pass']).toBe('2'); expect(s.run.api.state().pass).toBe(2)
    s.run.stop()
  })
})
