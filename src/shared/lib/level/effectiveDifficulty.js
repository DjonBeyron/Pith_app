// Сложность фразы «на слух» 1/2/3 для ленты и модели уровня — одна чистая функция на всех.
// Источники: медиана голосов (curricula.difficulty) важнее, когда голосов достаточно (MIN_DIFFICULTY_VOTES);
// пока голосов мало — сложность, заданная админом (curricula.difficulty_admin). Нет ни того, ни другого → null
// («сложность не известна»: модель уровня тогда не гадает, значок показывает «легко»).

// Пока голосов меньше порога — медиане не верим: один голос фразу не красит настоящим цветом
export const MIN_DIFFICULTY_VOTES = 5

const valid = v => {
  const n = Number(v)
  return n === 1 || n === 2 || n === 3 ? n : null
}

// mod — модуль ленты ({ difficulty, difficultyVotes, difficultyAdmin }); minVotes — порог голосов
export function effectiveDifficulty(mod, minVotes = MIN_DIFFICULTY_VOTES) {
  if (!mod) return null
  if ((mod.difficultyVotes ?? 0) >= minVotes) {
    const voted = valid(mod.difficulty)
    if (voted) return voted
  }
  return valid(mod.difficultyAdmin)
}
