import { describe, it, expect } from 'vitest'
import { conveyorLaunchMs } from './raceConveyorLaunch.js'
import { openingPlan } from './raceOpening.js'
import { buildRaceStages } from './raceStages.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { extrasOf } from './raceWords.js'
import { RACE_START_LEAD_MS } from './raceStartTrace.js'
import { DROP_MS, LANES_MS } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Узор дорожек трогается на слове «запускаю» стартовой фразы (владелец 2026-11-27), а не во время отсчёта: срок = plateAt − stageAt из расписания открытия.
const mk = () => { const p = normalizePlan({ ...fixturePlan('three'), game: 'race' }); return { ...p, extraWords: extrasOf(p) } }
const text = 'Встряхнём память, я говорю слова, а ты переводишь вслух, запускаю конвейер слов'
const withWords = { race_start: { text, url: 'u', duration: 6, words: [{ w: 'запускаю', t: 4.2, e: 4.9 }] } }
const noWord = { race_start: { text: 'Три заезда', url: 'u', duration: 5 } }

describe('запуск узора дорожек на старте', () => {
  it('только у плашки первого этапа гонки (charge); у остальных стадий и не у гонки — null (своё правило зажигания)', () => {
    const plan = mk(), first = buildRaceStages({ plan, rate: 1 }).stages[0]
    expect(typeof conveyorLaunchMs(first, plan, withWords)).toBe('number')
    expect(conveyorLaunchMs({ ...first, charge: false }, plan, withWords)).toBeNull()
    expect(conveyorLaunchMs({ type: 'student' }, plan, withWords)).toBeNull()
    expect(conveyorLaunchMs(first, { ...plan, game: 'x' }, withWords)).toBeNull()
  })
  it('срок привязан к слову «запускаю» по таймингам записи: от входа в стадию 0 до слова', () => {
    const plan = mk(), first = buildRaceStages({ plan, rate: 1 }).stages[0]
    const ms = conveyorLaunchMs(first, plan, withWords), o = openingPlan(plan, withWords)
    expect(ms).toBe(Math.max(0, o.plateAt - (DROP_MS + LANES_MS)))
    expect(o.plateAt).toBeGreaterThan(RACE_START_LEAD_MS + 3000) // слово ближе к концу фразы (тайминг 4,2 с из 6 с)
    expect(ms).toBeGreaterThan(1000)
  })
  it('слова в реплике нет — зажигаем сразу со входа в стадию (не раньше нуля)', () => {
    const plan = mk(), first = buildRaceStages({ plan, rate: 1 }).stages[0]
    expect(conveyorLaunchMs(first, plan, noWord)).toBe(0)
  })
  it('режим «Пальцами»: срок считается по той же стартовой фразе режима, число неотрицательное', () => {
    const plan = mk(), first = buildRaceStages({ plan, rate: 1 }).stages[0]
    expect(conveyorLaunchMs(first, plan, null)).toBeGreaterThanOrEqual(0)
  })
})
