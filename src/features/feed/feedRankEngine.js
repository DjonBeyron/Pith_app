import { MIN_DIFFICULTY_VOTES } from '../../shared/api/difficultyApi.js'
import { rankModulesOrder } from '../../shared/lib/ranking/rankWeighted.js'
import { rankFeed, moduleWords, phraseInfo } from './feedKnowledge.js'

// Переключатель движка порядка ленты (PROJECT.md → «Движок сигналов ленты»):
//   engine 'legacy'   — ТОЧНО прежний rankFeed (feedKnowledge.js), конфиг не влияет;
//   engine 'weighted' — взвешенная сумма сигналов (shared/lib/ranking/rankWeighted.js).
// rank — { stepOf, lessonWord, skipped, seed } | null (память ещё грузится).
// Без памяти (rank null) оба пути отдают порядок админа — первая выдача ждёт
// память до RANK_WAIT_MS (useFeedModules), дальше круг держит latchRank.

export function buildRankCtx(rank) {
  const lessonWord = rank?.lessonWord
  return {
    stepOf: rank?.stepOf,
    skipped: rank?.skipped ?? new Set(),
    seed: rank?.seed ?? 1,
    minDifficultyVotes: MIN_DIFFICULTY_VOTES,
    analyze(m) {
      const words = moduleWords(m.lessonIds, lessonWord)
      return { words, info: rank?.stepOf ? phraseInfo(words, rank.stepOf) : { total: words.length, newWords: words, shaky: [] } }
    },
  }
}

export function rankFeedByConfig(modules, rank, config) {
  if (config?.engine !== 'weighted') return rankFeed(modules, rank ?? undefined)
  if (!rank || modules.length < 2) return modules
  return rankModulesOrder(modules, buildRankCtx(rank), config)
}
