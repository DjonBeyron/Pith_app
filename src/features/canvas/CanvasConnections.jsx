import { memo } from 'react'
import { triggerAnchor, nodeEntry, nodeBox } from './canvasPorts.js'
import { connectionPath } from './canvasLinePath.js'
import { linkColor } from './canvasLineStyle.js'

// Радиус зоны срабатывания входной точки при перетаскивании порта —
// синхронизирован со SNAP_R в CanvasBoard.
const DROP_R = 40

// layer='back'  → lines only (behind nodes, z-index 0)
// layer='front' → dots only (in front of nodes, z-index 2)
//
// memo — эта функция сама по себе пересчитывает бэзье для КАЖДОЙ связи
// (тригонометрия + строки) на КАЖДЫЙ рендер CanvasBoard.jsx — а он
// перерисовывается на любое hover/selection состояние, не только на
// движение нод. Без memo (и без стабильных nodes/onPortDragStart —
// см. CanvasBoard.jsx) наведение мышью на ноду пересчитывало бы линии
// всего графа заново.
function CanvasConnections({
  nodes, portDrag, onPortDragStart, triggerMeasures = {}, layer,
  // Дальний зум (scale < FAR_ZOOM): рисуем только ядра линий, без ореола
  // и без слоя точек — на таком масштабе это невидимая работа
  far = false,
  // Нода под курсором: её связи рисуются ярче и поверх нод, остальные
  // притухают — так в плотном графе видно, что куда ведёт
  hoveredNodeId = null,
}) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
  // Тела нод — препятствия: линия под ними невидима (слой back), поэтому
  // маршрут обходит их, а не ныряет. Считается и во время протяжки тоже —
  // иначе линия на время драга спрямлялась и «перещёлкивала» изгиб на месте.
  // Бюджет держится за счёт быстрой отбраковки соседей в canvasLinePath.js.
  const boxes = new Map(nodes.map(n => [n.id, nodeBox(n, triggerMeasures)]))
  const allBoxes = [...boxes.values()]

  const lines = nodes.flatMap(node =>
    (node.triggers ?? []).map((t, i) => {
      if (!t.then) return null
      if (portDrag?.fromNodeId === node.id && portDrag?.triggerIdx === i) return null
      const toNode = byId[t.then]
      if (!toNode) return null
      const from = triggerAnchor(node, i, triggerMeasures)
      const to   = nodeEntry(toNode, triggerMeasures)
      const key  = `${node.id}:${i}`
      const d = connectionPath(from.x, from.y, to.x, to.y, key,
        boxes.get(toNode.id), allBoxes, boxes.get(node.id))
      const hot = !!hoveredNodeId && (node.id === hoveredNodeId || toNode.id === hoveredNodeId)
      return {
        key, d, to, toSize: toNode.size, fromNodeId: node.id, triggerIdx: i,
        color: linkColor(t.if), hot,
      }
    }).filter(Boolean)
  )

  const ghost = (() => {
    if (!portDrag) return null
    const fromNode = byId[portDrag.fromNodeId]
    if (!fromNode) return null
    const from = triggerAnchor(fromNode, portDrag.triggerIdx, triggerMeasures)
    // Тянущаяся линия — без обхода: цель ещё не выбрана
    return connectionPath(from.x, from.y, portDrag.x, portDrag.y, 'ghost', null)
  })()

  // ── back layer: only lines ─────────────────────────────────────────
  if (layer === 'back') {
    // Пока курсор на ноде, чужие связи уходят на второй план
    const dim = hoveredNodeId ? 0.22 : 1
    return (
      <>
        {lines.map(({ key, d, color, hot }) => (
          <g key={key} opacity={hot ? 1 : dim}>
            {!far && <path d={d} stroke={color} strokeWidth="7" fill="none" opacity="0.08" />}
            {/* vectorEffect — толщина в пикселях ЭКРАНА, а не мира: иначе на
                отдалении 1.5px умножались на масштаб и связи истончались до
                невидимости раньше, чем граф успевал поместиться в экран */}
            <path d={d} stroke={color} strokeWidth="1.5" fill="none" opacity="0.75"
              vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {ghost && (
          <path d={ghost} stroke="#b6fe3b" strokeWidth="1.5" fill="none"
            opacity="0.45" strokeDasharray="6 4" />
        )}
      </>
    )
  }

  // На дальнем зуме точки портов — доли пикселя: считать и рисовать их
  // (у каждой ноды по точке на триггер) незачем
  if (far) return null

  // ── front layer: подсвеченные связи + точки портов ─────────────────
  // Линии лежат под нодами и в плотных местах просто пропадают. Связи
  // наведённой ноды рисуем ещё раз здесь, поверх всего — видно целиком,
  // включая участки, которые проходят под соседями.
  const hotLines = hoveredNodeId
    ? lines.filter(l => l.hot).map(({ key, d, color }) => (
        <g key={`hot:${key}`} style={{ pointerEvents: 'none' }}>
          <path d={d} stroke="#0b0d10" strokeWidth="6" fill="none" opacity="0.85" />
          <path d={d} stroke={color} strokeWidth="2.5" fill="none" />
        </g>
      ))
    : null

  // ── front layer: dots ──────────────────────────────────────────────
  // Output dots: right of each trigger row in MAX nodes (always visible)
  const outDots = nodes.flatMap(node =>
    node.size !== 'max' ? [] :
    (node.triggers ?? []).map((_, i) => {
      const pos = triggerAnchor(node, i, triggerMeasures)
      const isDragging = portDrag?.fromNodeId === node.id && portDrag?.triggerIdx === i
      return (
        <g key={`out:${node.id}:${i}`} className="portDot"
          onMouseDown={e => { e.stopPropagation(); onPortDragStart?.(node.id, i, e) }}>
          <circle cx={pos.x} cy={pos.y} r={10} fill="transparent" />
          <circle className="portDotInner" cx={pos.x} cy={pos.y} r={5}
            fill={isDragging ? '#fff' : '#b6fe3b'} stroke="#090b0e" strokeWidth="2"
            opacity={isDragging ? 0.3 : 1} />
        </g>
      )
    })
  )

  // Static input dots: left of MAX nodes with triggers (always visible)
  const inDots = nodes
    .filter(n => n.size === 'max' && (n.triggers ?? []).length > 0)
    .map(node => {
      const pos = nodeEntry(node, triggerMeasures)
      return (
        <circle key={`in:${node.id}`} cx={pos.x} cy={pos.y} r={4}
          fill="#b6fe3b" stroke="#090b0e" strokeWidth="1.5" opacity="0.5" />
      )
    })

  // Во время перетаскивания порта: входные точки всех нод-кандидатов
  // пульсируют; та, что в радиусе броска, — крупнее и чаще (готова принять)
  const dropTargets = portDrag ? nodes
    .filter(n => n.id !== portDrag.fromNodeId)
    .map(node => {
      const pos  = nodeEntry(node, triggerMeasures)
      const near = Math.hypot(portDrag.x - pos.x, portDrag.y - pos.y) <= DROP_R
      return (
        <circle
          key={`drop:${node.id}`}
          className={`portDropPulse${near ? ' portDropPulse--near' : ''}`}
          cx={pos.x} cy={pos.y} r={near ? 11 : 6}
          fill="#b6fe3b" stroke="#090b0e" strokeWidth="2"
        />
      )
    }) : null

  // Draggable input dots per active connection — only shown on MAX targets (for reconnect)
  const connInDots = lines
    .filter(l => l.toSize === 'max')
    .map(({ key, to, fromNodeId, triggerIdx }) => (
      <g key={`cin:${key}`} className="portDot"
        onMouseDown={e => { e.stopPropagation(); onPortDragStart?.(fromNodeId, triggerIdx, e) }}>
        <circle cx={to.x} cy={to.y} r={10} fill="transparent" />
        <circle className="portDotInner" cx={to.x} cy={to.y} r={5}
          fill="#b6fe3b" stroke="#090b0e" strokeWidth="2" />
      </g>
    ))

  return (
    <>
      {hotLines}
      {inDots}
      {connInDots}
      {outDots}
      {dropTargets}
    </>
  )
}

// Раскладка (линии/точки) зависит только от геометрии: позиция, размер, тип
// (fallback-высота до первого замера) и сам массив триггеров. Правка текста в
// typeData ноды создаёт новый объект node на каждую напечатанную букву — без
// этого сравнения React.memo видел бы новый nodes[] и заново гонял обход
// препятствий по ВСЕМ 70+ нодам на каждый символ (тормозило набор текста).
function sameGeometry(a, b) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const na = a[i], nb = b[i]
    if (na === nb) continue
    if (na.id !== nb.id || na.x !== nb.x || na.y !== nb.y ||
        na.size !== nb.size || na.type !== nb.type || na.triggers !== nb.triggers) return false
  }
  return true
}

function areEqual(prev, next) {
  return prev.layer === next.layer &&
    prev.portDrag === next.portDrag &&
    prev.onPortDragStart === next.onPortDragStart &&
    prev.triggerMeasures === next.triggerMeasures &&
    prev.hoveredNodeId === next.hoveredNodeId &&
    sameGeometry(prev.nodes, next.nodes)
}

export default memo(CanvasConnections, areEqual)
