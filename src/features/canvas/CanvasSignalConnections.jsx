import { memo } from 'react'
import { nodeEntry, nodeBox } from './canvasPorts.js'
import { connectionPath } from './canvasLinePath.js'
import { tableSlots, phraseAssemblySlots } from '../../shared/lib/signalSlots.js'

// Дашед-связи «сигналов ошибок» (signals[] у table/phrase_assembly, см.
// PROJECT.md) — визуально ДРУГОЙ вид линии, чем обычные сплошные бэзье
// переходов (CanvasConnections.jsx): пунктир + подпись слота + значок
// возврата у входа в ноду-сигнал (означает, что поток идёт «туда и
// обратно», а не продолжает граф дальше). Анкеры и обход тел нод — та же
// геометрия (canvasPorts.js/canvasLinePath.js), что и у обычных связей —
// не переизобретаем маршрутизацию заново, только красим и подписываем иначе.
const SIGNAL_COLOR = '#f87171'

function slotsOf(node) {
  const t = node.typeData?.[node.type] ?? {}
  if (node.type === 'table') return tableSlots(t.answer, t.table?.cells)
  if (node.type === 'phrase_assembly') return phraseAssemblySlots(t.words)
  return []
}

function CanvasSignalConnections({ nodes, triggerMeasures = {} }) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
  const boxes = new Map(nodes.map(n => [n.id, nodeBox(n, triggerMeasures)]))
  const allBoxes = [...boxes.values()]

  const items = nodes.flatMap(node => {
    if (node.type !== 'table' && node.type !== 'phrase_assembly') return []
    const signals = node.typeData?.[node.type]?.signals ?? []
    if (!signals.length) return []
    const slots = slotsOf(node)
    return signals.map(s => {
      const target = byId[s.ref]
      if (!target) return null
      const fromBox = boxes.get(node.id)
      // Выход не привязан к конкретной строке триггера (сигнал — не часть
      // пары «верно/неверно»), поэтому анкер — правый край ноды по центру
      const from = { x: fromBox.right + 8, y: (fromBox.top + fromBox.bottom) / 2 }
      const to = nodeEntry(target, triggerMeasures)
      const key = `sig:${node.id}:${s.slot}`
      const d = connectionPath(from.x, from.y, to.x, to.y, key,
        boxes.get(target.id), allBoxes, fromBox)
      const label = `слот ${s.slot + 1}: ${slots[s.slot]?.label || '—'}`
      return { key, d, to, label }
    }).filter(Boolean)
  })

  if (!items.length) return null

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
    </>
  )
}

export default memo(CanvasSignalConnections)
