import { describe, it, expect } from 'vitest'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay, stubDraft } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { EXIT_Y } from '../player/modules/rotate-phone/wordLaneTimeline.js'
import { POOL } from '../player/modules/rotate-phone/wordLanePool.js'

// Круг 2 «Скажи» — одна заливка на всю фразу: каждое слово — полная доля (черновое — когда устоялось, racePhraseFill.js), «аванса» по первому звуку нет (шум не заливает), экран догоняет цель каждый кадр без ступенек.
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })

describe('круг 2 «Скажи»: одна заливка на всю фразу', () => {
  const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
  for (const frame of [16, 50]) {
    it(`шум (черновик без слов фразы) не заливает; черновое слово — сразу целиком, догон за ≤ 200 мс; шаг за кадр ≤ 30 % (кадр ${frame} мс)`, () => {
      const s = setupScene(say(), { listen: createPhraseListener, frame })
      s.go(600)
      const p = s.pool.taken[0], n = round2SayTurns(ph)[0].target.text.split(' ').length
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
