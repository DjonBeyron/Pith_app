import { describe, it, expect, vi } from 'vitest'

vi.mock('../../shared/api/supabase.js', () => ({ supabase: {} }))

const { rankFeedByConfig, buildRankCtx } = await import('./feedRankEngine.js')
const { rankFeed, moduleWords, phraseInfo, daySeed } = await import('./feedKnowledge.js')
const { normalizeConfig } = await import('../../shared/lib/ranking/feedConfig.js')

// Снимок rankFeed ДО появления движка (feedKnowledge.js на 3.2.1989) — страховка,
// что legacy-путь не тронут: результат должен совпадать с ним на разных наборах
function seededOld(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function rankFeedSnapshot(modules, { stepOf, lessonWord, skipped = new Set(), seed = 1 } = {}) {
  if (!stepOf?.size || modules.length < 2) return modules
  const skippedWords = new Set(modules.filter(m => skipped.has(m.id)).flatMap(m => moduleWords(m.lessonIds, lessonWord)))
  const scored = modules.map((m, i) => {
    const words = moduleWords(m.lessonIds, lessonWord)
    const info = phraseInfo(words, stepOf)
    let tier = 1
    if (!words.length) tier = 2
    else if (info.newWords.length === words.length) tier = 3
    else if (info.shaky.length || info.newWords.length <= 2) tier = 0
    if (skipped.has(m.id) || words.some(w => skippedWords.has(w))) tier += 1
    return { m, i, tier, diff: Number(m.difficulty) || 1 }
  })
  scored.sort((a, b) => a.tier - b.tier || (a.tier >= 3 ? a.diff - b.diff : 0) || a.i - b.i)
  const out = scored.map(s => s.m)
  const rand = seededOld(seed)
  for (let pos = 5; pos < out.length - 1; pos += 6) {
    const j = pos + 1 + Math.floor(rand() * (out.length - pos - 1))
    ;[out[pos], out[j]] = [out[j], out[pos]]
  }
  return out
}

const lessonWord = new Map([['to', 'to'], ['try', 'trying'], ['cook', 'cook'], ['keep', 'keep'], ['go', 'going'], ['a', 'apple'], ['b', 'banana']])
const mod = (id, words, extra = {}) => ({ id, lessonIds: ['s', ...words, 'f'], ...extra })
const stepOf = new Map([['trying', 3], ['to', 1], ['keep', 4]])
const sets = [
  // difficultyVotes ≥ порога: weighted чтит порог голосов (displayDifficulty), legacy — сырую difficulty
  [mod('new-hard', ['a'], { difficulty: 3, difficultyVotes: 9 }), mod('no-words', []), mod('new-easy', ['b'], { difficulty: 1, difficultyVotes: 9 }), mod('shaky', ['to', 'cook']), mod('one-new', ['keep', 'go'])],
  Array.from({ length: 14 }, (_, i) => mod(`m${i}`, i < 4 ? ['to'] : ['a'])),
  Array.from({ length: 23 }, (_, i) => mod(`k${i}`, i % 3 ? ['keep', 'cook'] : ['b'], { difficulty: (i % 3) + 1 })),
]
const ranks = [
  { stepOf, lessonWord, skipped: new Set(), seed: daySeed('2026-10-14') },
  { stepOf, lessonWord, skipped: new Set(['shaky', 'm1', 'k4']), seed: daySeed('2026-01-01') },
  { stepOf: new Map(), lessonWord, skipped: new Set(), seed: 5 },
]
const ids = a => a.map(m => m.id)

describe('rankFeedByConfig — legacy', () => {
  it('engine legacy → ровно rankFeed (та же ссылка), конфиг не влияет', () => {
    for (const list of sets) for (const rank of ranks) {
      const legacy = rankFeedByConfig(list, rank, normalizeConfig({ engine: 'legacy', signals: { memory_fit: { enabled: false, weight: 0 } } }))
      expect(ids(legacy)).toEqual(ids(rankFeed(list, rank)))
    }
    expect(rankFeedByConfig(sets[0], null, null)).toBe(sets[0])
  })

  it('legacy совпадает со снимком старой функции', () => {
    for (const list of sets) for (const rank of ranks) {
      expect(ids(rankFeedByConfig(list, rank, normalizeConfig(null)))).toEqual(ids(rankFeedSnapshot(list, rank)))
    }
  })
})

describe('rankFeedByConfig — weighted', () => {
  const cfg = normalizeConfig({ engine: 'weighted' })
  it('с весами по умолчанию порядок близок к legacy (ступени памяти совпадают)', () => {
    const out = ids(rankFeedByConfig(sets[0], ranks[0], cfg))
    expect(out).toEqual(['shaky', 'one-new', 'no-words', 'new-easy', 'new-hard'])
  })
  it('без памяти — порядок админа; пустая память не падает; один модуль — как есть', () => {
    expect(rankFeedByConfig(sets[0], null, cfg)).toBe(sets[0])
    expect(rankFeedByConfig(sets[1], ranks[2], cfg).length).toBe(14)
    expect(rankFeedByConfig([sets[0][0]], ranks[0], cfg)).toEqual([sets[0][0]])
  })
  it('buildRankCtx анализирует слова по lessonWord', () => {
    const c = buildRankCtx(ranks[0])
    expect(c.analyze(mod('x', ['to', 'cook']))).toEqual({ words: ['to', 'cook'], info: { total: 2, known: 0, newWords: ['cook'], shaky: ['to'] } })
    expect(buildRankCtx(null).analyze(mod('x', ['to'])).info.newWords).toEqual([])
  })
})
