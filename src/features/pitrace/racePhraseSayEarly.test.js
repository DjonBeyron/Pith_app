import { describe, it, expect, vi } from 'vitest'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { earlyAtMs, ZONE_TOP_Y, EARLY_MAX_Y } from './racePhraseEarly.js'
import { ENTER_Y, SPEED } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Замечание владельца 3: пилюля «Скажи» выезжает ВМЕСТЕ с репликой Пита (событие 'pre'), к концу реплики — у верха зоны чтения; тап-режимы (круг 1, «Узнай») — racePhraseTapEarly.test.js
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
const v = SPEED * SAY_SPEED

describe('ранний выезд «Скажи»: earlyAtMs', () => {
  it('к концу реплики — верх зоны чтения; короткая реплика — не ниже EARLY_MAX_Y, длинная — с верхнего края; за едущей — не ближе gap', () => {
    const y = o => ENTER_Y + (v * earlyAtMs({ speed: SAY_SPEED, gap: 2400, ...o })) / 1000
    expect(y({ pitMs: 2500 }) + (v * 2500) / 1000).toBeCloseTo(ZONE_TOP_Y, 6)
    expect(y({ pitMs: 0 })).toBeCloseTo(EARLY_MAX_Y, 6)
    expect(y({ pitMs: 20000 })).toBeCloseTo(ENTER_Y, 6)
    expect(y({ pitMs: 0, ys: [20] })).toBeCloseTo(20 - (v * 2400) / 1000, 6) // впереди едет отыгранная — держим шаг gap
    expect(earlyAtMs({ pitMs: 0, speed: SAY_SPEED, gap: 2400, ys: [ENTER_Y + 5] })).toBeNull() // места нет — обычным потоком
  })
})

describe('ранний выезд «Скажи» в сцене', () => {
  it('Пит говорит смысл 2,5 с — пилюля выехала сразу на pre (не ждёт pitLeft), слушатель включён, к концу реплики центр у верха зоны чтения; журнал', () => {
    const log = vi.fn(), s = setupScene(say(), { listen: createPhraseListener, pit: 2500, log })
    s.go(16)
    expect(s.fx.pre).toHaveBeenCalledTimes(1); expect(s.pool.taken).toHaveLength(1)
    const st = s.run.api.state(); expect(st.phase).toBe('ride'); expect(st.listening).toBe(true)
    const p = s.pool.taken[0]
    expect(s.pool.y(p.k)).toBeGreaterThan(ENTER_Y + 10) // уже выкатывается, а не из-за края
    s.go(2500); expect(s.pool.y(p.k)).toBeGreaterThanOrEqual(ZONE_TOP_Y - 0.5)
    expect(log.mock.calls.map(c => c[0]).find(l => l.includes('выезжает вместе с репликой'))).toMatch(/^\[phrases\] круг 2 «Скажи» \(голос\), ход 1\/6, проход 1\/2: пилюля выезжает вместе с репликой Пита \(2500 мс\) с -?\d+ % высоты/)
    s.run.stop()
  })
  it('проход 2 — тоже на pre: пилюля появляется в том же кадре, что и реплика race_phrase_again', () => {
    const s = setupScene(say(), { listen: createPhraseListener })
    s.go(600); stubSay('nice to meet you')
    for (let i = 0; i < 100 && !s.fx.win.mock.calls.length; i++) s.go(16)
    expect(s.fx.win).toHaveBeenCalledTimes(1)
    let pit = 0; s.fx.pitLeft = () => pit
    const pre = s.fx.pre; s.fx.pre = vi.fn(e => { pre(e); pit = 1800 })
    for (let i = 0; i < 400 && s.fx.pre.mock.calls.length === 0; i++) s.go(16)
    expect(s.fx.pre.mock.calls[0][0].rep.pass).toBe(2)
    expect(s.pool.taken).toHaveLength(2); expect(s.pool.taken[1].attrs.has('data-pass')).toBe(true)
    s.run.stop()
  })
  it('новый ход: слушатель сбрасывается (setPhrases + reset) ДО реплики Пита — накопленное прошлого хода не в счёт', () => {
    const order = []
    const listen = o => ({ stop() {}, reset: () => order.push('reset'), setPhrases: () => order.push('setPhrases'), o })
    const s = setupScene(say(), { listen })
    const pre = s.fx.pre; s.fx.pre = vi.fn(e => { order.push('pre'); pre(e) })
    s.go(16)
    expect(order).toEqual(['setPhrases', 'reset', 'pre'])
    s.run.stop()
  })
})
