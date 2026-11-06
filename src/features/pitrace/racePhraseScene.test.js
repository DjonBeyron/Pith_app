import { describe, it, expect, vi } from 'vitest'
import { runPhraseScene, CENTER_Y, SILENCE_MS, SAY_BOOST, HOT_MS, SHAKE_MS } from './racePhraseScene.js'
import { createPhraseListener, stubSay, stubCount } from './racePhraseListenStub.js'
import { phraseStep, PHRASE_SPEED, SAY_SPEED, PHRASE_GAP_MS } from './raceStagesPhrases.js'
import { round1Turns, round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { ENTER_Y, SPEED, LISTEN_Y_MAX } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Сцена широкой ленты без браузера: поддельный пул (положение — по поддельным часам и скорости, как у анимации полёта), поддельный rAF (кадр — tick вручную)
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
function fakePool(clock) {
  const live = new Map(); let next = 0
  const el = () => ({ animate: () => ({}), getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }), querySelector: () => null, hasAttribute: () => true, setAttribute() {} })
  const pool = {
    live, taken: [],
    take(lane, o) { const k = next++; const p = { k, lane, ...o, attrs: new Set(), born: clock.t - (o.atMs ?? 0), rate: 1, row: 0, el: el() }; live.set(k, p); pool.taken.push(p); return k },
    give: k => live.delete(k), fade: k => live.delete(k), rise: k => { live.get(k).rose = true; live.delete(k); return true },
    y: k => { const p = live.get(k); return p ? ENTER_Y + (SPEED * p.speed * p.rate * (clock.t - p.born)) / 1000 : null },
    rate: (k, r) => { const p = live.get(k); if (!p) return; const y = pool.y(k); p.rate = r; p.born = clock.t - ((y - ENTER_Y) / (SPEED * p.speed * r)) * 1000 },
    attr: (k, n) => pool.taken[k].attrs.add(n), paintRow: (k, v) => { pool.taken[k].row = v }, el: k => pool.taken[k].el, flashLane: vi.fn(),
  }
  return pool
}
function setup(step, o = {}) {
  const clock = { t: 0 }
  const pool = fakePool(clock)
  const fx = { pre: vi.fn(), win: vi.fn(), miss: vi.fn(), fail: vi.fn(), finished: vi.fn(), pitLeft: () => o.pit ?? 0 }
  const run = runPhraseScene({ pool, root: null, scene: { step }, fxRef: { current: fx }, now: () => clock.t, raf: () => 0, caf: () => {}, log: o.log ?? (() => {}), listen: o.listen ?? null, held: () => false, snap: () => {}, shake: () => {} })
  const go = ms => { const end = clock.t + ms; while (clock.t < end) { clock.t = Math.min(end, clock.t + 16); run.tick(clock.t) } }
  return { clock, pool, fx, run, go }
}
const pick = (voice = false) => { const t = round1Turns(ph, 's1'); return phraseStep('phrases1', t, { round: 1, mode: 'pick', voice, speed: PHRASE_SPEED }) }
/** Ждать, пока пилюля key окажется у центра */
const untilCenter = (s, key) => { for (let i = 0; i < 2000; i++) { const p = s.run.api.state().pills.find(x => x.key === key); if (p && Math.abs(p.y - CENTER_Y) < 3) return p; s.go(16) } return null }

