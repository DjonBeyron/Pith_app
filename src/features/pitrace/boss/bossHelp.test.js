import { describe, it, expect } from 'vitest'
import { HELP_LINES } from './bossHelp.js'
import { RACE_LINES } from '../raceLines.js'
import { BOSS } from '../mia/raceMia.js'

describe('финал: помощь Пита перед колкостью Мии (v3.3.280)', () => {
  it('три фразы по кругу есть в каталоге реплик (озвучиваются в админке); текст — как просил владелец', () => {
    const t = Object.fromEntries(RACE_LINES.map(l => [l.id, l.text]))
    expect(HELP_LINES.map(id => t[id])).toEqual(['это значит', 'переводится', 'правильно будет'])
  })
  it('порядок сменился (владелец 2026-11-22): Мия подкалывает ПЕРВОЙ, помощь Пита («это значит» + слово) — следом за ней в одной очереди речи; запаса MISS_AT больше нет', async () => {
    const { reduceMia, miaInit } = await import('../mia/raceMia.js')
    const stage = { mia: 'round', silent: true, act: 'boss', words: [{ text: 'a', translation: 'а' }, { text: 'b', translation: 'б' }] }
    const m = reduceMia({ ...miaInit(), phase: 'in', act: 'boss' }, { t: 'enter', stage }).mia
    expect(reduceMia(m, { t: 'fail', stage, idx: 0 }).say.map(c => [c.who, c.id, c.delay])).toEqual([['mia', 'mia_miss_1', 0], ['pit', HELP_LINES[0], 0], ['pit', 'boss_pit_next', 0]])
    expect(BOSS.MISS_AT).toBeUndefined()
  })
})

import { bossShift } from '../mia/raceMia.js'
describe('финал: Мия начинает вскоре после реплики Пита (v3.3.283)', () => {
  it('короткая реплика Пита сдвигает речь Мии раньше (но не позже прежней метки); длинная / неизвестная — как было', () => {
    expect(bossShift(3000)).toBe(BOSS.PIT1_AT + 3000 + BOSS.AFTER_PIT_MS - BOSS.HUSH_AT); expect(bossShift(3000)).toBeLessThan(0)
    expect(bossShift(0)).toBe(0); expect(bossShift(99999)).toBe(0)
  })
})
