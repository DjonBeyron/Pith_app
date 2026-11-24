// Полёт потерянных трофеев к Мии (RaceBossLoot.jsx): чистая геометрия без DOM. Трофеи слетают со шкалы — от её «ствола» справа, с высоты линии слова (там же стоит треугольник слова), — к числу «у Мии» на коробке.
export const LOOT_FLY_MS = 650   // сколько летит один значок
export const LOOT_STEP_MS = 90   // значки вылетают друг за другом
export const LOOT_BUMP_MS = 280  // число «у Мии» вздрагивает
export const LOOT_EDGE_PX = 34   // старт: столько от правого края сцены (у рисок шкалы, не на самом «стволе» — треугольник не закрываем)

/** Откуда и куда летит значок: w, h — размер сцены, lineY — высота линии слова от верха сцены (null — линии нет: середина сцены), tx, ty — центр числа «у Мии». → { from: [x, y], tx, ty } */
export function lootFlight({ w, h, lineY = null, tx, ty }) {
  const y = lineY == null || !Number.isFinite(lineY) ? h / 2 : Math.min(h - 24, Math.max(24, lineY))
  return { from: [Math.max(0, w - LOOT_EDGE_PX), y], tx, ty }
}
