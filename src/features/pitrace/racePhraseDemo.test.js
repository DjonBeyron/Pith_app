import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { demoPhrase, runPhraseDemo, createDemoGate, demoSeen, demoAllowed, markDemoShown, heardUpTo, DEMO_KEY, DEMO_LINE, DEMO_LINE_GAP_MS, DEMO_WORD_GAP_MS, DEMO_END_MS, DEMO_MAX_SHOWS } from './racePhraseDemo.js'
import { mountDemo } from './racePhraseDemoView.js'
import { createKit } from './raceStageKit.js'
import { phraseStages } from './raceStagesPhrases.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { round2SayTurns } from './racePhraseTurns.js'

const P = (text, own = true) => ({ text, key: text.toLowerCase(), own })
// Крошечный DOM без jsdom: плашка, узлы с атрибутами, style, remove / isConnected
function fakeDom() {
  const doc = {}
  const node = tag => {
    const n = { tag, children: [], attrs: {}, style: {}, className: '', textContent: '', parentElement: null, ownerDocument: doc,
      setAttribute(k, v) { n.attrs[k] = String(v) }, getAttribute: k => n.attrs[k] ?? null, hasAttribute: k => k in n.attrs,
      toggleAttribute(k, on) { if (on) n.attrs[k] = ''; else delete n.attrs[k] },
      appendChild(c) { c.parentElement = n; n.children.push(c); return c },
      remove() { const p = n.parentElement; if (p) p.children = p.children.filter(c => c !== n); n.parentElement = null },
      get isConnected() { let p = n; while (p.parentElement) p = p.parentElement; return p === dom.plate },
    }
    return n
  }
  doc.createElement = node; doc.createTextNode = t => ({ tag: '#text', textContent: t })
  const dom = { plate: node('div'), live: true }
  dom.plate.className = 'wlTurn'
  dom.find = () => (dom.live ? dom.plate : null)
  dom.all = (n = dom.plate, out = []) => { for (const c of n.children ?? []) { out.push(c); dom.all(c, out) } return out }
  dom.q = cls => dom.all().find(c => c.className === cls) ?? null
  return dom
}
const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) } }

describe('демо «Скажи»: какая фраза', () => {
  it('запасная фраза (own: false), не цель круга; из нескольких — самая короткая', () => {
    const list = [P('Nice to meet you'), P('Where are you from'), P('I will see you tomorrow morning', false), P('See you later', false)]
    expect(demoPhrase(list, round2SayTurns(list))).toEqual({ text: 'See you later', key: 'see you later', spare: true })
  })
  it('запасная, которая всё же цель круга, не берётся; запасной нет — первая фраза круга', () => {
    const list = [P('Nice to meet you'), P('Where are you from')]
    expect(demoPhrase(list, round2SayTurns(list))).toEqual({ text: 'Nice to meet you', key: 'nice to meet you', spare: false })
    const odd = [P('Nice to meet you'), { ...P('See you later', false) }]
    const turns = [...round2SayTurns(odd), { target: odd[1] }]
    expect(demoPhrase(odd, turns).text).toBe('Nice to meet you')
  })
  it('запасная длиннее четырёх слов — первая фраза круга, если она короче; пусто — null', () => {
    const list = [P('Nice to meet you'), P('I will see you tomorrow morning', false)]
    expect(demoPhrase(list, round2SayTurns(list)).text).toBe('Nice to meet you')
    expect(demoPhrase([], [])).toBeNull()
  })
  it('фикстура: дежурная «See you later»', () => {
    expect(demoPhrase(PHRASE_FIXTURE, round2SayTurns(PHRASE_FIXTURE)).text).toBe('See you later')
  })
})

describe('демо «Скажи»: стадии', () => {
  it('голосом у плашки круга 2 есть demo, у «Пальцами» нет', () => {
    const plan = { seed: 7, chunks: ['a'], words: [], phrases: PHRASE_FIXTURE }
    const act = { id: 'phrases', title: 'Фразы', task: '', line: 'race_phrases', phrases: PHRASE_FIXTURE }
    const v = createKit({ plan }); phraseStages(v, act)
    expect(v.stages.find(s => s.sid === 'phrases2-ann').demo).toEqual({ text: 'See you later', key: 'see you later', spare: true })
    const t = createKit({ plan, tap: true }); phraseStages(t, act)
    expect(t.stages.find(s => s.sid === 'phrases2-ann').demo).toBeUndefined()
  })
})

