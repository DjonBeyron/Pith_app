import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { demoPhrase, createDemoGate } from './racePhraseDemo.js'
import { HEAD_OVER } from './racePhraseDemoTurn.js'
import { DEMO_ENTER_Y, DEMO_RISE_Y, DEMO_SPEED_MIN, DEMO_SPEED_MAX } from './racePhraseDemoPace.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { WIDE_H } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Демо-ход «Скажи» на живой пилюле в сцене ленты (racePhraseScene.js → racePhraseDemoTurn.js): поддельные пул и часы (racePhraseSceneRig.js), таймеры скрипта — vi.useFakeTimers.
// Замечание владельца 2026-11-09: Пит начинает разбор, как только пилюля показалась; пилюля не останавливается, а к взлёту доходит до головы Пита (скорость демо-пилюли — racePhraseDemoPace.js)
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const turns = round2SayTurns(ph)
const NICE = { text: 'Nice to meet you', key: 'nice to meet you', spare: true } // четыре слова: race_demo_more и слово подряд
const step = (demo = demoPhrase(ph, turns)) => phraseStep('phrases2', turns, { round: 2, mode: 'say', voice: true, speed: SAY_SPEED, demo })

/** o.line(id) → мс озвученной реплики (0 — неозвучена: sayLine вернёт false); o.known — kit.lineMs знает длины заранее; o.word — мс голоса слова */
function setup(o = {}) {
  const s = setupScene(step(o.demo), { listen: createPhraseListener, log: o.log })
  const gate = o.gate ?? createDemoGate()
  const said = [], line = o.line ?? (() => 0)
  let busy = 0
  const kit = {
    claim: vi.fn(p => gate.claim(p)), end: vi.fn(why => gate.end(why)), busyLeft: () => Math.max(0, busy - s.clock.t), text: id => (line(id) ? '' : `T:${id}`),
    sayLine: vi.fn(id => { said.push(id); const ms = line(id); if (ms) busy = s.clock.t + ms; return ms > 0 }),
    sayText: vi.fn((w, op) => { said.push(`«${w}»`); op?.onSay?.(o.word ?? 400) }),
    ...(o.known ? { lineMs: id => line(id), wordMs: () => o.word ?? 400 } : {}), ...(o.hasWord ? { hasWord: o.hasWord } : {}),
  }
  const pre = s.fx.pre
  s.fx.pre = vi.fn(e => { if (e.rep.demo) e.demo?.(o.noKit ? null : kit); else pre(e) })
  const frame = () => { s.clock.t += 16; vi.advanceTimersByTime(16); s.run.tick(s.clock.t) }
  const go = ms => { const end = s.clock.t + ms; while (s.clock.t < end) frame() }
  const until = (n, cap = 6000) => { const end = s.clock.t + cap; while (said.length < n && s.clock.t < end) frame() } // до n-го высказывания Пита
  return { ...s, go, until, kit, said, gate }
}
const lines = log => log.mock.calls.map(c => c[0]).filter(l => l.startsWith('[phrase-demo]'))
const num = (l, re) => Number(l.match(re)[1].replace(',', '.'))
const riseY = log => num(lines(log).find(l => l.includes('взлёт')), /y (-?\d+) %/)
const lineAfter = (log, id) => num(lines(log).find(l => l.includes(`реплика ${id}`)), /через (\d+) мс после выезда/)

