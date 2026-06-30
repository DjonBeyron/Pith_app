import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useCanvasDrag } from '../canvas/useCanvasDrag.js'

const mapLsKey = id => `curr_map_${id}`
const NODE_W = 230; const NODE_H = 52
const FIN_W  = 80;  const FIN_H  = 80

function loadMap(cid) {
  try { return JSON.parse(localStorage.getItem(mapLsKey(cid)) ?? '{}') } catch { return {} }
}

function srand(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(Math.sin(h) * 43758.5453) % 1
}

function neuralBundle(x1, y1, x2, y2, seed, n = 6) {
  const cy = Math.max(Math.abs(y2 - y1) * 0.52, 55)
  return Array.from({ length: n }, (_, i) => {
    const j = k => (srand(seed + k + i) - 0.5)
    const ox1 = j('a') * 14; const oy1 = j('b') * 8
    const ox2 = j('c') * 14; const oy2 = j('d') * 8
    return `M ${x1 + ox1} ${y1} C ${x1 + ox1} ${y1 + cy + oy1},` +
           ` ${x2 + ox2} ${y2 - cy + oy2}, ${x2 + ox2} ${y2}`
  })
}

// Center X for lesson nodes (assuming ~420px canvas)
const CX = 95 // (420 - NODE_W) / 2

function portOutOf(pos) { return { x: pos.x + NODE_W / 2, y: pos.y + NODE_H } }
function portInOf(pos, kind)   {
  if (kind === 'FINAL') return { x: pos.x + FIN_W / 2, y: pos.y }
  return { x: pos.x + NODE_W / 2, y: pos.y }
}

function defaultPositions(lessons) {
  const pos = {}
  pos['START'] = { x: CX, y: 30 }
  lessons.forEach((l, i) => { pos[l.id] = { x: CX, y: 130 + i * 80 } })
  // Center FINAL: CX + (NODE_W - FIN_W)/2 to align visually
  pos['FINAL'] = { x: CX + (NODE_W - FIN_W) / 2, y: 130 + lessons.length * 80 + 20 }
  return pos
}

