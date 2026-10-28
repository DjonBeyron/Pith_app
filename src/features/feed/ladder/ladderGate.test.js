import { describe, it, expect, vi } from 'vitest'

// Шлюз тянет модель уровня и бюджет Пита (клиент Supabase) — для чистых проверок хватает заглушек
vi.mock('../../../shared/api/supabase.js', () => ({ supabase: {} }))
const { ladderActive, decideLadder } = await import('./ladderGate.js')

const record = (extra = {}) => ({ firstDay: '2026-10-27', shownDay: '', done: false, ids: [], tries: 0, ...extra })
const env = (extra = {}) => ({ record: record(), sessions: 2, today: '2026-10-28', confident: false, ...extra })

describe('ladderActive — когда лесенка включена', () => {
  it('второй визит в другой день, уровень не уверен, не пройдена — да', () => {
    expect(ladderActive(env())).toBe(true)
  })
  it('первый визит (sessions 1) — нет', () => {
    expect(ladderActive(env({ sessions: 1 }))).toBe(false)
  })
  it('тот же день, что и первая загрузка (вторая вкладка) — нет', () => {
    expect(ladderActive(env({ today: '2026-10-27', sessions: 3 }))).toBe(false)
  })
  it('firstDay не известен (записи нет) — нет: это старый пользователь', () => {
    expect(ladderActive(env({ record: null }))).toBe(false)
    expect(ladderActive(env({ record: record({ firstDay: '' }) }))).toBe(false)
  })
  it('уровень уже уверен — нет', () => {
    expect(ladderActive(env({ confident: true }))).toBe(false)
  })
  it('пройдена (done) — нет', () => {
    expect(ladderActive(env({ record: record({ done: true }) }))).toBe(false)
  })
  it('попытки кончились: новый день не включает, а в день последней — перезагрузка включает', () => {
    expect(ladderActive(env({ record: record({ tries: 3, shownDay: '2026-10-27' }) }))).toBe(false)
    expect(ladderActive(env({ record: record({ tries: 3, shownDay: '2026-10-28' }) }))).toBe(true)
  })
})

describe('decideLadder — план на эту загрузку', () => {
  const mod = (id, d) => ({ id, difficultyAdmin: d, difficulty: null, difficultyVotes: 0 })
  const feed = [mod('e0', 1), mod('e1', 1), mod('e2', 1), mod('m0', 2), mod('m1', 2), mod('m2', 2), mod('h0', 3)]

  it('выключена — пустой план', () => {
    expect(decideLadder(feed, env({ sessions: 1 }))).toEqual([])
  })
  it('включена — план 1,1,2,2,3', () => {
    expect(decideLadder(feed, env()).map(s => s.difficulty)).toEqual([1, 1, 2, 2, 3])
  })
  it('в тот же день по сохранённым id — те же фразы, даже если сид дал бы другие', () => {
    const e = env({ record: record({ shownDay: '2026-10-28', ids: ['e2', 'm2', 'h0'] }) })
    expect(decideLadder(feed, e).map(s => s.id)).toEqual(['e2', 'm2', 'h0'])
  })
  it('сохранённых фраз в ленте больше нет — строим план заново', () => {
    const e = env({ record: record({ shownDay: '2026-10-28', ids: ['gone1', 'gone2'] }) })
    expect(decideLadder(feed, e)).toHaveLength(5)
  })
  it('лесенку не построить (нет средних) — пустой план', () => {
    expect(decideLadder([mod('e0', 1), mod('h0', 3)], env())).toEqual([])
  })
  it('план стабилен для одного дня', () => {
    expect(decideLadder(feed, env())).toEqual(decideLadder([...feed].reverse(), env()))
  })
})
