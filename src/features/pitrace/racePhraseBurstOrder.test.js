import { describe, it, expect, vi } from 'vitest'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { RISE_DELAY_MS } from '../player/modules/rotate-phone/wordLaneRise.js'
import { BURST_WIDE_END_MS, BURST_WIDE_MS } from '../player/modules/rotate-phone/wordLaneBubbles.js'

// Владелец 2026-11-27 (журнал 13:32:41, v3.3.384): у широкой пилюли «Скажи» при полном заполнении пузырьки вылетали и улетали ВМЕСТЕ с пилюлей. Теперь: пузырьки вылетают и исчезают,
// пилюля стоит на месте, потом улетает без них (pool.rise({ delay }) не раньше конца вылета). Нет пузырей (слабое устройство) — прежняя пауза.
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
const win = async out => { const snap = vi.fn(() => out), s = setupScene(say(), { listen: createPhraseListener, snap }); s.go(600); stubSay('nice to meet you'); s.go(1200); const p = s.pool.taken[0]; s.run.stop(); return { p, snap, s } }

describe('широкая пилюля «Скажи»: пузырьки вылетели — потом улёт', () => {
  it('конец вылета пузырьков (240…300 мс + до 20) раньше старта улёта; пузыри были — улёт ждёт BURST_WIDE_END_MS', async () => {
    expect(BURST_WIDE_MS + 60 + 20).toBeLessThanOrEqual(BURST_WIDE_END_MS)
    const { p, snap } = await win(8); expect(snap).toHaveBeenCalledTimes(1); expect(p.rose).toBe(true); expect(p.riseOpts.delay).toBe(BURST_WIDE_END_MS)
  })
  it('пузырей нет (слабое устройство, набора не хватило) — прежняя пауза «набрать дыхание»', async () => {
    const { p } = await win(0); expect(p.rose).toBe(true); expect(p.riseOpts.delay).toBe(RISE_DELAY_MS)
  })
})
