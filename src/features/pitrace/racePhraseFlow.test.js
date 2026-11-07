import { describe, it, expect, vi } from 'vitest'
import { CENTER_Y, HOT_MS, ADVANCE_MS } from './racePhraseScene.js'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay, stubDraft } from './racePhraseListenStub.js'
import { phraseStep, PHRASE_SPEED, SAY_SPEED, PHRASE_GAP_MS } from './raceStagesPhrases.js'
import { round1Turns, round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { EXIT_Y } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { POOL } from '../player/modules/rotate-phone/wordLanePool.js'
import { FILL_ADVANCE } from '../player/modules/rotate-phone/wordLaneFillView.js'

// Круг 1 — единый конвейер: после итога хода остальные пилюли не гаснут, а доезжают вниз отыгранными (data-spent), следующий ход выезжает за ними тем же потоком.
// Круг 2 «Скажи» — одна заливка на всю фразу: черновое слово — половина вклада, первый черновик — «аванс», экран догоняет цель каждый кадр без ступенек.
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const turns = round1Turns(ph, 's1')
const pick = () => phraseStep('phrases1', turns, { round: 1, mode: 'pick', voice: false, speed: PHRASE_SPEED })
const untilCenter = (s, key) => { for (let i = 0; i < 2000; i++) { const p = s.run.api.state().pills.find(x => x.key === key); if (p && Math.abs(p.y - CENTER_Y) < 3) return p; s.go(16) } return null }
const capOf = key => ph.find(p => p.key === key)?.text

describe('круг 1: единый конвейер после зачёта', () => {
  it('верная взлетает, остальные уже выехавшие едут дальше отыгранными (без fade, взлёта и fail), уходят за край сами; журнал «остальные едут: N»', () => {
    const log = vi.fn(); const s = setupScene(pick(), { log })
    s.go(500); untilCenter(s, turns[0].target.key)
    const before = s.pool.taken.length
    s.run.api.tap()
    expect(s.fx.win).toHaveBeenCalledTimes(1)
    const rest = s.pool.taken.filter(p => p.cap !== turns[0].target.text)
    expect(rest.length).toBe(before - 1); expect(rest.length).toBeGreaterThan(0)
    for (const p of rest) { expect(p.attrs.has('data-spent')).toBe(true); expect(p.faded).toBeUndefined(); expect(p.rose).toBeUndefined(); expect(s.pool.live.has(p.k)).toBe(true) }
    expect(log.mock.calls.at(-1)[0]).toMatch(new RegExp(`итог верно; остальные едут: ${rest.length}$`))
    expect(s.run.api.state().spent.map(p => p.key).sort()).toEqual(rest.map(p => turns[0].cands.find(c => c.cap === p.cap).key).sort())
    s.go(20000)
    for (const p of rest) expect(s.pool.live.has(p.k)).toBe(false) // ушли за нижний край (give)
    expect(s.fx.fail.mock.calls.every(c => c[0].rep.idx > 0)).toBe(true) // fail — только у следующих ходов (там никто не тапал), не у отыгранных
  })
  it('Пит говорит следующий смысл, пока отыгранные ещё едут; новые пилюли выезжают за ними: не раньше PHRASE_GAP_MS после предыдущей, выше по ленте; пул не переполняется', () => {
    const s = setupScene(pick())
    s.go(500); untilCenter(s, turns[0].target.key); s.run.api.tap()
    const spentAt = s.pool.taken.filter(p => p.attrs.has('data-spent'))
    let spawnTimes = [], seen = s.pool.taken.length, maxLive = 0, preWhileRiding = false
    for (let i = 0; i < 600; i++) {
      s.go(16)
      maxLive = Math.max(maxLive, s.pool.live.size)
      if (s.fx.pre.mock.calls.length === 2 && spentAt.some(p => s.pool.live.has(p.k))) preWhileRiding = true
      if (s.pool.taken.length > seen) { spawnTimes.push(s.clock.t); seen = s.pool.taken.length }
    }
    expect(preWhileRiding).toBe(true)
    const fresh = s.pool.taken.slice(spentAt.length + 1)
    expect(fresh.length).toBeGreaterThan(0)
    expect(fresh[0].cap).toBe(turns[1].cands[0].cap) // порядок кандидатов хода сохранён
    const last = Math.max(...spentAt.map(p => p.born))
    expect(fresh[0].born - last).toBeGreaterThanOrEqual(PHRASE_GAP_MS - 16)
    for (let j = 1; j < spawnTimes.length; j++) expect(spawnTimes[j] - spawnTimes[j - 1]).toBeGreaterThanOrEqual(PHRASE_GAP_MS - 16)
    expect(maxLive).toBeLessThanOrEqual(POOL)
  })
  it('тап по отыгранной у центра — ничего: ни зачёта, ни промаха', () => {
    const s = setupScene(pick())
    s.go(500); untilCenter(s, turns[0].target.key)
    s.run.api.tap() // зачёт
    const spent = s.pool.taken.find(p => p.attrs.has('data-spent'))
    for (let i = 0; i < 2000 && Math.abs(s.pool.y(spent.k) - CENTER_Y) > 3; i++) s.go(16)
    for (let i = 0; i < 200 && s.run.api.state().phase !== 'ride'; i++) s.go(16) // следующий ход уже едет, его пилюли наверху
    const st = s.run.api.state()
    expect(st.phase).toBe('ride'); expect(Math.abs(s.pool.y(spent.k) - CENTER_Y)).toBeLessThan(8)
    expect(st.pills.every(p => Math.abs(p.y - CENTER_Y) > Math.abs(s.pool.y(spent.k) - CENTER_Y))).toBe(true)
    s.run.api.tap()
    expect(s.fx.win).toHaveBeenCalledTimes(1); expect(s.fx.miss).not.toHaveBeenCalled()
  })
  it('промах: верная подсвечена и взлетает, тапнутая чужая и остальные доезжают отыгранными', async () => {
    const s = setupScene(pick())
    s.go(500)
    const wrong = turns[0].cands.find(c => !c.right)
    untilCenter(s, wrong.key); s.run.api.tap()
    expect(s.fx.miss).toHaveBeenCalledTimes(1)
    const others = s.pool.taken.filter(p => p.cap !== turns[0].target.text)
    for (const p of others) { expect(p.attrs.has('data-spent')).toBe(true); expect(s.pool.live.has(p.k)).toBe(true) }
    await new Promise(r => setTimeout(r, HOT_MS + 50))
    expect(s.pool.taken.find(p => p.cap === turns[0].target.text).rose).toBe(true)
    for (const p of others) expect(s.pool.live.has(p.k)).toBe(true)
    s.go(20000); expect(s.fx.fail.mock.calls.every(c => c[0].rep.idx > 0)).toBe(true)
  })
  it('голосом отыгранную назвать нельзя: слушатель уже слушает кандидатов следующего хода', () => {
    const s = setupScene(phraseStep('phrases1', turns, { round: 1, mode: 'pick', voice: true, speed: PHRASE_SPEED }), { listen: createPhraseListener })
    s.go(600); stubSay(turns[0].target.text); expect(s.fx.win).toHaveBeenCalledTimes(1)
    const spent = s.pool.taken.find(p => p.attrs.has('data-spent'))
    if (spent) { stubSay(spent.cap); expect(s.fx.miss).not.toHaveBeenCalled(); expect(s.fx.win).toHaveBeenCalledTimes(1) }
    expect(EXIT_Y).toBeGreaterThan(100)
    s.run.stop()
  })
})

describe('круг 2 «Скажи»: одна заливка на всю фразу', () => {
  const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
  for (const frame of [16, 50]) {
    it(`первый черновик — заливка движется не позже 100 мс; черновое слово — половина вклада, подтверждённое — целиком; шаг за кадр ≤ 15 % (кадр ${frame} мс)`, () => {
      const s = setupScene(say(), { listen: createPhraseListener, frame })
      s.go(600)
      const p = s.pool.taken[0], n = capOf(round2SayTurns(ph)[0].target.key).split(' ').length
      expect(p.fill).toBe(0)
      stubDraft('…'); stubDraft('zzz') // непустой черновик без слов фразы
      const t0 = s.clock.t
      while (p.fill === 0 && s.clock.t - t0 < 500) s.go(frame)
      expect(s.clock.t - t0).toBeLessThanOrEqual(100)
      s.go(ADVANCE_MS - 200); expect(p.fill).toBeCloseTo(FILL_ADVANCE / n, 2)
      stubDraft('nice'); s.go(400); expect(p.fill).toBeCloseTo((0.5 > FILL_ADVANCE ? 0.5 : FILL_ADVANCE) / n, 2)
      stubSay('nice to'); s.go(ADVANCE_MS + 1200); expect(p.fill).toBeCloseTo(2 / n, 2)
      const steps = p.fills.slice(1).map((v, i) => Math.abs(v - p.fills[i]))
      expect(Math.max(...steps)).toBeLessThanOrEqual(0.15)
      s.run.stop()
    })
  }
})
