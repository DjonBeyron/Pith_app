// Режим сна («Памяти пора отдыхать»): связь от круга-счётчика к ступеням оборвана, как порванный кабель. Обрыв — на
// горизонтальном участке ствола ЛЕВЕЕ круга (общий для всех трёх отводов), в TEAR_FROM px от выхода из круга — труба-раздув
// у круга (24 px) остаётся целой; участок шапка → круг справа цел. Отрезки линии в разрыве вырезаются (разрыв крупный,
// ≈50–58 px; на узком экране, где горизонтальный участок короче, разрыв ужимается, чтобы не залезть на скругление к стволу —
// TEAR_KEEP px участка у ствола остаются целыми), из обоих концов торчат по три провода цветов ступеней (салатовый,
// небесный, золотистый — «Новые», «Знакомые», «Усвоенные»), чуть вразнобой по углу, длине и порядку цветов, а на кончиках
// части проводов вспыхивают жёлтые искры — у каждой свой период и сдвиг, поэтому моргают в случайные моменты. Чистая
// функция: рисует результат MemoryLadderWires.jsx. pieces — отрезки ствола (ladderWireSet), anchor — { x, y }: выход линии
// из круга слева (ladderWireSet().tearAt). → { pieces, strands: [{ d, w, color }], sparks: [{ x, y, period, delay }] }
export const TEAR_FROM = 36 // от выхода из круга влево до правого края разрыва, px
export const TEAR_LEN = 58 // длина разрыва, px (отрезки ствола по 8 px: реальный разрыв на 0–8 px короче)
export const TEAR_KEEP = 6 // у левого конца горизонтального участка (перед скруглением к стволу) линия цела, px
const GREEN = '#b6fe3b' // салатовый — «Новые»
const BLUE = '#4fb3ee' // небесный — «Знакомые»
const YELLOW = '#f1bd3c' // золотистый — «Усвоенные»
// Провода: [угол от оси (рад), длина px, изгиб px, цвет, искра на кончике: [период с, сдвиг с] | null]. Правый край разрыва —
// провода уходят влево, в разрыв; левый — вправо. Порядок цветов и углы разные, чтобы не выглядело штампом
const RIGHT_END = [[-0.9, 12, -3, GREEN, [2.7, 0.3]], [0.1, 18, 4, YELLOW, [3.4, 1.6]], [0.75, 14, 5, BLUE, null]]
const LEFT_END = [[-0.5, 16, -4, BLUE, null], [0.35, 11, 3, GREEN, [2.2, 0.9]], [0.95, 17, 5, YELLOW, [3.9, 2.4]]]
// Толщина провода — от толщины ствола у разрыва, но не тоньше STRAND_MIN
const STRAND_K = 1.4
const STRAND_MIN = 2.2
const r1 = x => Math.round(x * 10) / 10

export function tearWire(pieces, anchor) {
  const y = anchor.y
  const onRun = p => Math.abs(p.y1 - y) < 0.5 && Math.abs(p.y2 - y) < 0.5
  // Строго горизонтальные отрезки левее круга (первый кусочек дуги скругления не в счёт)
  const run = pieces.filter(p => onRun(p) && Math.abs(p.y1 - p.y2) < 0.01 && Math.max(p.x1, p.x2) <= anchor.x + 0.5)
  if (!run.length) return { pieces, strands: [], sparks: [] }
  const xr = anchor.x - TEAR_FROM
  // Левый край — не дальше начала горизонтального участка (плюс целый кусок TEAR_KEEP)
  const runL = Math.min(...run.flatMap(p => [p.x1, p.x2]))
  const xl = Math.max(xr - TEAR_LEN, runL + TEAR_KEEP)
  const cut = []
  const kept = []
  for (const p of pieces) (onRun(p) && (p.x1 + p.x2) / 2 > xl && (p.x1 + p.x2) / 2 < xr ? cut : kept).push(p)
  if (!cut.length) return { pieces, strands: [], sparks: [] }

  // Края разрыва — по самим вырезанным отрезкам (они кратны длине отрезка ствола, а не заданным xl/xr)
  const xs = cut.flatMap(p => [p.x1, p.x2])
  const right = Math.max(...xs)
  const left = Math.min(...xs)
  const near = x => cut.reduce((a, b) => (Math.abs((b.x1 + b.x2) / 2 - x) < Math.abs((a.x1 + a.x2) / 2 - x) ? b : a))
  const strands = []
  const sparks = []
  for (const [x, dir, wires] of [[right, -1, RIGHT_END], [left, 1, LEFT_END]]) {
    const { w } = near(x)
    for (const [a, len, bend, color, spark] of wires) {
      const ex = x + dir * Math.cos(a) * len
      const ey = y + Math.sin(a) * len
      const cx = x + dir * Math.cos(a / 2) * len * 0.5
      const cy = y + Math.sin(a / 2) * len * 0.5 + bend
      strands.push({ d: `M ${r1(x)} ${r1(y)} Q ${r1(cx)} ${r1(cy)} ${r1(ex)} ${r1(ey)}`, w: Math.max(STRAND_MIN, r1(w * STRAND_K)), color })
      if (spark) sparks.push({ x: r1(ex), y: r1(ey), period: spark[0], delay: spark[1] })
    }
  }
  return { pieces: kept, strands, sparks }
}
