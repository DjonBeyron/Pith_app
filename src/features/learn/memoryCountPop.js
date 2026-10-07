// Где поставить окошко-пояснение счётчика (MemoryCount.jsx): строго по центру экрана по ширине, верх окна чуть ниже
// круга-счётчика, а на верхней кромке — уголок, что смотрит на число (caretX — его положение от левого края окна). Кончик
// уголка ниже и круга орбит, и коробки круглого блока: точки вокруг числа и обводка круга остаются видны.
// rect — коробка круглого блока счётчика (getBoundingClientRect), vw — ширина окна, k — масштаб орбит (--k у кнопки;
// растёт с числом цифр). → { top, left, width, caretX } — всё в px
export const ORBIT_RX = 24 // горизонтальный радиус орбиты при одной цифре, px
const DOT = 4 // половина размера точки + ореол
const GAP = 6 // зазор от круга орбит / низа блока до кончика уголка
const CARET_H = 8 // высота уголка (кончик → верхняя кромка окна)
const EDGE = 16 // поле у краёв экрана
const MAX_W = 320
const CARET_PAD = 22 // уголок не ближе этого к левому/правому краю окна — у скруглённого угла

export function popPlace({ rect, vw, k = 1 }) {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const R = ORBIT_RX * k + DOT // круг, в который вписаны все три орбиты
  const width = Math.min(MAX_W, vw - 2 * EDGE)
  const left = Math.round((vw - width) / 2)
  const caretX = Math.min(width - CARET_PAD, Math.max(CARET_PAD, Math.round(cx - left)))
  const tip = Math.max(cy + R, rect.top + rect.height) + GAP
  return { top: Math.round(tip + CARET_H), left, width: Math.round(width), caretX }
}
