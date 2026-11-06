import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadPlanDeps, clearPlanDepsCache, PLAN_TTL_MS } from './racePlanSources.js'
import { summarizePlan, planLogLine, summaryText } from './racePlanSummary.js'

const loaders = (over = {}) => ({
  session: async () => ({ user: { id: 'u1' } }),
  memory: vi.fn(async () => [{ word: 'meet', step: 1 }]),
  curricula: async () => [{ id: 'm1', title: 'Nice to meet you', published: true }],
  lessons: async () => [],
  startedIds: async () => ['m1'],
  phraseRows: async () => [],
  audioMap: async () => ({}),
  ruMap: async () => ({ 'nice to meet you': 'скажи, что рад' }),
  wordAudio: () => new Map([['ru:скажи, что рад', { url: 'u' }]]),
  ...over,
})

beforeEach(() => clearPlanDepsCache())

describe('loadPlanDeps', () => {
  it('грузит все источники, дата — локальная, ошибок нет', async () => {
    const d = await loadPlanDeps({ now: new Date(2026, 10, 6, 12).getTime(), loaders: loaders(), currentId: 'm1' })
    expect(d).toMatchObject({ who: 'user', today: '2026-11-06', startedIds: ['m1'], errors: [], currentId: 'm1' })
    expect(d.memory).toHaveLength(1)
    expect(d.wordAudio).toBeInstanceOf(Map)
  })
  it('ошибка одного источника — пустой источник и причина, остальные на месте', async () => {
    const d = await loadPlanDeps({ loaders: loaders({ curricula: async () => { throw new Error('нет сети') }, ruMap: async () => null }) })
    expect(d.curricula).toEqual([])
    expect(d.ruMap).toEqual({})
    expect(d.errors).toEqual(['curricula: нет сети'])
    expect(d.memory).toHaveLength(1)
  })
  it('кэш на 5 минут на пользователя; force и чужой пользователь грузят заново', async () => {
    const L = loaders()
    await loadPlanDeps({ now: 0, loaders: L })
    await loadPlanDeps({ now: PLAN_TTL_MS - 1, loaders: L })
    expect(L.memory).toHaveBeenCalledTimes(1)
    await loadPlanDeps({ now: PLAN_TTL_MS + 1, loaders: L })
    await loadPlanDeps({ now: PLAN_TTL_MS + 2, force: true, loaders: L })
    await loadPlanDeps({ now: PLAN_TTL_MS + 3, loaders: { ...L, session: async () => null } })
    expect(L.memory).toHaveBeenCalledTimes(4)
  })
})

describe('сводка и журнал [plan]', () => {
  const plan = { source: 'memory', extraWords: [{}, {}], phrases: [
    { text: 'Nice to meet you', own: true, ru: 'скажи, что рад', audio: { url: 'a' } },
    { text: 'How old are you', own: false, ru: '', audio: null },
    { text: 'Thank you', own: false, ru: 'поблагодари', audio: { url: 'b' } },
  ] }
  it('считает свои / дежурные и чего не хватает', () => {
    const s = summarizePlan(plan, { memory: [1, 2, 3], wordAudio: new Map([['ru:скажи, что рад', { url: 'u' }]]), errors: [] })
    expect(s).toMatchObject({ source: 'memory', memoryWords: 3, extraWords: 2, phrases: 3, own: 1, standby: 2, noRu: ['How old are you'], noAudio: ['How old are you'], noRuVoice: ['Thank you'] })
    expect(summaryText(s)).toBe('слов памяти 3 · добор 2 · фраз 3 (свои 1, дежурные 2)')
    expect(planLogLine(s)).toBe('[plan] источник: память · 3 слов памяти, добор 2 · 3 фраз (свои 1 / дежурные 2) · без смысла: How old are you · без озвучки фразы: How old are you · без озвучки смысла: Thank you')
  })
  it('фикстура — короткая строка', () => {
    expect(planLogLine(summarizePlan({ source: 'sim', extraWords: [] }))).toBe('[plan] источник: фикстура · 0 слов памяти, добор 0 · 0 фраз (свои 0 / дежурные 0)')
  })
})
