import { describe, it, expect } from 'vitest'
import { CENTER_Y } from './racePhraseScene.js'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay, stubDraft } from './racePhraseListenStub.js'
import { phraseStep, PHRASE_SPEED, SAY_SPEED, PHRASE_GAP_MS } from './raceStagesPhrases.js'
import { round2HearTurns, round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { EXIT_Y } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { POOL } from '../player/modules/rotate-phone/wordLanePool.js'

// Круг 1 — единый конвейер: после итога хода остальные пилюли не гаснут, а доезжают вниз отыгранными (data-spent), следующий ход выезжает за ними тем же потоком.
// Круг 2 «Скажи» — одна заливка на всю фразу: каждое слово — полная доля (черновое — когда устоялось, racePhraseFill.js), «аванса» по первому звуку нет (шум не заливает), экран догоняет цель каждый кадр без ступенек.
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const turns = round2HearTurns(ph, 's1')
const pick = () => phraseStep('phrases2', turns, { round: 2, mode: 'hear', voice: false, speed: PHRASE_SPEED })
const untilCenter = (s, key) => { for (let i = 0; i < 2000; i++) { const p = s.run.api.state().pills.find(x => x.key === key); if (p && Math.abs(p.y - CENTER_Y) < 3) return p; s.go(16) } return null }
const capOf = key => ph.find(p => p.key === key)?.ru

describe('круг 1: единый конвейер после зачёта', () => {
  it('верная взлетает, остальные выехавшие пилюли разлетаются влево и вправо поровну (без fade и взлёта, по очереди −1, +1); fail — только у следующих ходов', () => {
    const s = setupScene(pick()); s.go(500); untilCenter(s, turns[0].target.key)
    const before = s.pool.taken.length
    s.run.api.tap()
    expect(s.fx.win).toHaveBeenCalledTimes(1)
    const rest = s.pool.taken.filter(p => p.cap !== turns[0].target.ru)
    expect(rest.length).toBe(before - 1); expect(rest.length).toBeGreaterThan(0)
    rest.forEach((p, i) => { expect(p.scattered).toBe(i % 2 ? 1 : -1); expect(p.faded).toBeUndefined(); expect(p.rose).toBeUndefined(); expect(s.pool.live.has(p.k)).toBe(false) })
    expect(s.run.api.state().spent).toEqual([])
    s.go(20000)
    expect(s.fx.fail.mock.calls.every(c => c[0].rep.idx > 0)).toBe(true)
  })
  it('после зачёта Пит говорит следующий смысл, новые пилюли выезжают в порядке кандидатов, не ближе PHRASE_GAP_MS друг за другом; пул не переполнен', () => {
    const s = setupScene(pick())
    s.go(500); untilCenter(s, turns[0].target.key); s.run.api.tap()
    const first = s.pool.taken.length
    let spawnTimes = [], seen = first, maxLive = 0
    for (let i = 0; i < 600; i++) {
      s.go(16)
      maxLive = Math.max(maxLive, s.pool.live.size)
      if (s.pool.taken.length > seen) { spawnTimes.push(s.clock.t); seen = s.pool.taken.length }
    }
    expect(s.fx.pre.mock.calls.length).toBeGreaterThanOrEqual(2)
    const fresh = s.pool.taken.slice(first)
    expect(fresh.length).toBeGreaterThan(0)
    expect(fresh[0].cap).toBe(turns[1].cands[0].cap) // порядок кандидатов хода сохранён
    for (let j = 1; j < spawnTimes.length; j++) expect(spawnTimes[j] - spawnTimes[j - 1]).toBeGreaterThanOrEqual(PHRASE_GAP_MS - 16)
    expect(maxLive).toBeLessThanOrEqual(POOL)
  })
  it('после зачёта разлетевшиеся пилюли не отвечают на тап: ни второго зачёта, ни промаха', () => {
    const s = setupScene(pick())
    s.go(500); untilCenter(s, turns[0].target.key)
    s.run.api.tap() // зачёт
    s.run.api.tap() // повторный тап по тому же месту: пилюль хода уже нет
    expect(s.fx.win).toHaveBeenCalledTimes(1); expect(s.fx.miss).not.toHaveBeenCalled()
  })
  it('промах: разлетаются ВСЕ пилюли хода (и верная — она не подсвечивается и не взлетает), выбранная неверная — с красной рамкой (data-wrong)', () => {
    const s = setupScene(pick())
    s.go(500)
    const wrong = turns[0].cands.find(c => !c.right)
    untilCenter(s, wrong.key); s.run.api.tap()
    expect(s.fx.miss).toHaveBeenCalledTimes(1)
    const all = s.pool.taken.filter(p => turns[0].cands.some(c => c.cap === p.cap))
    expect(all.length).toBeGreaterThan(1)
    all.forEach(p => { expect(p.scattered === -1 || p.scattered === 1).toBe(true); expect(p.rose).toBeUndefined(); expect(p.attrs.has('data-hot')).toBe(false) })
    expect(new Set(all.map(p => p.scattered)).size).toBe(2) // и влево, и вправо
    expect(s.pool.taken.find(p => p.cap === wrong.cap).attrs.has('data-wrong')).toBe(true)
    s.go(20000); expect(s.fx.fail.mock.calls.every(c => c[0].rep.idx > 0)).toBe(true)
  })
  it('голосом круг 1 тоже только тап: фраза, сказанная вслух, не засчитывается ни у верной, ни у отыгранной', () => {
    const s = setupScene(phraseStep('phrases2', turns, { round: 2, mode: 'hear', voice: true, speed: PHRASE_SPEED }), { listen: createPhraseListener })
    s.go(600); stubSay(turns[0].target.text); expect(s.fx.win).not.toHaveBeenCalled()
    untilCenter(s, turns[0].target.key); s.run.api.tap(); expect(s.fx.win).toHaveBeenCalledTimes(1)
    const spent = s.pool.taken.find(p => p.attrs.has('data-spent'))
    if (spent) { stubSay(spent.cap); expect(s.fx.miss).not.toHaveBeenCalled(); expect(s.fx.win).toHaveBeenCalledTimes(1) }
    expect(EXIT_Y).toBeGreaterThan(100)
    s.run.stop()
  })
})

describe('круг 2 «Скажи»: одна заливка на всю фразу', () => {
  const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
  for (const frame of [16, 50]) {
    it(`шум (черновик без слов фразы) не заливает; черновое слово — сразу целиком, догон за ≤ 200 мс; шаг за кадр ≤ 30 % (кадр ${frame} мс)`, () => {
      const s = setupScene(say(), { listen: createPhraseListener, frame })
      s.go(600)
      const p = s.pool.taken[0], n = capOf(round2SayTurns(ph)[0].target.key).split(' ').length
      expect(p.fill).toBe(0)
      stubDraft('…'); stubDraft('zzz'); s.go(1500) // непустой черновик без слов фразы — раньше «аванс» 35 % слова
      expect(p.fill).toBe(0)
      stubDraft('nice'); s.go(200); expect(p.fill).toBeCloseTo(1 / n, 2) // черновое слово — сразу полная доля (без выдержки)
      stubSay('nice to'); s.go(1200); expect(p.fill).toBeCloseTo(2 / n, 2)
      const steps = p.fills.slice(1).map((v, i) => Math.abs(v - p.fills[i]))
      expect(Math.max(...steps)).toBeLessThanOrEqual(0.3)
      s.run.stop()
    })
  }
  it('слово словаря, которого нет в цели (onWord чужой фразы — шум), и черновики слуха (onEar) не заливают; слово цели — заливает', () => {
    let cb = null
    const listen = o => { cb = o; return { stop() {}, reset() {}, setPhrases() {} } }
    const s = setupScene(say(), { listen })
    s.go(600)
    const p = s.pool.taken[0], key = round2SayTurns(ph)[0].target.key
    cb.onEar({ kind: 'partial', text: 'see' }); cb.onEar({ kind: 'gate', open: true })
    cb.onWord({ phraseKey: 'see you later', index: 0, text: 'see', draft: true }); cb.onWord({ phraseKey: 'see you later', index: 1, text: 'you', draft: false })
    s.go(1500); expect(p.fill).toBe(0)
    cb.onWord({ phraseKey: key, index: 0, text: 'nice', draft: true }); s.go(300); expect(p.fill).toBeGreaterThan(0.2)
    s.run.stop()
  })
})
