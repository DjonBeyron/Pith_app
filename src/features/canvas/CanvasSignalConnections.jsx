import { memo } from 'react'
import { nodeEntry, nodeBox, signalSlotAnchor } from './canvasPorts.js'
import { connectionPath } from './canvasLinePath.js'
import { tableSlots, phraseAssemblySlots } from '../../shared/lib/signalSlots.js'

// Дашед-связи «сигналов ошибок» (signals[] у table/phrase_assembly, см.
// PROJECT.md) — визуально ДРУГОЙ вид линии, чем обычные сплошные бэзье
// переходов (CanvasConnections.jsx): пунктир + подпись слота + значок
// возврата у входа в ноду-сигнал (означает, что поток идёт «туда и
// обратно», а не продолжает граф дальше). Анкеры и обход тел нод — та же
// геометрия (canvasPorts.js/canvasLinePath.js), что и у обычных связей —
// не переизобретаем маршрутизацию заново, только красим и подписываем иначе.
//
// У каждого слота — своя перетаскиваемая точка-порт (см. canvasPorts.js/
// signalSlotAnchor и useCanvasSignalPortDrag.js), та же механика, что у
// портов триггера в CanvasConnections.jsx: outDots (выход на слот),
// connInDots (перецепить уже существующую связь за её конец), dropTargets
// (пульсация кандидатов во время протяжки), ghost (тянущаяся линия).
const SIGNAL_COLOR = '#f87171'
const DROP_R = 40

function slotsOf(node) {
  const t = node.typeData?.[node.type] ?? {}
  if (node.type === 'table') return tableSlots(t.answer, t.table?.cells)
  if (node.type === 'phrase_assembly') return phraseAssemblySlots(t.words)
  return []
}

// Порты для создания/перетяжки сигнала показываем только там, где реально
// виден пикер NodeSignalsPicker.jsx: у phrase_assembly всегда, у table —
// только в ручном режиме (в «Авто»/«Показ» слотов ответа нет вовсе)
function isSignalCapable(node) {
  if (node.type === 'phrase_assembly') return true
  if (node.type === 'table') return (node.typeData?.table?.mode ?? 'dictator') === 'manual'
  return false
}

