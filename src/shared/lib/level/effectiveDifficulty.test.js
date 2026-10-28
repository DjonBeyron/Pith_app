import { describe, it, expect, vi } from 'vitest'
import { effectiveDifficulty, MIN_DIFFICULTY_VOTES } from './effectiveDifficulty.js'
import { lookupFromModules } from './levelFeed.js'

vi.mock('../../api/supabase.js', () => ({ supabase: {} }))
const { displayDifficulty, MIN_DIFFICULTY_VOTES: REEXPORT } = await import('../../api/difficultyApi.js')

describe('effectiveDifficulty — голоса важнее, пока их мало — админ', () => {
  it('голосов от порога — медиана голосов, а не выбор админа', () => {
    expect(effectiveDifficulty({ difficulty: 3, difficultyVotes: 5, difficultyAdmin: 1 })).toBe(3)
    expect(effectiveDifficulty({ difficulty: 2, difficultyVotes: 40, difficultyAdmin: null })).toBe(2)
  })
  it('голосов мало — сложность админа (сырая медиана одного-двух голосов не считается)', () => {
    expect(effectiveDifficulty({ difficulty: 3, difficultyVotes: 4, difficultyAdmin: 1 })).toBe(1)
    expect(effectiveDifficulty({ difficulty: 3, difficultyVotes: 0, difficultyAdmin: 2 })).toBe(2)
  })
  it('ни голосов, ни админа — null (сложность не известна)', () => {
    expect(effectiveDifficulty({ difficulty: 3, difficultyVotes: 4 })).toBeNull()
    expect(effectiveDifficulty({ difficulty: null, difficultyVotes: 0, difficultyAdmin: null })).toBeNull()
    expect(effectiveDifficulty(null)).toBeNull()
  })
  it('голосов достаточно, а медианы нет — запасной путь через админа; мусор отбрасывается', () => {
    expect(effectiveDifficulty({ difficulty: null, difficultyVotes: 9, difficultyAdmin: 3 })).toBe(3)
    expect(effectiveDifficulty({ difficultyVotes: 0, difficultyAdmin: 7 })).toBeNull()
    expect(effectiveDifficulty({ difficultyVotes: 0, difficultyAdmin: '2' })).toBe(2)
  })
  it('свой порог голосов', () => {
    expect(effectiveDifficulty({ difficulty: 3, difficultyVotes: 2, difficultyAdmin: 1 }, 2)).toBe(3)
  })
  it('порог голосов один на всех: difficultyApi отдаёт ту же константу', () => {
    expect(MIN_DIFFICULTY_VOTES).toBe(5)
    expect(REEXPORT).toBe(MIN_DIFFICULTY_VOTES)
  })
})

describe('displayDifficulty — значок сложности', () => {
  it('рекомендации: голоса от порога → медиана; мало → сложность админа; ничего → 1 («Легко»)', () => {
    expect(displayDifficulty({ difficulty: 3, difficultyVotes: 6, difficultyAdmin: 1 })).toBe(3)
    expect(displayDifficulty({ difficulty: 3, difficultyVotes: 1, difficultyAdmin: 2 })).toBe(2)
    expect(displayDifficulty({ difficulty: 3, difficultyVotes: 1 })).toBe(1)
    expect(displayDifficulty({})).toBe(1)
  })
  it('«Мои уроки»: свой голос приоритетнее всего', () => {
    expect(displayDifficulty({ difficulty: 3, difficultyVotes: 9, difficultyAdmin: 1 }, 2, true)).toBe(2)
    expect(displayDifficulty({ difficultyAdmin: 3 }, 2, false)).toBe(3)
  })
})

describe('lookupFromModules — сложность слайдов для модели уровня', () => {
  const mods = [
    { id: 'voted', difficulty: 3, difficultyVotes: 7, difficultyAdmin: null },
    { id: 'admin', difficulty: null, difficultyVotes: 0, difficultyAdmin: 2 },
    { id: 'few', difficulty: 3, difficultyVotes: 2, difficultyAdmin: null },
  ]
  it('с порогом голосов: голоса или админ, иначе не известна', () => {
    const l = lookupFromModules(mods, MIN_DIFFICULTY_VOTES)
    expect(l.difficultyOf('voted')).toBe(3)
    expect(l.difficultyOf('admin')).toBe(2)
    expect(l.difficultyOf('few')).toBeNull()
  })
})
