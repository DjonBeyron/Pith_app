// Где поставить окошко-пояснение счётчика (MemoryCount.jsx). Если слева от числа
// хватает места, окно ставится правым верхним углом к цифре — по диагонали вниз
// и влево, с отступом, чтобы точки на орбитах вокруг числа оставались видны.
// Иначе (узкий экран) — под кнопкой счётчика, как раньше.
// rect — коробка кнопки счётчика (getBoundingClientRect), vw — ширина окна,
// k — масштаб орбит (--k у кнопки; растёт с числом цифр)
export const ORBIT_RX = 24 // горизонтальный радиус орбиты при одной цифре, px
const DOT = 4 // половина размера точки + ореол
const GAP = 4 // зазор от круга орбит до угла окна
const EDGE = 16 // поле у левого края экрана
const MIN_W = 230 // уже этого окно не делаем — лучше под кнопкой
const MAX_W = 280

export function popPlace({ rect, vw, k = 1 }) {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const R = ORBIT_RX * k + DOT // круг, в который вписаны все три орбиты
  const d = (R + GAP) / Math.SQRT2 // угол — на диагонали, на расстоянии R + GAP от центра
  const cornerX = cx - d
  const room = Math.floor(cornerX - EDGE)
  if (room >= MIN_W) {
    return { corner: true, top: Math.round(cy + d), right: Math.round(vw - cornerX), width: Math.min(MAX_W, room) }
  }
  return { corner: false, top: Math.round(rect.bottom + 4) }
}
