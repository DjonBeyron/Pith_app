import { MIN_DIFFICULTY_VOTES } from '../../shared/lib/level/effectiveDifficulty.js'

// Подсказка рядом с чипом «Сложность» (AdminDifficultyChip.jsx): сколько голосов и что важнее — голоса или выбор админа
const NAMES = { 1: 'лёгкая', 2: 'средняя', 3: 'сложная' }

export function difficultyHint(votes, median, admin) {
  if (votes >= MIN_DIFFICULTY_VOTES) {
    return `голоса: ${votes}, медиана ${median ?? '—'} (${NAMES[median] ?? 'нет'}) — голоса важнее выбора админа${admin ? `, он сейчас ${admin}` : ''}`
  }
  if (votes > 0) return `голосов ${votes} из ${MIN_DIFFICULTY_VOTES}: пока действует выбор админа`
  return 'голосов нет: действует выбор админа'
}
