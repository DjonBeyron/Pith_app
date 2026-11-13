import { describe, it, expect, vi } from 'vitest'
import { startPhraseCount } from './racePhraseCount.js'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'

// Отсчёт «Скажи» после демо (v3.3.220): без countAfter и при продолжении с середины круга нот нет; с countAfter — ноты между демо и первым ходом.
describe('startPhraseCount', () => {
  it('нужен только при cfg.countAfter и старте с начала круга', () => {
    const count = vi.fn(() => () => {})
    expect(startPhraseCount({ cfg: { mode: 'say' }, count })).toBeNull()
    expect(startPhraseCount({ cfg: { mode: 'say', countAfter: true }, from: 2, count })).toBeNull()
    expect(count).not.toHaveBeenCalled()
    expect(startPhraseCount({ cfg: { mode: 'say', countAfter: true }, from: 0, count, onDone: () => {} })).toBeTypeOf('function')
    expect(count).toHaveBeenCalledTimes(1); expect(count.mock.calls[0][0].plan[0].soft).toBe(true)
  })
})

describe('сцена «Скажи»: ноты перед первым ходом', () => {
  it('демо нет/кончилось → фаза count, первый ход не начат; onDone → первый ход', () => {
    const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
    const turns = round2SayTurns(ph)
    const step = phraseStep('phrases2', turns, { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
    step.phrases.countAfter = true // демо пропущено (нет фразы) — ноты всё равно перед первым ходом
    let done = null
    const count = vi.fn(({ onDone }) => { done = onDone; return () => {} })
    const s = setupScene(step, { listen: createPhraseListener, count })
    s.go(3000)
    expect(count).toHaveBeenCalledTimes(1); expect(s.run.api.state().phase).toBe('count')
    expect(s.fx.pre).not.toHaveBeenCalled()
    done(); s.go(100)
    expect(s.fx.pre).toHaveBeenCalledTimes(1); expect(s.run.api.state().phase).not.toBe('count')
    expect(count).toHaveBeenCalledTimes(1) // отсчёт один раз за круг
    s.run.stop()
  })
})