describe('демо «Скажи»: последовательность', () => {
  let dom
  beforeEach(() => { vi.useFakeTimers(); dom = fakeDom() })
  afterEach(() => vi.useRealTimers())
  const mount = o => mountDemo({ ...o, find: dom.find })
  const setup = (o = {}) => {
    const log = []
    let busy = 0
    const sayLine = vi.fn(id => { log.push(`line:${id}`); busy = 1000; setTimeout(() => { busy = 0 }, 1000); return true })
    const sayText = vi.fn((w, opts) => { log.push(`word:${w}`); expect(opts).toMatchObject({ hold: true, tight: true }); opts.onSay?.(400) })
    const onDone = vi.fn(() => log.push('done'))
    const run = runPhraseDemo({ phrase: { text: 'See you later' }, caption: 'смотри', sayLine, sayText, busyLeft: () => busy, mount, onDone, onStep: (n, i) => n === 'word' && log.push(`fill:${i.v.toFixed(2)}`), ...o })
    return { log, run, sayLine, sayText, onDone }
  }
  const mask = () => dom.q('racePhraseMask').children.filter(b => b.tag === 'b').map(b => b.getAttribute('data-w'))
  const fill = () => dom.q('racePhraseDemoFill').style.transform

  it('реплика → 300 мс → слова с паузой 350 мс → маска и заливка растут → вся фраза → 600 мс → конец', () => {
    const { log, onDone, sayLine } = setup()
    expect(sayLine).toHaveBeenCalledWith(DEMO_LINE, null, { pause: 0 })
    const demo = dom.q('racePhraseDemo')
    expect(demo.parentElement.className).toBe('wlTurn'); expect(demo.getAttribute('data-testid')).toBe('race-phrase-demo')
    expect(dom.q('racePhraseDemoCap').textContent).toBe('смотри')
    expect(dom.q('racePhraseDemoPill').getAttribute('data-mode')).toBe('say')
    expect(dom.q('racePhraseDemoPill').hasAttribute('data-wide')).toBe(true)
    expect(mask()).toEqual(['full', 'hidden', 'hidden']); expect(fill()).toBe('translateX(-100.0%)')
    vi.advanceTimersByTime(1000 + DEMO_LINE_GAP_MS - 70) // реплика ещё идёт (опрос 60 мс) + отступ
    expect(log).toEqual([`line:${DEMO_LINE}`])
    vi.advanceTimersByTime(140)
    expect(log).toEqual([`line:${DEMO_LINE}`, 'word:See', 'fill:0.33'])
    vi.advanceTimersByTime(400 + DEMO_WORD_GAP_MS)
    expect(log.slice(-2)).toEqual(['word:you', 'fill:0.67'])
    expect(mask()).toEqual(['full', 'full', 'hidden']); expect(fill()).toBe('translateX(-33.3%)')
    vi.advanceTimersByTime(400 + DEMO_WORD_GAP_MS)
    expect(log.slice(-2)).toEqual(['word:later', 'fill:1.00'])
    vi.advanceTimersByTime(400)
    expect(mask()).toEqual(['full', 'full', 'full']); expect(fill()).toBe('translateX(0.0%)')
    expect(onDone).not.toHaveBeenCalled()
    vi.advanceTimersByTime(DEMO_END_MS)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(dom.q('racePhraseDemo').hasAttribute('data-out')).toBe(true)
  })
  it('без озвучки слова (onSay не пришёл) — слово считается 450 мс; всё демо ≤ 6 с при реплике 2,8 с', () => {
    let busy = 2800
    setTimeout(() => { busy = 0 }, 2800)
    const onDone = vi.fn()
    runPhraseDemo({ phrase: { text: 'See you later' }, sayLine: () => true, sayText: () => {}, busyLeft: () => busy, mount, onDone })
    vi.advanceTimersByTime(6000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
  it('стоп посреди демо: таймеры сняты, узел убран, onDone не зовётся', () => {
    const { run, onDone, sayText } = setup()
    vi.advanceTimersByTime(1500)
    expect(sayText).toHaveBeenCalledTimes(1)
    run.stop()
    expect(dom.q('racePhraseDemo')).toBeNull()
    vi.advanceTimersByTime(10000)
    expect(sayText).toHaveBeenCalledTimes(1); expect(onDone).not.toHaveBeenCalled()
  })
  it('плашки ещё нет — узел встаёт, когда она появится, с текущим состоянием', () => {
    dom.live = false
    setup()
    vi.advanceTimersByTime(1400) // первое слово сказано
    expect(dom.q('racePhraseDemo')).toBeNull()
    dom.live = true
    vi.advanceTimersByTime(750) // второе слово
    expect(mask()).toEqual(['full', 'full', 'hidden'])
  })
  it('heardUpTo', () => { expect([...heardUpTo(1)]).toEqual([[0, true], [1, true]]) })
})

describe('демо «Скажи»: ворота игры и лимит показов', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const deps = () => ({ sayLine: () => true, sayText: (w, o) => o.onSay?.(300), busyLeft: () => 0 })
  const stage = { sid: 'phrases2-ann', demo: { text: 'See you later' } }

  it('плашка без demo («Пальцами», другие плашки) — переход сразу', () => {
    const g = createDemoGate({ storage: memStore() }), fn = vi.fn()
    g.after({ sid: 'phrases1-ann' }, fn, deps())
    expect(fn).toHaveBeenCalledTimes(1); expect(g.played()).toBe(false)
  })
  it('с demo — переход после демо; второй раз за игру демо нет', () => {
    const storage = memStore(), g = createDemoGate({ storage }), fn = vi.fn()
    g.after(stage, fn, deps())
    expect(fn).not.toHaveBeenCalled(); expect(g.active()).toBe(true)
    vi.advanceTimersByTime(6000)
    expect(fn).toHaveBeenCalledTimes(1); expect(g.active()).toBe(false); expect(demoSeen(storage)).toBe(1)
    const fn2 = vi.fn(); g.after(stage, fn2, deps())
    expect(fn2).toHaveBeenCalledTimes(1); expect(demoSeen(storage)).toBe(1)
  })
  it('пауза посреди демо: переход не зовётся, после «Продолжить» плашка сразу ведёт в круг', () => {
    const g = createDemoGate({ storage: memStore() }), fn = vi.fn()
    g.after(stage, fn, deps())
    vi.advanceTimersByTime(500)
    g.stop('пауза')
    vi.advanceTimersByTime(10000)
    expect(fn).not.toHaveBeenCalled()
    const again = vi.fn(); g.after(stage, again, deps())
    expect(again).toHaveBeenCalledTimes(1)
  })
  it(`первые ${DEMO_MAX_SHOWS} игры — демо, дальше пропуск (счётчик ${DEMO_KEY})`, () => {
    const storage = memStore()
    for (let k = 0; k < DEMO_MAX_SHOWS; k++) { const g = createDemoGate({ storage }), fn = vi.fn(); g.after(stage, fn, deps()); expect(g.active()).toBe(true); vi.advanceTimersByTime(6000); expect(fn).toHaveBeenCalled() }
    expect(demoAllowed(storage)).toBe(false)
    const g = createDemoGate({ storage }), fn = vi.fn(); g.after(stage, fn, deps())
    expect(fn).toHaveBeenCalledTimes(1); expect(g.active()).toBe(false)
  })
  it('хранилище бросает или его нет — демо показывается, без ошибок', () => {
    const bad = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
    expect(demoSeen(bad)).toBe(0); expect(() => markDemoShown(bad)).not.toThrow(); expect(demoAllowed(null)).toBe(true)
  })
})

describe('демо «Скажи»: код', () => {
  const read = f => readFileSync(new URL(f, import.meta.url), 'utf8')
  it('без Math.random и filter; стиль подключён', () => {
    for (const f of ['./racePhraseDemo.js', './racePhraseDemoView.js', './useRacePhraseDemo.js']) expect(read(f)).not.toMatch(/Math\.random\(/)
    const css = read('../../styles/player/modules/race-phrase-demo.css')
    expect(css).not.toMatch(/(^|[\s;{])filter\s*:/)
    expect(read('../../styles/player/modules/race-sprint.css')).toContain("@import './race-phrase-demo.css';")
  })
})
