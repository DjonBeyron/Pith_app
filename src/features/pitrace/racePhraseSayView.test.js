import { describe, it, expect, vi } from 'vitest'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay, stubDraft, stubLevel } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { createVoiceFill, voiceFullMs, VOICE_HOLD_MS, VOICE_CAP } from './racePhraseVoiceFill.js'
import { createPeek, PEEK_MS } from './racePhrasePeek.js'
import { edgeVerdict, LAST_WORD_GRACE_MS } from './racePhraseFill.js'

// Вид хода «Скажи» по проходам (racePhraseSayView.js): проход 2 — текст открыт, заливка «под звук» (racePhraseVoiceFill.js) с якорями; проход 1 — подсказка следующего слова (racePhrasePeek.js);
// продление хода у края (racePhraseFill.edgeVerdict, pool.hold)
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
const untilPill = (s, n) => { for (let i = 0; i < 2000 && s.pool.taken.length <= n; i++) s.go(16); return s.pool.taken[n] }
/** Голос ms мс: уровень 0,05 каждый кадр */
const speak = (s, ms) => { for (let t = 0; t < ms; t += 16) { stubLevel(0.05); s.go(16) } }

describe('заливка «под звук» (чистая)', () => {
  it('растёт непрерывно, пока голос, со скоростью под длину фразы; пауза — стоит; якорь слова — не ниже его границы; без итога — не дальше 1,5 слова за якорем и не выше 0,97; итог — 100 %', () => {
    const lines = [], f = createVoiceFill({ n: 4, log: x => lines.push(x) })
    expect(voiceFullMs(4)).toBe(2100)
    let t = 0, v = 0
    for (; t < 500; t += 10) { f.level(0.05, false, t); v = f.goal({ t, dt: 10 }) }
    expect(v).toBeCloseTo(500 / 2100, 2)
    expect(lines[0]).toBe('[fill] режим под звук: голос да, цель 0,00, экран 0,00')
    for (; t < 1500; t += 10) v = f.goal({ t, dt: 10 }) // тишина
    expect(v).toBe(0.375); expect((500 + VOICE_HOLD_MS) / 2100).toBeGreaterThan(0.375) // голос держится VOICE_HOLD_MS после последнего куска (тут упёрся в 1,5 слова без якоря), потом линия стоит
    expect(lines.at(-1)).toMatch(/^\[fill\] режим под звук: голос нет, цель 0,38/)
    f.level(0.05, true, t); expect(f.voice(t)).toBe(false) // говорит Пит — не голос ученика
    f.level(0.001, false, t); expect(f.voice(t)).toBe(false) // тише затвора — тишина
    f.word(1); v = f.goal({ t, dt: 10, shown: 0.3 }); expect(v).toBe(0.5) // якорь: слово 2 сказано — граница 2/4
    expect(lines.at(-1)).toBe('[fill] режим под звук: голос нет, цель 0,50, экран 0,30, якорь слова 2 → граница 0,50')
    for (let i = 0; i < 400; i++, t += 10) { f.level(0.05, false, t); v = f.goal({ t, dt: 10 }) }
    expect(v).toBeCloseTo(0.875, 3) // шум без слов: не дальше 1,5 слова за якорем
    f.word(3); expect(f.goal({ t, dt: 10 })).toBe(1); expect(VOICE_CAP).toBe(0.97)
    expect(createVoiceFill({ n: 2 }).goal({ t: 0, dt: 16, done: true })).toBe(1)
  })
  it('по границам слов на пилюле (edges)', () => {
    const f = createVoiceFill({ n: 3 })
    f.word(0); expect(f.goal({ t: 0, dt: 16, edges: [0.37, 0.7, 1] })).toBe(0.37)
  })
})

describe('подсказка следующего слова (чистая)', () => {
  it('начинается с голоса или слова: следующее спрятанное — peek, --peek 0 → 100 % за PEEK_MS; сказано — подсказка переходит дальше', () => {
    const sets = [], pk = []
    const mask = { set: (h, all, p) => sets.push(p), peek: v => pk.push(Math.round(v)) }
    const p = createPeek({ mask, text: 'Nice to meet you' })
    expect(p.index()).toBe(-1); p.frame(100); expect(pk).toEqual([])
    expect(p.start(new Map(), 1000)).toBe(1)
    p.frame(1000 + PEEK_MS / 2); p.frame(1000 + PEEK_MS * 2); expect(pk).toEqual([50, 200]) // maskView.peek обрезает до 100
    expect(p.start(new Map([[0, true], [1, false]]), 2000)).toBe(2); p.frame(2000); expect(pk.at(-1)).toBe(0)
    expect(p.start(new Map([[0, true], [1, true], [2, true], [3, false]]), 3000)).toBe(-1)
    expect(sets).toEqual([1, 2, -1])
  })
})

describe('сцена: проход 2 под звук, проход 1 с подсказкой', () => {
  it('проход 2: текст открыт всё время (черновые слова маску не закрывают), заливка растёт под голос непрерывно, в паузе стоит, якоря — границы слов', () => {
    const log = vi.fn(); const s = setupScene(say(), { listen: createPhraseListener, log })
    untilPill(s, 0); stubSay('nice to meet you')
    const p = untilPill(s, 1); s.go(300)
    const open = () => s.run.api.state().mask.map(w => w.state).join(' ')
    expect(s.run.api.state().pass).toBe(2); expect(open()).toBe('full full full full')
    speak(s, 480); const a = p.fill
    expect(a).toBeGreaterThan(0.15); expect(a).toBeLessThan(0.3)
    const steps = p.fills.slice(-25).map((v, i, l) => (i ? v - l[i - 1] : 0)).slice(1)
    expect(Math.max(...steps)).toBeLessThan(0.02) // без ступенек: ровный подъём кадр за кадром
    s.go(1000); expect(p.fill).toBeLessThan(a + 0.16); const b = p.fill; s.go(500); expect(p.fill).toBe(b) // пауза — стоит, не откатывается
    stubDraft('nice to'); expect(open()).toBe('full full full full') // раньше: неуслышанные снова прятались
    s.go(400); expect(p.fill).toBeCloseTo(0.5, 2)
    speak(s, 300); expect(p.fill).toBeGreaterThan(0.6)
    expect(log.mock.calls.some(c => /^\[fill\] режим под звук: голос да/.test(c[0]))).toBe(true)
    expect(log.mock.calls.some(c => /якорь слова 2 → граница 0,50/.test(c[0]))).toBe(true)
    stubSay('nice to meet you'); s.go(700)
    expect(s.fx.win).toHaveBeenCalledTimes(2); expect(p.fill).toBe(1)
    s.run.stop()
  })
  it('проход 1: заливка по словам (голос её не двигает), подсказка — у следующего слова', () => {
    const s = setupScene(say(), { listen: createPhraseListener })
    const p = untilPill(s, 0); s.go(300)
    speak(s, 500); expect(p.fill).toBe(0)
    expect(s.run.api.state().mask.map(w => w.state)).toEqual(['full', 'peek', 'hidden', 'hidden'])
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
