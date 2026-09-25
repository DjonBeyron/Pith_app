import { track } from '../../shared/lib/analytics/track.js'

// События аналитики сессии повторения (словарь — track.js):
//   review_start  { words, cards }
//   review_answer { word, result, attempt, ms }
//   review_finish { words, cards, errors, ms, xp }
//   review_abandon { answered, total, ms } — закрыли до итога
// Одна сессия — один трекер; после finish/abandon он молчит.
export function createReviewTracker(send = track, now = Date.now) {
  let s = null
  return {
    start({ words, cards }) {
      s = { at: now(), answered: 0, total: cards, errors: 0 }
      send('review_start', { words, cards })
    },
    answer({ word, result, attempt, timeMs, answered, total }) {
      if (!s) return
      s.answered = answered
      s.total = total
      if (result === 'wrong') s.errors += 1
      send('review_answer', { word, result, attempt, ms: timeMs ?? null })
    },
    finish({ words, xp }) {
      if (!s) return
      send('review_finish', { words, cards: s.total, errors: s.errors, ms: now() - s.at, xp: xp ?? 0 })
      s = null
    },
    abandon() {
      if (!s) return
      send('review_abandon', { answered: s.answered, total: s.total, ms: now() - s.at })
      s = null
    },
  }
}
