import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { demoPhrase, createDemoGate } from './racePhraseDemo.js'
import { DEMO_Y } from './racePhraseDemoTurn.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { LISTEN_Y_MIN } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Демо-ход «Скажи» на живой пилюле в сцене ленты (racePhraseScene.js → racePhraseDemoTurn.js): поддельные пул и часы (racePhraseSceneRig.js), таймеры скрипта — vi.useFakeTimers
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const turns = round2SayTurns(ph)
const step = () => phraseStep('phrases2', turns, { round: 2, mode: 'say', voice: true, speed: SAY_SPEED, demo: demoPhrase(ph, turns) })

function setup(o = {}) {
  const s = setupScene(step(), { listen: createPhraseListener, log: o.log })
  const gate = o.gate ?? createDemoGate()
  const said = []
  const kit = { claim: vi.fn(p => gate.claim(p)), end: vi.fn(why => gate.end(why)), sayLine: vi.fn(id => { said.push(id); return false }), sayText: vi.fn((w, op) => { said.push(`«${w}»`); op?.onSay?.(400) }), busyLeft: () => 0, text: id => `T:${id}`, ...(o.hasWord ? { hasWord: o.hasWord } : {}) }
  const pre = s.fx.pre
  s.fx.pre = vi.fn(e => { if (e.rep.demo) e.demo?.(o.noKit ? null : kit); else pre(e) })
  const go = ms => { const end = s.clock.t + ms; while (s.clock.t < end) { s.clock.t += 16; vi.advanceTimersByTime(16); s.run.tick(s.clock.t) } }
  return { ...s, go, kit, said, gate }
}

describe('демо-ход «Скажи» на живой пилюле', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('первым ходом: широкая пилюля «Скажи» с маской демо-фразы на скорости круга, слушатель не слушает; Пит: реплики и слова по одному, кирпичики открываются, заливка растёт, 100 % → взлёт → «теперь ты» → первый настоящий ход', () => {
    const log = vi.fn(); const s = setup({ log })
    s.go(32)
    expect(s.kit.claim).toHaveBeenCalledWith({ text: 'See you later', key: 'see you later', spare: true })
    const p = s.pool.taken[0]
    expect(s.pool.taken).toHaveLength(1); expect(p.wide).toBe(true); expect(p.speed).toBe(SAY_SPEED); expect(p.cap).toBe('See you later')
    expect(p.vals['data-mode']).toBe('say'); expect(p.attrs.has('data-demo')).toBe(true); expect(p.attrs.has('data-faded')).toBe(true)
    expect(s.pool.y(p.k)).toBeGreaterThan(DEMO_Y - 1); expect(s.pool.y(p.k)).toBeLessThan(DEMO_Y + 2) // выезжает из-под верхнего затемнения
    const st = s.run.api.state()
    expect(st.phase).toBe('demo'); expect(st.listening).toBe(false); expect(st.demo.mask.map(w => w.state)).toEqual(['full', 'hidden', 'hidden'])
    expect(s.fx.pre.mock.calls.filter(c => !c[0].rep.demo)).toHaveLength(0) // настоящий ход ещё не начался
    stubSay('see you later'); stubSay(turns[0].target.text)
    expect(s.fx.win).not.toHaveBeenCalled() // на демо-ходу голос ученика не в счёт
    s.go(1000) // «главное начать, смотри» (подпись 650 мс) → See
    expect(s.said).toEqual(['race_demo_1', '«See»']); expect(s.run.api.state().demo.mask.map(w => w.state)).toEqual(['full', 'hidden', 'hidden'])
    s.go(1300) // «затем второе» → you
    expect(s.said.slice(-2)).toEqual(['race_demo_2', '«you»']); expect(s.run.api.state().demo.mask.map(w => w.state)).toEqual(['full', 'full', 'hidden'])
    expect(p.fill).toBeCloseTo(2 / 3, 2)
    expect(log.mock.calls.map(c => c[0])).toContain('[phrase-demo] слово 2 «you», заливка до границы 0,67') // как в игре: граница слова (без DOM — доли 1/N, racePhraseFill.edgeAt)
    s.go(1000) // «потом третье» → later
    expect(s.said.slice(-2)).toEqual(['race_demo_3', '«later»'])
    s.go(1100) // 100 % и взлёт
    expect(p.rose).toBe(true); expect(p.attrs.has('data-lock')).toBe(true); expect(p.fills.at(-1)).toBeGreaterThan(0.99)
    const yRise = Number(log.mock.calls.map(c => c[0]).find(l => l.includes('взлёт')).match(/y (\d+) %/)[1])
    expect(yRise).toBeGreaterThan(LISTEN_Y_MIN); expect(yRise).toBeLessThan(65) // уложилась: взлетела в зоне чтения
    s.go(1200)
    expect(s.said.at(-1)).toBe('race_demo_go'); expect(s.kit.end).toHaveBeenCalledWith('')
    expect(s.run.api.state().phase).not.toBe('demo'); expect(s.run.api.state().listening).toBe(true)
    expect(s.fx.pre.mock.calls.filter(c => !c[0].rep.demo)[0][0].rep).toMatchObject({ phraseKey: turns[0].target.key, pass: 1 })
    s.go(800); expect(s.pool.taken).toHaveLength(2); expect(s.pool.taken[1].cap).toBe(turns[0].target.text)
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
    s.go(32); s.go(3300)
    expect(s.said).toEqual(['race_demo_1', '«See»', 'race_demo_2', '«you»', 'race_demo_3'])
    expect(log.mock.calls.map(c => c[0])).toContain('[demo] слово «later» без озвучки — дальше по таймеру')
    s.go(3000); expect(s.kit.end).toHaveBeenCalledWith(''); s.run.stop()
  })
  it('стоп посреди демо (пауза, смена стадии): скрипт обрывается, ворота — «прервано», дальше Пит молчит', () => {
    const s = setup()
    s.go(1500)
    s.run.stop()
    expect(s.kit.end).toHaveBeenCalledWith(expect.stringMatching(/сцена снята/)); expect(s.gate.active()).toBe(false)
    const n = s.said.length
    vi.advanceTimersByTime(20000)
    expect(s.said.length).toBe(n)
    expect(s.gate.claim({ text: 'x' })).toBe(false) // после «Продолжить» демо не повторяется
  })
})
