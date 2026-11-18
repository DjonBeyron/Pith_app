import { describe, it, expect } from 'vitest'
import { HELP_LINES } from './bossHelp.js'
import { RACE_LINES } from '../raceLines.js'
import { BOSS } from '../mia/raceMia.js'

describe('финал: помощь Пита перед колкостью Мии (v3.3.280)', () => {
  it('три фразы по кругу есть в каталоге реплик (озвучиваются в админке); текст — как просил владелец', () => {
    const t = Object.fromEntries(RACE_LINES.map(l => [l.id, l.text]))
    expect(HELP_LINES.map(id => t[id])).toEqual(['это значит', 'переводится', 'правильно будет'])
  })
  it('Мия подкалывает только после помощи Пита: MISS_AT с запасом на фразу и слово', () => { expect(BOSS.MISS_AT).toBeGreaterThanOrEqual(2500) })
})

import { bossShift } from '../mia/raceMia.js'
describe('финал: Мия начинает вскоре после реплики Пита (v3.3.283)', () => {
  it('короткая реплика Пита сдвигает речь Мии раньше (но не позже прежней метки); длинная / неизвестная — как было', () => {
    expect(bossShift(3000)).toBe(BOSS.PIT1_AT + 3000 + BOSS.AFTER_PIT_MS - BOSS.HUSH_AT); expect(bossShift(3000)).toBeLessThan(0)
    expect(bossShift(0)).toBe(0); expect(bossShift(99999)).toBe(0)
  })
})
