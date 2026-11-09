import { describe, it, expect, vi } from 'vitest'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay, stubDraft, stubLevel } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { createGlide, GLIDE_GAP_MS, GLIDE_MIN_MS } from './racePhraseGlide.js'
import { edgeVerdict, LAST_WORD_GRACE_MS, LAST_WORD_CAP } from './racePhraseFill.js'

// Вид хода «Скажи» по проходам (racePhraseSayView.js): заливка только по распознанным словам; проход 2 — текст открыт, заливка одним движением (racePhraseGlide.js); проход 1 — подсказка
// только после сказанного слова (racePhrasePeek.js, порядок — racePhrasePeek.test.js);
// продление хода у края (racePhraseFill.edgeVerdict, pool.hold)
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
const untilPill = (s, n) => { for (let i = 0; i < 2000 && s.pool.taken.length <= n; i++) s.go(16); return s.pool.taken[n] }
/** Голос ms мс: уровень 0,05 каждый кадр */
const speak = (s, ms) => { for (let t = 0; t < ms; t += 16) { stubLevel(0.05); s.go(16) } }

describe('заливка прохода 2 по словам (чистая)', () => {
  it('без слов — 0 (шума она не знает); первое слово — ровно граница; слова подряд — ведёт к следующей границе с постоянной скоростью и не дальше неё; слово не пришло — стоит; итог — 100 %', () => {
    const lines = [], g = createGlide({ n: 4, log: x => lines.push(x) })
    expect(g.goal({ t: 0 })).toBe(0); expect(g.goal({ t: 5000 })).toBe(0)
    g.word(0, 1000); expect(g.goal({ t: 1000 })).toBe(0.25); expect(g.goal({ t: 1300 })).toBe(0.25) // одно слово — интервала нет, без ведения
    expect(lines).toEqual(['[fill] режим по словам: слово 1 → граница 0,25'])
    g.word(1, 1300); expect(g.goal({ t: 1300 })).toBe(0.5) // интервал 300 мс ≤ GLIDE_GAP_MS — ведём к границе 3
    expect(lines.at(-1)).toBe('[fill] режим по словам: слово 2 → граница 0,50, веду к границе слова 3 за 300 мс')
    expect(g.goal({ t: 1450 })).toBeCloseTo(0.625, 3); expect(g.goal({ t: 1600 })).toBe(0.75)
    expect(lines.at(-1)).toBe('[fill] режим по словам: слово 3 не пришло — линия стоит на 0,75')
    expect(g.goal({ t: 3000 })).toBe(0.75) // не дальше границы следующего слова, пока его нет
    g.word(2, 3000); expect(g.goal({ t: 3000 })).toBe(0.75); expect(g.goal({ t: 3500 })).toBe(0.75) // средний интервал вырос (1000 мс) — без ведения
    g.word(3, 3100); expect(g.goal({ t: 3100 })).toBe(LAST_WORD_CAP); expect(lines.at(-1)).toBe('[fill] режим по словам: слово 4 → граница 0,97') // последнее слово без итога — у края, не 100 %
    expect(g.goal({ t: 0, done: true })).toBe(1); expect(GLIDE_GAP_MS).toBe(400)
  })
  it('слова пачкой — ведение не быстрее GLIDE_MIN_MS; по границам слов на пилюле (edges)', () => {
    const g = createGlide({ n: 4 }), edges = [0.2, 0.5, 0.8, 1]
    g.word(0, 0); g.word(1, 0); expect(g.goal({ t: 0, edges })).toBe(0.5)
    expect(g.goal({ t: GLIDE_MIN_MS / 2, edges })).toBeCloseTo(0.65, 3); expect(g.goal({ t: GLIDE_MIN_MS, edges })).toBe(0.8)
    const h = createGlide({ n: 4 }) // ведение к границе последнего слова — тоже не дальше LAST_WORD_CAP
    h.word(0, 0); h.word(1, 0); h.word(2, 0); expect(h.goal({ t: GLIDE_MIN_MS * 2, edges })).toBe(LAST_WORD_CAP); expect(h.goal({ t: 0, done: true })).toBe(1)
  })
})

