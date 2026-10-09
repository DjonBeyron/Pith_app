import { describe, it, expect } from 'vitest'
import {
  CATCH_HINT_KEY, CATCH_HINT_MAX, CATCH_HINT_DELAY_MS, parseShows, canShowCatchHint, nextShows, retiredShows,
} from './catchSlowHint.js'
import { ARM_AT_VIDEO, MAX_IGNORED } from '../slowmoHintPlan.js'

describe('подсказка «замедлить» в «Ловле слов»: счётчик показов', () => {
  it('первые три раза показываем, на четвёртый — нет', () => {
    let shows = 0
    const log = []
    for (let i = 0; i < 5; i++) {
      const can = canShowCatchHint({ shows, open: true, soundOn: true })
      log.push(can)
      if (can) shows = nextShows(shows) // счётчик растёт только при реальном показе
    }
    expect(log).toEqual([true, true, true, false, false])
    expect(shows).toBe(CATCH_HINT_MAX)
  })

  it('мусор в хранилище — как ноль, большие числа не выходят за максимум', () => {
    expect(['', null, undefined, 'x', '-2', 'NaN'].map(parseShows)).toEqual([0, 0, 0, 0, 0, 0])
    expect(parseShows('2')).toBe(2)
    expect(parseShows('2.9')).toBe(2)
    expect(parseShows('99')).toBe(CATCH_HINT_MAX)
    expect(nextShows('x')).toBe(1)
    expect(nextShows(99)).toBe(CATCH_HINT_MAX)
  })

  it('воспользовался замедлением — больше не показываем (счётчик на максимуме)', () => {
    expect(canShowCatchHint({ shows: retiredShows(), open: true, soundOn: true })).toBe(false)
  })
})

describe('подсказка «замедлить» в «Ловле слов»: условия показа', () => {
  it('нужны открытое накрытие и включённый звук', () => {
    expect(canShowCatchHint({ shows: 0, open: true, soundOn: true })).toBe(true)
    expect(canShowCatchHint({ shows: 0, open: false, soundOn: true })).toBe(false)
    expect(canShowCatchHint({ shows: 0, open: true, soundOn: false })).toBe(false)
  })

  it('появляется после выезда накрытия (260мс), а не в его кадрах', () => {
    expect(CATCH_HINT_DELAY_MS).toBeGreaterThanOrEqual(300)
    expect(CATCH_HINT_DELAY_MS).toBeLessThanOrEqual(400)
  })
})

describe('отдельный счётчик от обычной подсказки ленты', () => {
  it('свой ключ localStorage, не совпадающий с ключами обычной подсказки', () => {
    expect(CATCH_HINT_KEY).toBe('pithy_catch_slowmo_hint_v1')
    expect(['pithy_slowmo_hint_seen_v1', 'pithy_slowmo_hint_ignored_v1']).not.toContain(CATCH_HINT_KEY)
  })

  it('правила обычной подсказки (3-е видео, три игнора) не изменились', () => {
    expect(ARM_AT_VIDEO).toBe(3)
    expect(MAX_IGNORED).toBe(3)
  })
})
