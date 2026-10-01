import { useMemo } from 'react'
import { daySeed } from './feedKnowledge.js'
import { quickSkips } from './feedSkips.js'
import { localToday } from '../review/reviewDecks.js'

// Память слов в ленте (feedKnowledge.js): rank — вход для порядка
// рекомендаций (useFeedModules), knowledgeOf — подсветка знакомых слов цветом
// силы для слайда (текстовой метки под фразой нет — убрана 2026-10-01). Пересчитывается, когда обновились данные
// «Моего обучения» (learnView); быстрые пролистывания подхватываются тогда же.
// Вынесено из FeedTab.jsx
export function useFeedKnowledge(learnView) {
  const rank = useMemo(() => (learnView
    ? { stepOf: learnView.stepOf, lessonWord: learnView.lessonWord, skipped: quickSkips(), seed: daySeed(localToday()) }
    : null), [learnView])

  const knowledgeOf = () => (rank ? { stepOf: rank.stepOf } : null)

  return { rank, knowledgeOf }
}