function CanvasSignalConnections({ nodes, triggerMeasures = {}, signalMeasures = {}, signalDrag, onSignalDragStart }) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
  const boxes = new Map(nodes.map(n => [n.id, nodeBox(n, triggerMeasures)]))
  const allBoxes = [...boxes.values()]

  const items = nodes.flatMap(node => {
    if (node.type !== 'table' && node.type !== 'phrase_assembly') return []
    const signals = node.typeData?.[node.type]?.signals ?? []
    if (!signals.length) return []
    const slots = slotsOf(node)
    return signals.map(s => {
      // Слот сейчас тянут — рисуем призрачную линию вместо застывшей связи
      if (signalDrag?.fromNodeId === node.id && signalDrag?.slotIndex === s.slot) return null
      const target = byId[s.ref]
      if (!target) return null
      const from = signalSlotAnchor(node, s.slot, signalMeasures)
      const to = nodeEntry(target, triggerMeasures)
      const key = `sig:${node.id}:${s.slot}`
      const d = connectionPath(from.x, from.y, to.x, to.y, key,
        boxes.get(target.id), allBoxes, boxes.get(node.id))
      const label = `слот ${s.slot + 1}: ${slots[s.slot]?.label || '—'}`
      return { key, d, to, label, fromNodeId: node.id, slotIndex: s.slot, toSize: target.size }
    }).filter(Boolean)
  })

  const ghost = (() => {
    if (!signalDrag) return null
    const fromNode = byId[signalDrag.fromNodeId]
    if (!fromNode) return null
    const from = signalSlotAnchor(fromNode, signalDrag.slotIndex, signalMeasures)
    return connectionPath(from.x, from.y, signalDrag.x, signalDrag.y, 'sig-ghost', null)
  })()

  // Выходные точки: по одному кружку на каждый слот источника — только у
  // развёрнутых нод (там же живёт NodeSignalsPicker.jsx со строками слотов)
  const outDots = nodes.flatMap(node => {
    if (node.size !== 'max' || !isSignalCapable(node)) return []
    return slotsOf(node).map(slot => {
      const pos = signalSlotAnchor(node, slot.index, signalMeasures)
      const isDragging = signalDrag?.fromNodeId === node.id && signalDrag?.slotIndex === slot.index
      return (
        <g key={`sigout:${node.id}:${slot.index}`} className="portDot"
          onMouseDown={e => { e.stopPropagation(); onSignalDragStart?.(node.id, slot.index, e) }}>
          <circle cx={pos.x} cy={pos.y} r={10} fill="transparent" />
          <circle className="portDotInner" cx={pos.x} cy={pos.y} r={5}
            fill={isDragging ? '#fff' : SIGNAL_COLOR} stroke="#090b0e" strokeWidth="2"
            opacity={isDragging ? 0.3 : 1} />
        </g>
      )
    })
  })

  // Перецепить существующую связь: перетаскиваемая точка на её конце —
  // только когда цель max (тот же приём, что connInDots в CanvasConnections.jsx)
  const connInDots = items
    .filter(it => it.toSize === 'max')
    .map(({ key, to, fromNodeId, slotIndex }) => (
      <g key={`sigcin:${key}`} className="portDot"
        onMouseDown={e => { e.stopPropagation(); onSignalDragStart?.(fromNodeId, slotIndex, e) }}>
        <circle cx={to.x} cy={to.y} r={10} fill="transparent" />
        <circle className="portDotInner" cx={to.x} cy={to.y} r={5}
          fill={SIGNAL_COLOR} stroke="#090b0e" strokeWidth="2" />
      </g>
    ))

  // Во время протяжки сигнала: входные точки нод-кандидатов пульсируют, та,
  // что в радиусе броска, — крупнее и чаще (готова принять)
  const dropTargets = signalDrag ? nodes
    .filter(n => n.id !== signalDrag.fromNodeId)
    .map(node => {
      const pos = nodeEntry(node, triggerMeasures)
      const near = Math.hypot(signalDrag.x - pos.x, signalDrag.y - pos.y) <= DROP_R
      return (
        <circle key={`sigdrop:${node.id}`}
          className={`portDropPulse${near ? ' portDropPulse--near' : ''}`}
          cx={pos.x} cy={pos.y} r={near ? 11 : 6}
          fill={SIGNAL_COLOR} stroke="#090b0e" strokeWidth="2" />
      )
    }) : null

  if (!items.length && !outDots.length && !ghost) return null

  return (
    <>
      {items.map(({ key, d, to, label }) => (
        <g key={key} opacity="0.85">
          <path d={d} stroke={SIGNAL_COLOR} strokeWidth="1.5" fill="none"
            strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
          {/* Значок возврата у входа в ноду-сигнал — поток заходит и
              возвращается к тому же месту, а не продолжает граф */}
          <g transform={`translate(${to.x},${to.y})`}>
            <circle r="7" fill="#12141a" stroke={SIGNAL_COLOR} strokeWidth="1.5" />
            <path d="M -3,-2.5 A 4,4 0 1 1 -3,2.5" stroke={SIGNAL_COLOR} strokeWidth="1.2"
              fill="none" strokeLinecap="round" />
            <path d="M -3,2.5 L -1.1,0.9 M -3,2.5 L -4.9,1.5" stroke={SIGNAL_COLOR}
              strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </g>
          <text x={to.x} y={to.y - 12} fontSize="9" fill={SIGNAL_COLOR} textAnchor="middle">
            {label}
          </text>
        </g>
      ))}
      {ghost && (
        <path d={ghost} stroke={SIGNAL_COLOR} strokeWidth="1.5" fill="none"
          opacity="0.45" strokeDasharray="6 4" />
      )}
      {connInDots}
      {outDots}
      {dropTargets}
    </>
  )
}

export default memo(CanvasSignalConnections)
