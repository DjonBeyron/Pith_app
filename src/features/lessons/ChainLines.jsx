import { useEffect, useRef } from 'react'
import { FLIGHT_DELAY_MS } from './XpFlight.jsx'

const ORB_SPEED = 0.55 // px/мс — как у кружочков XP (XpFlight.jsx), заполнение идёт с их скоростью

// Зелёное заполнение правой линии. animate=true (урок только что пройден) —
// линия «прорисовывается» от урока к стволу синхронно со стартом полёта кружочков
// (после той же паузы FLIGHT_DELAY_MS, что и у полёта).
function ProgressStroke({ d, animate }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!animate || !ref.current) return
    const el = ref.current
    const len = el.getTotalLength()
    el.style.strokeDasharray  = `${len}`
    el.style.strokeDashoffset = `${len}`
    const t = setTimeout(() => {
      el.style.transition = `stroke-dashoffset ${Math.round(len / ORB_SPEED)}ms linear`
      requestAnimationFrame(() => { el.style.strokeDashoffset = '0' })
    }, FLIGHT_DELAY_MS)
    return () => clearTimeout(t)
  }, [animate])

  return <path ref={ref} d={d} className="mgRightFill" />
}

// SVG-слой линий графа модуля: серые правые линии со стрелками, зелёные левые
// с точками, и зелёный «прогресс» правых линий у пройденных уроков.
export default function ChainLines({ arcs, middle, completedIds, justCompletedId }) {
  return (
    <svg className="moduleGraphSvg">
      <defs>
        <marker id="mgArrow" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 2 2 L 8 5 L 2 8" fill="none" stroke="#c0c5d4"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>
      {arcs.map((arc, i) => (
        <g key={i}>
          <path d={arc.d} fill="none" strokeLinecap="round"
            stroke={arc.side === 'left' ? '#b6fe3b' : '#c0c5d4'}
            strokeWidth={arc.side === 'left' ? 2 : 1.5}
            opacity={arc.side === 'left' ? 0.9 : 0.7}
            markerEnd={arc.arrow ? 'url(#mgArrow)' : undefined} />
          {arc.dots?.map((p, j) => (
            <circle key={j} cx={p.x} cy={p.y} r="3.5" fill="#b6fe3b" />
          ))}
        </g>
      ))}
      {arcs.filter(a => a.side === 'right' && a.fillD).map(a => {
        const lesson = middle[a.lessonIndex]
        if (!lesson || !completedIds.has(lesson.id)) return null
        return (
          <ProgressStroke key={lesson.id} d={a.fillD}
            animate={lesson.id === justCompletedId} />
        )
      })}
    </svg>
  )
}