describe('демо-ход «Скажи» на живой пилюле', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('первым ходом: широкая пилюля «Скажи» с маской демо-фразы выезжает из-за края, Пит начинает сразу, как она показалась; реплики и слова по одному, кирпичики, заливка → взлёт у головы → «теперь ты» → первый ход', () => {
    const log = vi.fn(); const s = setup({ log, line: () => 1200, known: true })
    s.go(16)
    expect(s.kit.claim).toHaveBeenCalledWith({ text: 'See you later', key: 'see you later', spare: true })
    const p = s.pool.taken[0]
    expect(s.pool.taken).toHaveLength(1); expect(p.wide).toBe(true); expect(p.cap).toBe('See you later')
    expect(p.vals['data-mode']).toBe('say'); expect(p.attrs.has('data-demo')).toBe(true); expect(p.attrs.has('data-faded')).toBe(true)
    expect(p.speed).toBeGreaterThanOrEqual(DEMO_SPEED_MIN); expect(p.speed).toBeLessThanOrEqual(DEMO_SPEED_MAX); expect(p.speed).not.toBe(SAY_SPEED) // своя скорость — под длину разбора
    expect(s.pool.y(p.k)).toBeLessThan(-WIDE_H / 2); expect(s.pool.y(p.k)).toBeGreaterThan(DEMO_ENTER_Y - 1) // за краем, но вплотную к нему — выкатывается, а не появляется
    expect(lines(log)[0]).toMatch(/^\[phrase-demo\] пилюля выезжает из-за края, скорость ×0,\d\d \(оценка разбора \d+ мс, голова Пита y 82 %, центр пилюли у головы — 76 %\)$/)
    const st = s.run.api.state()
    expect(st.phase).toBe('demo'); expect(st.listening).toBe(false); expect(st.demo.mask.map(w => w.state)).toEqual(['full', 'hidden', 'hidden'])
    expect(s.fx.pre.mock.calls.filter(c => !c[0].rep.demo)).toHaveLength(0) // настоящий ход ещё не начался
    stubSay('see you later'); stubSay(turns[0].target.text)
    expect(s.fx.win).not.toHaveBeenCalled() // на демо-ходу голос ученика не в счёт
    s.go(700)
    expect(s.said).toEqual(['race_demo_1']) // пилюля показалась — Пит уже говорит, без тишины
    expect(lineAfter(log, 'race_demo_1')).toBeLessThanOrEqual(700)
    expect(lines(log).find(l => l.includes('реплика race_demo_1'))).toMatch(/реплика race_demo_1 \(1200 мс\) через \d+ мс после выезда, y -?\d %/)
    s.until(2) // реплика 1,2 с → See
    expect(s.said).toEqual(['race_demo_1', '«See»']); expect(s.run.api.state().demo.mask.map(w => w.state)).toEqual(['full', 'hidden', 'hidden'])
    s.until(4) // «затем второе» → you
    expect(s.said.slice(-2)).toEqual(['race_demo_2', '«you»']); expect(s.run.api.state().demo.mask.map(w => w.state)).toEqual(['full', 'full', 'hidden'])
    s.go(200); expect(p.fill).toBeCloseTo(2 / 3, 2)
    expect(lines(log)).toContain(`[phrase-demo] слово 2 «you» (400), заливка до границы 0,67, y ${Math.round(num(lines(log).find(l => l.startsWith('[phrase-demo] слово 2')), /y (\d+) %/))} %`) // граница слова (без DOM — доли 1/N)
    s.go(5000)
    expect(s.said).toEqual(['race_demo_1', '«See»', 'race_demo_2', '«you»', 'race_demo_3', '«later»', 'race_demo_go'])
    expect(p.rose).toBe(true); expect(p.attrs.has('data-lock')).toBe(true); expect(p.fills.at(-1)).toBeGreaterThan(0.99)
    expect(p.held).toBeUndefined() // пилюля не останавливалась
    expect(Math.abs(riseY(log) - DEMO_RISE_Y)).toBeLessThanOrEqual(3) // взлетела у головы Пита
    expect(s.kit.end).toHaveBeenCalledWith(''); expect(s.run.api.state().phase).not.toBe('demo'); expect(s.run.api.state().listening).toBe(true)
    expect(s.fx.pre.mock.calls.filter(c => !c[0].rep.demo)[0][0].rep).toMatchObject({ phraseKey: turns[0].target.key, pass: 1 })
    s.go(800); expect(s.pool.taken).toHaveLength(2); expect(s.pool.taken[1].cap).toBe(turns[0].target.text)
    s.run.stop()
  })
  const cases = [
    ['короткие озвученные реплики, длины известны', { line: () => 600, known: true }],
    ['длинные озвученные реплики, длины известны', { line: () => 2200, known: true, word: 700 }],
    ['реплики не озвучены (подпись 650 мс)', { line: () => 0, known: true }],
    ['длины реплик неизвестны заранее, реплики короткие — догоняем по ходу', { line: () => 500 }],
    ['длины реплик неизвестны заранее, реплики длинные — придерживаем по ходу', { line: () => 2000 }],
    ['четыре слова (race_demo_more, слово подряд), разные реплики', { demo: NICE, line: id => ({ race_demo_1: 1515, race_demo_2: 1280, race_demo_3: 1149, race_demo_more: 1489 })[id] ?? 1000, known: true, word: 500 }],
    ['четыре слова, неозвученные реплики, длины неизвестны', { demo: NICE, line: () => 0 }],
  ]
  for (const [name, o] of cases) {
    it(`${name}: первая реплика ≤ 700 мс после выезда, без остановки, взлёт у головы Пита (±3 %), скорость в пределах`, () => {
      const log = vi.fn(); const s = setup({ log, ...o })
      s.go(20000)
      const p = s.pool.taken[0]
      expect(lineAfter(log, 'race_demo_1')).toBeLessThanOrEqual(700)
      expect(p.rose).toBe(true); expect(p.held).toBeUndefined(); expect(lines(log).some(l => l.includes('у головы Пита:'))).toBe(false)
      expect(Math.abs(riseY(log) - DEMO_RISE_Y)).toBeLessThanOrEqual(3)
      for (const v of [p.speed, ...(p.speeds ?? [])]) { expect(v).toBeGreaterThanOrEqual(DEMO_SPEED_MIN); expect(v).toBeLessThanOrEqual(DEMO_SPEED_MAX) }
      expect(s.said.at(-1)).toBe('race_demo_go'); expect(s.kit.end).toHaveBeenCalledWith('')
      if (!o.known) expect(lines(log).some(l => /скорость ×0,\d\d → ×0,\d\d \((отстаём|опережаем) на \d+ мс\), y \d+ %/.test(l))).toBe(true) // оценка разошлась с разбором — поправка по ходу
      s.run.stop()
    })
  }
  it('разбор намного дольше пути даже на самой малой скорости: запас — пилюля мягко замирает у головы Пита (не въезжает в него), журнал «у головы Пита»', () => {
    const log = vi.fn(); const s = setup({ log, demo: NICE, line: () => 4000, known: true, word: 900 })
    s.go(30000)
    const p = s.pool.taken[0]
    expect(p.speed).toBe(DEMO_SPEED_MIN); expect(p.held).toBe(true); expect(p.rose).toBe(true)
    expect(lines(log).some(l => /^\[phrase-demo\] пилюля у головы Пита: y 7\d % — ждёт конца примера/.test(l))).toBe(true)
    expect(riseY(log)).toBeLessThanOrEqual(Math.round(DEMO_RISE_Y + HEAD_OVER + 1))
    s.run.stop()
  })
  it('ворота сказали «нет» (уже сыграно в этой игре) или директора нет — сразу первый ход, демо-пилюли нет; причина — в журнале [demo]', () => {
    const logs = [], gate = createDemoGate({ log: x => logs.push(x) }); gate.claim({ text: 'x' })
    const s = setup({ gate })
    s.go(400)
    expect(s.kit.claim).toHaveBeenCalledTimes(1); expect(s.run.api.state().phase).not.toBe('demo'); expect(s.said).toEqual([])
    expect(s.pool.taken.every(p => !p.attrs.has('data-demo'))).toBe(true)
    s.run.stop()
    expect(logs.at(-1)).toMatch(/^\[demo\] демо пропущено: уже было в этой игре/)
    const nl = [], n = setup({ noKit: true, log: x => nl.push(x) }); n.go(400); expect(n.run.api.state().phase).not.toBe('demo'); n.run.stop()
    expect(nl).toContain('[demo] демо пропущено: директор не дал голос Пита (не гонка)')
  })
  it('слово демо без озвучки: не звучит, журнал «[demo] слово «…» без озвучки», кирпичик всё равно открывается и демо доходит до конца', () => {
    const log = vi.fn(); const s = setup({ log, hasWord: w => w !== 'later' })
    s.go(12000)
    expect(s.said).toEqual(['race_demo_1', '«See»', 'race_demo_2', '«you»', 'race_demo_3', 'race_demo_go'])
    expect(log.mock.calls.map(c => c[0])).toContain('[demo] слово «later» без озвучки — дальше по таймеру')
    expect(s.run.api.state().phase).not.toBe('demo'); expect(s.kit.end).toHaveBeenCalledWith(''); s.run.stop()
  })
  it('стоп посреди демо (пауза, смена стадии): скрипт обрывается, ворота — «прервано», дальше Пит молчит', () => {
    const s = setup()
    s.go(2000)
    s.run.stop()
    expect(s.kit.end).toHaveBeenCalledWith(expect.stringMatching(/сцена снята/)); expect(s.gate.active()).toBe(false)
    const n = s.said.length; expect(n).toBeGreaterThan(0)
    vi.advanceTimersByTime(20000)
    expect(s.said.length).toBe(n)
    expect(s.gate.claim({ text: 'x' })).toBe(false) // после «Продолжить» демо не повторяется
  })
})