describe('сцена широкой ленты: круг 1 «Пойми»', () => {
  it('ход: pre (Пит говорит смысл), три широкие пилюли ОДНА ЗА ДРУГОЙ через PHRASE_GAP_MS, по центру одной ленты', () => {
    const s = setup(pick())
    s.go(100)
    expect(s.fx.pre).toHaveBeenCalledTimes(1); expect(s.fx.pre.mock.calls[0][0].rep.target.key).toBe(ph[0].key)
    s.go(400)
    expect(s.pool.taken).toHaveLength(1)
    s.go(PHRASE_GAP_MS); expect(s.pool.taken).toHaveLength(2)
    s.go(PHRASE_GAP_MS); expect(s.pool.taken).toHaveLength(3)
    for (const p of s.pool.taken) { expect(p.wide).toBe(true); expect(p.lane).toBe(1); expect(p.speed).toBe(PHRASE_SPEED); expect(p.quiet).toBe(true) }
    expect(s.pool.taken.map(p => p.cap)).toEqual(round1Turns(ph, 's1')[0].cands.map(c => c.cap))
  })
  it('пилюля в зоне чтения 3–4 с', () => {
    const zone = 50 / (SPEED * PHRASE_SPEED) // зона чтения ≈ 22…72 % высоты
    expect(zone).toBeGreaterThanOrEqual(3); expect(zone).toBeLessThanOrEqual(4)
  })
  it('Пит ещё говорит — пилюли не выезжают', () => {
    const s = setup(pick(), { pit: 500 })
    s.go(3000); expect(s.pool.taken).toHaveLength(0)
  })
  it('тап по ленте берёт пилюлю ближе всего к центру: верная — зачёт и взлёт (fx.win с итогом хода), журнал [phrases]', () => {
    const log = vi.fn(); const s = setup(pick(), { log }); const t = round1Turns(ph, 's1')[0]
    s.go(500)
    expect(untilCenter(s, t.target.key)).toBeTruthy()
    s.run.api.tap(0)
    expect(s.fx.win).toHaveBeenCalledTimes(1)
    const rep = s.fx.win.mock.calls[0][2]
    expect(rep).toMatchObject({ last: true, count: 1, round: 1, phraseKey: t.target.key, res: { ok: true, late: false } })
    expect(s.pool.taken.find(p => p.cap === t.target.text).rose).toBe(true)
    expect(log.mock.calls.at(-1)[0]).toMatch(/^\[phrases\] ход 1\/3: цель «.+» кандидаты «.+» \| «.+» \| «.+» итог верно$/)
  })
  it('тап по чужой — дрожь, fx.miss с «с чем спутал», верная подсвечена и взлетает сама', () => {
    const s = setup(pick())
    s.go(500)
    const t0 = round1Turns(ph, 's1')[0], wrong = t0.cands.find(c => !c.right)
    expect(untilCenter(s, wrong.key)).toBeTruthy()
    s.run.api.tap(2)
    expect(s.fx.miss).toHaveBeenCalledTimes(1)
    expect(s.fx.miss.mock.calls[0][0].rep.res).toMatchObject({ ok: false, confusedWith: wrong.key })
    const right = s.pool.taken.find(p => p.cap === t0.target.text)
    expect(right.attrs.has('data-hot')).toBe(true)
    const shaken = s.pool.taken.find(p => p.cap === wrong.cap)
    expect(s.pool.live.has(shaken.k)).toBe(true) // чужая сначала дрожит, гаснет позже
    return new Promise(r => setTimeout(r, Math.max(HOT_MS, SHAKE_MS) + 50)).then(() => { expect(right.rose).toBe(true); expect(s.pool.live.has(shaken.k)).toBe(false) })
  })
  it('верная ушла — «не успел» (fx.fail); все ходы — fx.finished', () => {
    const s = setup(pick())
    s.go(40000)
    expect(s.fx.fail).toHaveBeenCalledTimes(3); expect(s.fx.finished).toHaveBeenCalledTimes(1)
    expect(s.fx.fail.mock.calls.map(c => c[0].rep.res.ok)).toEqual([false, false, false])
  })
  it('голосом: слушатель фраз с кандидатами хода; сказал верную — зачёт, сказал чужую, когда её видно, — промах; стоп сцены — слушатель снят', () => {
    const s = setup(pick(true), { listen: createPhraseListener }); const t0 = round1Turns(ph, 's1')[0]
    expect(stubCount()).toBeGreaterThan(0)
    s.go(600)
    stubSay(t0.target.text)
    expect(s.fx.win).toHaveBeenCalledTimes(1)
    s.go(3000)
    const t1 = round1Turns(ph, 's1')[1], w = t1.cands.find(c => !c.right)
    expect(untilCenter(s, w.key)).toBeTruthy()
    stubSay(w.cap)
    expect(s.fx.miss).toHaveBeenCalledTimes(1)
    const n = stubCount(); s.run.stop(); expect(stubCount()).toBe(n - 1)
  })
})

describe('сцена широкой ленты: круг 2 «Скажи»', () => {
  const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
  it('одна бледная пилюля с сегментами по словам; слово — сегмент; ratio ≥ 0,75 — зачёт, нечисто при пропущенном слове', () => {
    const s = setup(say(), { listen: createPhraseListener })
    s.go(600)
    const p = s.pool.taken[0]
    expect(s.pool.taken).toHaveLength(1); expect(p.attrs.has('data-faded')).toBe(true); expect(p.segs).toBe(4)
    stubSay('nice to'); expect(p.row).toBe(0.5)
    expect(s.fx.win).not.toHaveBeenCalled()
    stubSay('nice to you')
    expect(s.fx.win).toHaveBeenCalledTimes(1)
    expect(s.fx.win.mock.calls[0][2].res).toMatchObject({ ok: true, ratio: 0.75, clean: false })
    s.run.stop()
  })
  it('чисто — все слова; тап в «Скажи» не отвечает', () => {
    const s = setup(say(), { listen: createPhraseListener })
    s.go(600); s.run.api.tap(1); expect(s.fx.win).not.toHaveBeenCalled()
    stubSay('nice to meet you'); expect(s.fx.win.mock.calls[0][2].res).toMatchObject({ ratio: 1, clean: true })
    s.run.stop()
  })
  it('пилюля едет медленно; после тишины SILENCE_MS — быстрее в SAY_BOOST раз, слово — снова медленно; ушла — fail с долей слов', () => {
    const s = setup(say(), { listen: createPhraseListener })
    s.go(600)
    const p = s.pool.taken[0]
    s.go(SILENCE_MS - 400); expect(p.rate).toBe(1)
    s.go(600); expect(p.rate).toBe(SAY_BOOST)
    stubSay('nice'); expect(p.rate).toBe(1)
    s.go(30000)
    expect(s.fx.fail).toHaveBeenCalled(); expect(s.fx.fail.mock.calls[0][0].rep.res.ratio).toBe(0.25)
    expect(LISTEN_Y_MAX).toBeGreaterThan(90)
    s.run.stop()
  })
})