export default function LessonMapCanvas({
  curriculumId, lessons, onPlayLesson, onEditLesson, onDeleteLesson,
}) {
  const saved = loadMap(curriculumId)

  const [userPos, setUserPos]         = useState(() => saved.positions ?? {})
  const [connections, setConnections] = useState(() => saved.connections ?? [])
  const [offset, setOffset]           = useState(() => saved.offset ?? { x: 0, y: 0 })
  const [scale, setScale]             = useState(() => saved.scale ?? 1)
  const [portDrag, setPortDrag]       = useState(null)
  const [hovered, setHovered]         = useState(null)
  const [didCenter, setDidCenter]     = useState(() => !!saved.offset)

  const boardRef    = useRef(null)
  const scaleRef    = useRef(scale)
  const portDragRef = useRef(null)
  const savedRef    = useRef(false)

  // Auto-center graph in viewport on first open (no saved offset)
  useEffect(() => {
    if (didCenter || !boardRef.current) return
    const { width, height } = boardRef.current.getBoundingClientRect()
    const graphH = NODE_H + 100 + lessons.length * 80 + FIN_H
    setOffset({
      x: (width - NODE_W) / 2 - CX,
      y: Math.max(20, (height - graphH) / 2),
    })
    setDidCenter(true)
  }, [didCenter, lessons.length])

  const positions = useMemo(() => {
    const def = defaultPositions(lessons)
    const pos = {}
    ;['START', ...lessons.map(l => l.id), 'FINAL'].forEach(id => {
      pos[id] = userPos[id] ?? def[id]
    })
    return pos
  }, [userPos, lessons])

  const moveNode = useCallback((id, dx, dy) =>
    setUserPos(prev => {
      const cur = prev[id] ?? positions[id] ?? { x: 0, y: 0 }
      return { ...prev, [id]: { x: cur.x + dx, y: cur.y + dy } }
    }), [positions])

  const pan = useCallback((dx, dy) =>
    setOffset(o => ({ x: o.x + dx, y: o.y + dy })), [])

  const { startNodeDrag, startCanvasDrag, onMouseMove, endDrag, wasDragged } =
    useCanvasDrag({ onNodeMove: moveNode, onPan: pan, scaleRef })

  function toWorld(cx, cy) {
    const rect = boardRef.current.getBoundingClientRect()
    return { x: (cx - rect.left - offset.x) / scale, y: (cy - rect.top - offset.y) / scale }
  }

  function nodeAtPos(wx, wy, excludeId) {
    return ['START', ...lessons.map(l => l.id), 'FINAL'].find(id => {
      if (id === excludeId) return false
      const pos = positions[id]; if (!pos) return false
      const w = id === 'FINAL' ? FIN_W : NODE_W
      const h = id === 'FINAL' ? FIN_H : NODE_H
      return wx >= pos.x && wx <= pos.x + w && wy >= pos.y && wy <= pos.y + h
    })
  }

  function startPort(fromId, e) {
    e.stopPropagation()
    portDragRef.current = { fromId, ...toWorld(e.clientX, e.clientY) }
    setPortDrag(portDragRef.current)
  }

  function handleMouseMove(e) {
    if (portDragRef.current) {
      portDragRef.current = { ...portDragRef.current, ...toWorld(e.clientX, e.clientY) }
      setPortDrag(portDragRef.current); return
    }
    onMouseMove(e)
  }

  function handleMouseUp(e) {
    if (portDragRef.current) {
      const { fromId } = portDragRef.current
      const { x, y } = toWorld(e.clientX, e.clientY)
      const toId = nodeAtPos(x, y, fromId)
      if (toId && toId !== 'START' && toId !== fromId) {
        setConnections(prev => [...prev.filter(c => c.from !== fromId), { from: fromId, to: toId }])
      }
      portDragRef.current = null; setPortDrag(null); return
    }
    endDrag()
  }

  useEffect(() => {
    const el = boardRef.current; if (!el) return
    function onWheel(e) {
      e.preventDefault()
      const f = e.deltaY > 0 ? 0.9 : 1.1; const cur = scaleRef.current
      const next = Math.min(2.5, Math.max(0.25, cur * f))
      const rect = el.getBoundingClientRect()
      scaleRef.current = next; setScale(next)
      setOffset(o => ({
        x: (e.clientX - rect.left) - (next / cur) * ((e.clientX - rect.left) - o.x),
        y: (e.clientY - rect.top)  - (next / cur) * ((e.clientY - rect.top)  - o.y),
      }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (!savedRef.current) { savedRef.current = true; return }
    const t = setTimeout(() =>
      localStorage.setItem(mapLsKey(curriculumId),
        JSON.stringify({ positions: userPos, connections, offset, scale })), 400)
    return () => clearTimeout(t)
  }, [curriculumId, userPos, connections, offset, scale])

  const svg   = `translate(${offset.x},${offset.y}) scale(${scale})`
  const world = `translate(${offset.x}px,${offset.y}px) scale(${scale})`

  const lines = connections.map(c => {
    const fp = positions[c.from]; const tp = positions[c.to]
    if (!fp || !tp) return null
    const from = portOutOf(fp)
    const to   = portInOf(tp, c.to === 'FINAL' ? 'FINAL' : '')
    const key  = `${c.from}-${c.to}`
    return { key, paths: neuralBundle(from.x, from.y, to.x, to.y, key), fromId: c.from }
  }).filter(Boolean)

  const ghostPaths = (() => {
    if (!portDrag) return null
    const fp = positions[portDrag.fromId]; if (!fp) return null
    const from = portOutOf(fp)
    return neuralBundle(from.x, from.y, portDrag.x, portDrag.y, 'ghost', 3)
  })()

  function renderNode(id, pos, label, kind) {
    const isStart  = kind === 'START'
    const isFinal  = kind === 'FINAL'
    const isLesson = kind === 'LESSON'
    return (
      <div key={id}
        className={`lmNode${isFinal ? ' lmFinal' : isStart ? ' lmStart' : ''}`}
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={e => startNodeDrag(id, e)}
        onMouseEnter={() => setHovered(id)}
        onMouseLeave={() => setHovered(null)}
        onClick={() => { if (!wasDragged() && isLesson) onPlayLesson(id) }}>
        {!isStart && <div className="lmPortIn" />}
        <span className="lmNodeTitle">{label}</span>
        {isLesson && hovered === id ? (
          <div className="lmNodeActions" onMouseDown={e => e.stopPropagation()}>
            <button className="lmNodeEditBtn"
              onClick={e => { e.stopPropagation(); onEditLesson(id) }} title="Редактировать">⚙</button>
            <button className="lmNodeDelBtn"
              onClick={e => { e.stopPropagation(); onDeleteLesson(id) }} title="Удалить">✕</button>
          </div>
        ) : isLesson ? (
          <button className="lmNodePlayBtn"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onPlayLesson(id) }}>▶</button>
        ) : null}
        {!isFinal && <div className="lmPortOut" onMouseDown={e => startPort(id, e)} />}
      </div>
    )
  }

  return (
    <div ref={boardRef} className="lessonMapBoard"
      onMouseDown={startCanvasDrag} onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>

      <svg className="lessonMapSvg">
        <g transform={svg}>
          {lines.map(({ key, paths, fromId }) => (
            <g key={key} className="lmLine"
              onDoubleClick={() => setConnections(prev => prev.filter(c => c.from !== fromId))}>
              {paths.map((d, i) => (
                <path key={i} d={d} stroke="#c0c5d4" strokeWidth="1" fill="none"
                  opacity={0.08 + i * 0.015} />
              ))}
            </g>
          ))}
          {ghostPaths?.map((d, i) => (
            <path key={i} d={d} stroke="#c0c5d4" strokeWidth="1" fill="none"
              opacity="0.1" strokeDasharray="5 4" />
          ))}
        </g>
      </svg>

      <div className="lessonMapWorld" style={{ transform: world, transformOrigin: '0 0' }}>
        {positions['START'] && renderNode('START', positions['START'], 'START', 'START')}
        {lessons.map(l => positions[l.id] &&
          renderNode(l.id, positions[l.id], l.title, 'LESSON'))}
        {positions['FINAL'] && renderNode('FINAL', positions['FINAL'], 'Final', 'FINAL')}
      </div>

      {lessons.length === 0 && (
        <div className="lmEmptyHint">Нажми «+ Добавить урок» чтобы начать</div>
      )}
    </div>
  )
}
