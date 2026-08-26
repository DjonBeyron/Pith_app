import { dbg } from '../../shared/lib/debug.js'
import { triggerAnchor, nodeEntry } from './canvasPorts.js'
import { connectionPath } from './canvasLinePath.js'

// Диагностика связей холста: сколько переходов задано в данных, сколько из
// них реально превращается в линию и где обрыв. Нужна, когда на холсте
// «нет линий»: сразу видно, это пустые then, потерянные цели, пустой путь —
// или линии строятся, а не видно их по какой-то другой причине.
export function linkDiagnostics(nodes, triggerMeasures = {}) {
  const byId = Object.fromEntries((nodes ?? []).map(n => [n.id, n]))
  const segments = []
  let withThen = 0
  let missingTarget = 0
  let emptyPath = 0

  for (const node of nodes ?? []) {
    ;(node.triggers ?? []).forEach((t, i) => {
      if (!t.then) return
      withThen++
      const to = byId[t.then]
      if (!to) { missingTarget++; return }
      const from = triggerAnchor(node, i, triggerMeasures)
      const end  = nodeEntry(to, triggerMeasures)
      const d = connectionPath(from.x, from.y, end.x, end.y, `${node.id}:${i}`, null)
      if (!d) emptyPath++
      segments.push({
        key: `${node.id}:${i}`,
        x1: from.x, y1: from.y, x2: end.x, y2: end.y,
        ok: !!d,
      })
    })
  }

  return {
    nodes: nodes?.length ?? 0,
    triggers: (nodes ?? []).reduce((s, n) => s + (n.triggers?.length ?? 0), 0),
    withThen,
    missingTarget,
    emptyPath,
    drawn: segments.filter(s => s.ok).length,
    segments,
  }
}

export function linkDebugSummary(d, scale) {
  return [
    `нод ${d.nodes}`,
    `триггеров ${d.triggers}`,
    `связей ${d.withThen}`,
    `линий ${d.drawn}`,
    d.missingTarget ? `цель не найдена: ${d.missingTarget}` : null,
    d.emptyPath ? `пустой путь: ${d.emptyPath}` : null,
    `зум ${Math.round((scale ?? 1) * 100)}%`,
  ].filter(Boolean).join(' · ')
}

// Тот же разбор — в консоль, чтобы его можно было просто скопировать из
// логов, не ловя момент на экране. Пишется один раз при включении отладки.
export function logLinkDebug(d, { scale, offset, boardRect }) {
  dbg('[LINKS]', linkDebugSummary(d, scale))
  dbg('[LINKS] холст:',
    `offset ${Math.round(offset?.x ?? 0)},${Math.round(offset?.y ?? 0)}`,
    `· доска ${Math.round(boardRect?.width ?? 0)}×${Math.round(boardRect?.height ?? 0)}`)
  // Первые связи с координатами: видно, попадают ли они в видимую область
  for (const s of d.segments.slice(0, 5)) {
    dbg('[LINKS]', s.key,
      `из ${Math.round(s.x1)},${Math.round(s.y1)} в ${Math.round(s.x2)},${Math.round(s.y2)}`,
      `· экран ${Math.round(s.x1 * (scale ?? 1) + (offset?.x ?? 0))},${Math.round(s.y1 * (scale ?? 1) + (offset?.y ?? 0))}`,
      s.ok ? 'путь есть' : 'ПУТЬ ПУСТОЙ')
  }
  // Сколько путей реально висит в DOM — если тут ноль, дело не в данных
  const paths = document.querySelectorAll('.canvasBoardSvgBack path').length
  const dots  = document.querySelectorAll('.portDot').length
  dbg('[LINKS] в DOM:', `${paths} path в слое связей · ${dots} портов`)
}
