import { describe, it, expect } from 'vitest'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'

// v3.3.276: фраза принята не по всем словам — засчитана визуально; 1-я неточность: XP есть, на проходе 2 — ещё одна пилюля; 2-я: XP нет, доп. пилюли нет
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
const TEXT = ph.find(p => p.own).text // 'Nice to meet you'

/** Прогнать до итога хода: слушатель отдаёт ответ, ждём win; → rep последнего win */
function answer(s, said, after = 4000) {
  const before = s.fx.win.mock.calls.length
  for (let i = 0; i < 400 && s.fx.win.mock.calls.length === before; i++) { s.go(100); if (i % 5 === 0) stubSay(said) }
  expect(s.fx.win.mock.calls.length).toBe(before + 1)
  const rep = s.fx.win.mock.calls.at(-1)[2]; s.go(after); return rep
}

describe('неточное слово: засчитано, но с правилами', () => {
  it('проход 1: первая неточность — slip nth 1, XP есть; проход 2 — вторая неточность: XP нет, доп. пилюли нет (ходов по-прежнему 2 на фразу)', () => {
    const s = setupScene(say(), { listen: createPhraseListener })
    const r1 = answer(s, 'nice to you')
    expect(r1.res).toMatchObject({ ok: true, ratio: 0.75, slip: { word: 'meet', nth: 1, noXp: false, extra: false } }); expect(r1.res.noXp).toBeUndefined()
    const r2 = answer(s, 'nice to you')
    expect(r2.res.slip).toMatchObject({ word: 'meet', nth: 2, noXp: true, extra: false }); expect(r2.res.noXp).toBe(true)
    s.run.stop()
  })
  it('проход 1 чисто, проход 2 неточно (последняя пилюля фразы): первая неточность — ещё ОДНА пилюля той же фразы, XP за неё есть; доп. пилюля чистая — XP обычный', () => {
    const s = setupScene(say(), { listen: createPhraseListener })
    const r1 = answer(s, 'nice to meet you'); expect(r1.res.slip).toBeUndefined()
    const r2 = answer(s, 'nice to meet')
    expect(r2.res.slip).toMatchObject({ word: 'you', nth: 1, extra: true }); expect(r2.res.noXp).toBeUndefined()
    const r3 = answer(s, 'nice to meet you')
    expect(r3.phraseKey).toBe(r2.phraseKey); expect(r3.pass).toBe(2); expect(r3.res.slip).toBeUndefined(); expect(r3.res.noXp).toBeUndefined()
    s.run.stop()
  })
})
