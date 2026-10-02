// Режим сна («Памяти пора отдыхать»): связь от шапки к ступеням оборвана, как порванный кабель. Обрыв — на горизонтальном
// участке ствола у шапки (общий для всех трёх отводов): отрезки линии на нём вырезаются, у каждого конца торчат
// растрёпанные жилки (изогнутые, часть — «медные»), а в разрыве мигает молния с парой искр. Чистая функция: рисует
// результат MemoryLadderWires.jsx.
// pieces — отрезки ствола (ladderWireSet), pts — точки первого отвода (ladderLinks()[0].pts: [ось шапки, низ шапки],
// [ось, уровень горизонтали], …). → { pieces, strands: [{ d, w, color }], bolt: { x, y }, sparks: [{ x, y, delay }] }
export const TEAR_FROM = 16 // от оси шапки влево до конца «висящего» обрывка, px
export const TEAR_LEN = 64 // длина разрыва, px (на телефоне 38 px читались как «ничего не изменилось» — разрыв и жилки сделаны крупнее)
const COPPER = '#f0a860'
const FRAY = [[-0.8, 17, -3, null], [-0.3, 23, -4, COPPER], [0.3, 21, 4, COPPER], [0.8, 15, 3, null]] // [угол от оси (рад), длина px, изгиб px, цвет (null — цвет линии)]
const SPARKS = [[0.22, -6, 0], [0.78, 5, 0.7]] // [доля разрыва, сдвиг по y, задержка вспышки с]
const r1 = x => Math.round(x * 10) / 10

export function tearWire(pieces, pts) {
  const y = pts[1][1]
  const xr = pts[0][0] - TEAR_FROM
  const xl = xr - TEAR_LEN
  const onRun = p => Math.abs(p.y1 - y) < 0.5 && Math.abs(p.y2 - y) < 0.5
  const cut = []
  const kept = []
  for (const p of pieces) (onRun(p) && (p.x1 + p.x2) / 2 > xl && (p.x1 + p.x2) / 2 < xr ? cut : kept).push(p)
  if (!cut.length) return { pieces, strands: [], bolt: null, sparks: [] }

  // Края разрыва — по самим вырезанным отрезкам (они кратны длине отрезка ствола, а не заданным xl/xr)
  const xs = cut.flatMap(p => [p.x1, p.x2])
  const right = Math.max(...xs)
  const left = Math.min(...xs)
  const near = x => cut.reduce((a, b) => (Math.abs((b.x1 + b.x2) / 2 - x) < Math.abs((a.x1 + a.x2) / 2 - x) ? b : a))
  const strands = []
  for (const [x, dir] of [[right, -1], [left, 1]]) {
    const { w, color } = near(x)
    for (const [a, len, bend, tint] of FRAY) {
      const ex = x + dir * Math.cos(a) * len
      const ey = y + Math.sin(a) * len
      const cx = x + dir * Math.cos(a / 2) * len * 0.5
      const cy = y + Math.sin(a / 2) * len * 0.5 + bend
      strands.push({ d: `M ${r1(x)} ${r1(y)} Q ${r1(cx)} ${r1(cy)} ${r1(ex)} ${r1(ey)}`, w: Math.max(1.2, r1(w * 0.75)), color: tint ?? color })
    }
  }
  const at = t => r1(left + (right - left) * t)
  return {
    pieces: kept,
    strands,
    bolt: { x: at(0.5), y },
    sparks: SPARKS.map(([t, dy, delay]) => ({ x: at(t), y: y + dy, delay })),
  }
}
