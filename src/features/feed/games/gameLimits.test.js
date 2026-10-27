import { describe, it, expect } from 'vitest'
import {
  GAME_GAP, GAME_PER_DAY, GAME_ORDER, gamesDay, canOfferGame, gameBlockReason, markGameShown, gameRotation,
  readGamesDay, writeGamesDay,
} from './gameLimits.js'

describe('общие лимиты игр ленты', () => {
  const day = { date: '2026-10-27', count: 0, last: null }

  it('чужая дата и мусор обнуляют счётчик, но очередь игр переживает смену дня', () => {
    expect(gamesDay({ date: '2026-10-26', count: 4, last: 'fill' }, '2026-10-27')).toEqual({ date: '2026-10-27', count: 0, last: 'fill' })
    expect(gamesDay({ date: '2026-10-27', count: 3 }, '2026-10-27').count).toBe(3)
    expect(gamesDay('мусор', '2026-10-27')).toEqual(day)
    expect(gamesDay({ date: '2026-10-27', count: -2, last: 'tetris' }, '2026-10-27')).toEqual(day)
  })

  it('не чаще раза в 6 слайдов — на все игры вместе', () => {
    expect(canOfferGame({ swipes: GAME_GAP - 1, state: day })).toBe(false)
    expect(canOfferGame({ swipes: GAME_GAP, state: day })).toBe(true)
    expect(gameBlockReason({ swipes: 2, state: day })).toMatch(/слайд/)
  })

  it('не больше 4 в день, какие бы игры ни показывались', () => {
    let s = day
    for (let i = 0; i < GAME_PER_DAY; i++) s = markGameShown(s, GAME_ORDER[i % GAME_ORDER.length])
    expect(s.count).toBe(GAME_PER_DAY)
    expect(canOfferGame({ swipes: 99, state: s })).toBe(false)
    expect(gameBlockReason({ swipes: 99, state: s })).toMatch(/в день/)
    expect(gameBlockReason({ swipes: 99, state: day })).toBeNull()
  })

  it('markGameShown помнит показанную игру; чужое название её не затирает', () => {
    expect(markGameShown(day, 'fill').last).toBe('fill')
    expect(markGameShown({ ...day, last: 'fill' }, 'nope').last).toBe('fill')
  })

  it('очередь по кругу: choose → fill → picture → choose', () => {
    const all = ['choose', 'fill', 'picture']
    expect(gameRotation(all, null)).toEqual(['choose', 'fill', 'picture'])
    expect(gameRotation(all, 'choose')).toEqual(['fill', 'picture', 'choose'])
    expect(gameRotation(all, 'fill')).toEqual(['picture', 'choose', 'fill'])
    expect(gameRotation(all, 'picture')).toEqual(['choose', 'fill', 'picture'])
  })

  it('очередь не содержит неподключённых игр и не падает на пустом списке', () => {
    expect(gameRotation(['choose', 'picture'], 'choose')).toEqual(['picture', 'choose'])
    expect(gameRotation(['fill'], 'picture')).toEqual(['fill'])
    expect(gameRotation([], 'fill')).toEqual([])
  })

  it('хранилище: запись и чтение; без хранилища не падает', () => {
    const mem = new Map()
    const storage = () => ({ getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) })
    writeGamesDay({ date: '2026-10-27', count: 2, last: 'fill' }, storage)
    expect(readGamesDay('2026-10-27', storage)).toEqual({ date: '2026-10-27', count: 2, last: 'fill' })
    expect(readGamesDay('2026-10-28', storage).count).toBe(0)
    expect(readGamesDay('2026-10-27', () => null).count).toBe(0)
    expect(() => writeGamesDay(day, () => { throw new Error('private') })).not.toThrow()
  })
})
