// Режим сна («Памяти пора отдыхать»): связь от шапки к ступеням оборвана, как порванный кабель. Обрыв — на горизонтальном
// участке ствола у шапки (общий для всех трёх отводов): отрезки линии на нём вырезаются (разрыв небольшой, ≈20 px), из
// обоих концов торчат по три коротких провода цветов ступеней (синий, жёлтый, салатовый — как «Новые», «Знакомые»,
// «Усвоенные»), чуть вразнобой по углу, длине и порядку цветов, а на кончиках части проводов вспыхивают жёлтые искры —
// у каждой свой период и сдвиг, поэтому моргают в случайные моменты. Чистая функция: рисует результат MemoryLadderWires.jsx.
// pieces — отрезки ствола (ladderWireSet), pts — точки первого отвода (ladderLinks()[0].pts: [ось шапки, низ шапки],
// [ось, уровень горизонтали], …). → { pieces, strands: [{ d, w, color }], sparks: [{ x, y, period, delay }] }
export const TEAR_FROM = 16 // от оси шапки влево до конца «висящего» обрывка, px
export const TEAR_LEN = 20 // длина разрыва, px
const BLUE = '#4fb3ee'
const YELLOW = '#e2cd78'
const GREEN = '#b6fe3b'
// Провода: [угол от оси (рад), длина px, изгиб px, цвет, искра на кончике: [период с, сдвиг с] | null]. Правый край разрыва —
// провода уходят влево, в разрыв; левый — вправо. Порядок цветов и углы разные, чтобы не выглядело штампом
const RIGHT_END = [[-0.9, 6, -1.5, BLUE, [2.7, 0.3]], [0.1, 9, 2, YELLOW, [3.4, 1.6]], [0.75, 7, 2.5, GREEN, null]]
const LEFT_END = [[-0.5, 8, -2, GREEN, null], [0.35, 5.5, 1.5, BLUE, [2.2, 0.9]], [0.95, 8.5, 2.5, YELLOW, [3.9, 2.4]]]
const r1 = x => Math.round(x * 10) / 10

export function tearWire(pieces, pts) {
  const y = pts[1][1]
  const xr = pts[0][0] - TEAR_FROM
  const xl = xr - TEAR_LEN
  const onRun = p => Math.abs(p.y1 - y) < 0.5 && Math.abs(p.y2 - y) < 0.5
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
      strands.push({ d: `M ${r1(x)} ${r1(y)} Q ${r1(cx)} ${r1(cy)} ${r1(ex)} ${r1(ey)}`, w: Math.max(1.2, r1(w * 0.8)), color })
      if (spark) sparks.push({ x: r1(ex), y: r1(ey), period: spark[0], delay: spark[1] })
    }
  }
  return { pieces: kept, strands, sparks }
}
