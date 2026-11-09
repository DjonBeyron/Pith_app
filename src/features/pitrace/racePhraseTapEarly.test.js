import { describe, it, expect, vi } from 'vitest'
import { setupScene } from './racePhraseSceneRig.js'
import { phraseStep, PHRASE_SPEED, PHRASE_GAP_MS } from './raceStagesPhrases.js'
import { round1Turns, round2HearTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { ZONE_TOP_Y } from './racePhraseEarly.js'
import { ENTER_Y, SPEED, WIDE_H, FADE_TOP } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Ранний выезд в тап-режимах (владелец 2026-11-09: «когда Пит закончил говорить задание, первая пилюля уже должна быть на 100 % видна»): круг 1 «Пойми» и «Узнай» — как «Скажи»
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const pick = () => phraseStep('phrases1', round1Turns(ph, 's1'), { round: 1, mode: 'pick', voice: false, speed: PHRASE_SPEED })
const hear = () => phraseStep('phrases2', round2HearTurns(ph, 's1'), { round: 2, mode: 'hear', voice: false, speed: PHRASE_SPEED })
const v = SPEED * PHRASE_SPEED

describe('ранний выезд в тап-режимах', () => {
  it('центр у ZONE_TOP_Y — широкая пилюля целиком ниже верхнего затемнения (с запасом 2 %)', () => {
    expect(ZONE_TOP_Y - WIDE_H / 2).toBeGreaterThanOrEqual(FADE_TOP + 2)
  })
  for (const [name, step] of [['круг 1 «Пойми»', pick], ['«Узнай»', hear]]) {
    it(`${name}: Пит говорит 2000 мс — первая пилюля (кандидат 0) выезжает на pre, к концу реплики её центр ≥ ZONE_TOP_Y`, () => {
      const s = setupScene(step(), { pit: 2000 })
      s.go(16)
      expect(s.fx.pre).toHaveBeenCalledTimes(1); expect(s.pool.taken).toHaveLength(1)
      expect(s.pool.taken[0].cap).toBe(step().phrases.turns[0].cands[0].cap)
      expect(s.run.api.state().phase).toBe('ride')
      s.go(2000); expect(s.pool.y(0)).toBeGreaterThanOrEqual(ZONE_TOP_Y - 1e-6)
      s.run.stop()
    })
  }
  it('кандидат 0 — не всегда цель: порядок уже перемешан (racePhraseTurns.arrange)', () => {
    const firstRight = round1Turns(ph, 's1').concat(round1Turns(ph, 's2'), round1Turns(ph, 's3')).map(t => t.cands[0].right)
    expect(firstRight).toContain(false)
  })
  it('второй и третий кандидаты — за первым ровно через путь cfg.gap: не пачкой и без лишнего ожидания', () => {
    const s = setupScene(pick(), { pit: 2000 })
    const gapPct = (v * PHRASE_GAP_MS) / 1000
    let i = 0
    for (; i < 400 && s.pool.taken.length < 2; i++) s.go(16)
    expect(s.pool.y(0) - s.pool.y(1)).toBeGreaterThanOrEqual(gapPct - 0.5); expect(s.pool.y(0) - s.pool.y(1)).toBeLessThanOrEqual(gapPct + 0.5)
    expect(i * 16).toBeLessThan(PHRASE_GAP_MS) // первая уже «проехала» atMs — вторая не ждёт полный gap от pre
    for (i = 0; i < 400 && s.pool.taken.length < 3; i++) s.go(16)
    expect(s.pool.y(1) - s.pool.y(2)).toBeGreaterThanOrEqual(gapPct - 0.5); expect(s.pool.y(1) - s.pool.y(2)).toBeLessThanOrEqual(gapPct + 0.5)
    s.run.stop()
  })
  it('тап во время реплики Пита засчитывается сразу (пилюля уже на экране)', () => {
    const s = setupScene(pick(), { pit: 2000 })
    s.go(1800)
    expect(s.pool.y(0)).toBeGreaterThan(ENTER_Y + 20)
    s.run.api.tap(0)
    expect(s.run.api.state().res).not.toBeNull()
    expect(s.fx.win.mock.calls.length + s.fx.miss.mock.calls.length).toBe(1)
    s.run.stop()
  })
  it('сразу после pre цепочка голоса ещё ждёт (pitLeft 300) — ход ждёт, пока реплика зазвучит, и выезжает с её длиной', () => {
    const log = vi.fn(), s = setupScene(pick(), { pit: 300, log })
    s.go(100); expect(s.pool.taken).toHaveLength(0); expect(s.run.api.state().phase).toBe('pre')
    let pit = 2116; s.fx.pitLeft = () => pit
    s.go(16); expect(s.pool.taken).toHaveLength(1)
    expect(log.mock.calls.map(c => c[0]).some(l => l.includes('вместе с репликой Пита (2116 мс)'))).toBe(true)
    pit = 0; s.run.stop()
  })
  it('нет места за едущими (pool.tail у самого края) — обычный поток: журнал «пилюли едут», первая — через gap', () => {
    const log = vi.fn(), s = setupScene(pick(), { pit: 2000, tail: ENTER_Y + 1, log })
    s.go(16)
    expect(s.pool.taken).toHaveLength(0)
    expect(log.mock.calls.map(c => c[0]).some(l => l.includes('пилюли едут (места за едущими нет'))).toBe(true)
    s.go(PHRASE_GAP_MS); expect(s.pool.taken).toHaveLength(1)
    s.run.stop()
  })
})
