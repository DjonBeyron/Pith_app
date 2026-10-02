// План «шариков» в переносе награды XP в полоску уровня (shared/ui/XpTransfer.jsx — итог урока, итог повторения,
// награда стрика): сколько шариков вылетит от счётчика XP к полоске и сколько XP уносит каждый.
// Шариков столько же, сколько XP, но не больше MAX_PARTICLES: получил 3 — три шарика, 9 — девять, 11, 50 и 500 —
// десять. Награда делится между ними ровно (остаток — по единице первым шарикам): каждый отлёт уменьшает счётчик
// на долю шарика, каждое прилёт добавляет эту долю в полоску. Сумма долей всегда равна награде.
export const MAX_PARTICLES = 10

export const particleCount = earned => Math.max(0, Math.min(MAX_PARTICLES, Math.floor(earned) || 0))

// → [доля шарика №1, №2, …]; сумма == earned
export function particleShares(earned) {
  const n = particleCount(earned)
  if (!n) return []
  const total = Math.floor(earned)
  const base = Math.floor(total / n)
  const extra = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0))
}

// Пауза между вылетами: шариков мало — реже (читается глазом), много — чаще, но не быстрее 230 мс.
// Весь перенос укладывается примерно в 2,3–2,8 с
export function departGap(n) {
  return Math.min(420, Math.max(230, 2300 / Math.max(1, n)))
}
