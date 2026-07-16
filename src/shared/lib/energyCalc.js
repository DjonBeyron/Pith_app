// Расчёт эффективной энергии на клиенте. Вынесено из EnergyBadge.jsx, чтобы
// тем же расчётом мог пользоваться и LessonLaunchCard (ряд ячеек энергии).
export const ENERGY_CAP = 5
export const ENERGY_TICK_MS = 4 * 3600 * 1000 // 4 часа

// Реальный счётчик: сервер начисляет каплю лениво (при старте урока),
// поэтому эффективное значение и время следующей +1 считаем от
// energy_updated_at прямо на клиенте
export function calcEnergy(profile, now) {
  // Жёсткий потолок: даже если в базе больше (старый бонус новичку) — показываем максимум 5
  const base = Math.min(ENERGY_CAP, Math.max(0, profile.energy ?? 0))
  const t = profile.energy_updated_at ? new Date(profile.energy_updated_at).getTime() : null
  if (base >= ENERGY_CAP || !t) return { value: base, nextAt: null }
  const ticks = Math.floor((now - t) / ENERGY_TICK_MS)
  const value = Math.min(ENERGY_CAP, base + ticks)
  return { value, nextAt: value >= ENERGY_CAP ? null : t + (ticks + 1) * ENERGY_TICK_MS }
}