describe('сцена: заливка только по словам, проход 1 с подсказкой', () => {
  it('проход 2: текст открыт всё время; шум (высокий уровень без слов) линию не двигает; слова подряд — одним движением без ступенек; итог — 100 %', () => {
    const log = vi.fn(); const s = setupScene(say(), { listen: createPhraseListener, log })
    untilPill(s, 0); stubSay('nice to meet you')
    const p = untilPill(s, 1); s.go(300)
    const open = () => s.run.api.state().mask.map(w => w.state).join(' ')
    expect(s.run.api.state().pass).toBe(2); expect(open()).toBe('full full full full')
    speak(s, 1500); expect(p.fill).toBe(0) // раньше «под звук» — линия росла от шума
    stubDraft('nice'); s.go(250); stubDraft('nice to'); expect(open()).toBe('full full full full')
    for (let i = 0; i < 12; i++) s.go(16)
    const steps = p.fills.slice(-10).map((v, i, l) => (i ? v - l[i - 1] : 0)).slice(1)
    expect(Math.min(...steps)).toBeGreaterThan(0) // идёт к границе слова 3, не стоит на границе слова 2
    s.go(600); expect(p.fill).toBeCloseTo(0.75, 2); s.go(1000); expect(p.fill).toBeCloseTo(0.75, 2) // слово 3 не пришло — стоит на его границе
    expect(log.mock.calls.some(c => /^\[fill\] режим по словам: слово 2 → граница 0,50, веду к границе слова 3 за 250 мс$/.test(c[0]))).toBe(true)
    stubSay('nice to meet you'); s.go(700)
    expect(s.fx.win).toHaveBeenCalledTimes(2); expect(p.fill).toBe(1)
    s.run.stop()
  })
  it('проход 1: заливка по словам (голос её не двигает), до первого слова подсказки нет', () => {
    const s = setupScene(say(), { listen: createPhraseListener })
    const p = untilPill(s, 0)
    expect(s.run.api.state().mask.map(w => w.state)).toEqual(['full', 'hidden', 'hidden', 'hidden'])
    s.go(300); speak(s, 500); expect(p.fill).toBe(0); expect(s.run.api.state().mask.map(w => w.state)).toEqual(['full', 'hidden', 'hidden', 'hidden'])
    stubDraft('nice meet'); expect(s.run.api.state().mask.map(w => w.state)).toEqual(['full', 'hidden', 'full', 'peek']) // перепрыгнул — подсказка сразу за самым дальним сказанным
    s.run.stop()
  })
})

describe('продление хода у края', () => {
  it('edgeVerdict: ≥ 75 % слов — продлить (или итог по черновику, если пул не держит), идёт — ждать, кончилось — итог по черновику; меньше — не успел', () => {
    expect(edgeVerdict({ t: 0, lit: 3, n: 4, canHold: true })).toBe('hold')
    expect(edgeVerdict({ t: 0, lit: 3, n: 4, canHold: false })).toBe('draft')
    expect(edgeVerdict({ t: 0, lit: 2, n: 4, canHold: true })).toBe('fail')
    expect(edgeVerdict({ grace: 100, t: 100 + LAST_WORD_GRACE_MS - 1, lit: 3, n: 4, canHold: true })).toBe('wait')
    expect(edgeVerdict({ grace: 100, t: 100 + LAST_WORD_GRACE_MS, lit: 3, n: 4, canHold: true })).toBe('draft')
  })
  const toEdge = s => { const p = s.pool.taken[0]; for (let i = 0; i < 3000 && !p.held && !s.fx.fail.mock.calls.length; i++) s.go(16); return p }
  it('черновик 3 из 4, пилюля у края — замирает на 1,5 с; последнее слово пришло — зачёт «чисто»', () => {
    const log = vi.fn(); const s = setupScene(say(), { listen: createPhraseListener, log })
    untilPill(s, 0); s.go(500); stubDraft('nice to meet')
    const p = toEdge(s)
    expect(p.held).toBe(true); expect(s.fx.fail).not.toHaveBeenCalled()
    expect(log.mock.calls.map(c => c[0]).find(l => l.includes('продлён'))).toMatch(/^\[phrases\] круг 2 «Скажи» \(голос\), ход 1\/6, проход 1\/2: пилюля у края без итога — ход продлён на 1500 мс \(черновик 75 %\)$/)
    const y = s.pool.y(p.k); s.go(1000); expect(s.pool.y(p.k)).toBe(y) // держится у нижней границы
    stubSay('nice to meet you'); s.go(600)
    expect(s.fx.win).toHaveBeenCalledTimes(1); expect(s.fx.win.mock.calls[0][2].res).toMatchObject({ ok: true, ratio: 1, clean: true })
    s.run.stop()
  })
  it('за 1,5 с итога нет — зачёт «нечисто» по черновику, а не «не успел»', () => {
    const log = vi.fn(); const s = setupScene(say(), { listen: createPhraseListener, log })
    untilPill(s, 0); s.go(500); stubDraft('nice to meet')
    toEdge(s); s.go(LAST_WORD_GRACE_MS + 600)
    expect(s.fx.fail).not.toHaveBeenCalled(); expect(s.fx.win).toHaveBeenCalledTimes(1)
    expect(s.fx.win.mock.calls[0][2].res).toMatchObject({ ok: true, ratio: 0.75, clean: false })
    expect(log.mock.calls.some(c => /пилюля у края без итога — итог по черновику 75 %, нечисто$/.test(c[0]))).toBe(true)
    s.run.stop()
  })
})
