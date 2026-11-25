// Потерянные трофеи переходят к Мии (RaceBossLoot.jsx): чистая геометрия и сроки без DOM. «+N» выплывает от счётчика игрока (слева сверху, .wlXp) к счётчику Мии под ним,
// число Мии вздрагивает. Вся анимация конечная и укладывается в LOOT_TOTAL_MS (владелец 2026-11-25: «простая анимация, если пользователь отвечает неверно или не отвечает»).
export const LOOT_FLY_MS = 450   // «+N» плывёт к счётчику Мии
export const LOOT_BUMP_MS = 250  // число Мии вздрагивает, когда «+N» доплыло
export const LOOT_TOTAL_MS = LOOT_FLY_MS + LOOT_BUMP_MS // 700 мс — потолок всей анимации потери
export const LOOT_OUT_PX = 30    // старт «+N»: столько правее счётчика игрока (значок не лежит на числе и не доходит до середины экрана)

/** Откуда и куда плывёт «+N» (координаты слоя): xp — счётчик игрока { right, cy } или null (его нет на экране — старт правее счётчика Мии), tx, ty — центр числа Мии. → { from: [x, y], to: [x, y] } */
export function lootFlight({ xp = null, tx, ty }) {
  const ok = xp && Number.isFinite(xp.right) && Number.isFinite(xp.cy)
  return { from: ok ? [xp.right + LOOT_OUT_PX, xp.cy] : [tx + LOOT_OUT_PX * 2, ty], to: [tx, ty] }
}
