import { useMemo } from 'react'
import { moduleWords, phraseInfo, feedChip, daySeed } from './feedKnowledge.js'
import { quickSkips } from './feedSkips.js'
import { localToday } from '../review/reviewDecks.js'

// Память слов в ленте (feedKnowledge.js): rank — вход для порядка
// рекомендаций (useFeedModules), knowledgeOf(module) — метка и подсветка
// знакомых слов для слайда. Пересчитывается, когда обновились данные
// «Моего обучения» (learnView); быстрые пролистывания подхватываются тогда же.
// Вынесено из FeedTab.jsx
export function useFeedKnowledge(learnView) {
  const rank = useMemo(() => (learnView
    ? { stepOf: learnView.stepOf, lessonWord: learnView.lessonWord, skipped: quickSkips(), seed: daySeed(localToday()) }
    : null), [learnView])

  function knowledgeOf(m) {
    if (!rank) return null
    const info = phraseInfo(moduleWords(m.lessonIds, rank.lessonWord), rank.stepOf)
    return { chip: feedChip(info, rank.stepOf.size > 0), stepOf: rank.stepOf }
  }

  return { rank, knowledgeOf }
}
