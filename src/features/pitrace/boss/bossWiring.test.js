import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { laneTape, TAPE_ACTS } from '../../player/modules/rotate-phone/wordLaneTape.js'

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('финал «Шкала памяти»: подключение', () => {
  it('лента и широкая пилюля: акт boss едет на ленте, step.wide даёт широкую пилюлю', () => {
    expect(TAPE_ACTS).toEqual(['phrases', 'boss'])
    expect(laneTape({ rh: { on: true }, stage: 'run', stageObj: { act: 'boss' } })).toBe(true); expect(laneTape({ rh: { on: true }, stage: 'run', stageObj: { act: 'sprint' } })).toBe(false)
    expect(read('../../player/modules/rotate-phone/useWordLanePills.js')).toContain('wide: !!step.wide')
  })
  it('директор: Пит говорит перевод и на финале, «не успел» даёт отступ, слова вписываются перед входом', () => {
    const src = read('../useRaceActs.js')
    expect(src).toContain("(act === 'sprint' || act === 'boss') && said"); expect(src).toContain("['sprint', 'catch', 'boss'].includes(running.act)) speech.pillGone"); expect(src).toContain("if (stages[r]?.sid === 'boss-ann') bossFill(stages, box.s, seed)")
  })
  it('игра рисует шкалу только на финале (RaceBossScale live по act boss), стили подключены', () => {
    expect(read('../../player/modules/rotate-phone/WordLaneGame.jsx')).toContain("f.stageObj?.act === 'boss'"); expect(read('../../../styles/player/modules/race-sprint.css')).toContain("@import './race-boss.css'")
  })
})
