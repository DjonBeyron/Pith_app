import { useEffect, useRef } from 'react'
import { FLIGHT_DELAY_MS } from './XpFlight.jsx'

const ORB_SPEED = 0.55 // px/мс — как у кружочков XP (XpFlight.jsx), заполнение идёт с их скоростью

// Зелёное заполнение линии. animate=true (урок только что пройден) —
// линия «прорисовывается» синхронно со стартом полёта кружочков:
// после той же паузы FLIGHT_DELAY_MS.
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

// SVG-слой линий графа модуля: серые правые линии со стрелками, левые линии
// с точками (белые до прохождения диагностики, зелёные после; при только что
// пройденном старте — плавно зеленеют со скоростью кружочков XP),
// и зелёный «прогресс» правых линий у пройденных уроков.
export default function ChainLines({
  arcs, middle, completedIds, justCompletedId,
  startDone = false, startJustDone = false, startHold = false,
}) {
  // Статичный зелёный — только если диагностика пройдена и это не текущее
  // завершение (тогда зелень появляется анимацией-прорисовкой поверх белой).
  // startHold: попап-легенда открыт — линии ждут белыми, анимация после закрытия.
  const leftGreen = startDone && !startJustDone && !startHold
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
            stroke={arc.side === 'left' ? (leftGreen ? '#b6fe3b' : '#c0c5d4') : '#c0c5d4'}
            strokeWidth={arc.side === 'left' ? 2 : 1.5}
            opacity={arc.side === 'left' ? (leftGreen ? 0.9 : 0.7) : 0.7}
            markerEnd={arc.arrow ? 'url(#mgArrow)' : undefined} />
          {arc.dots?.map((p, j) => (
            <circle key={j} cx={p.x} cy={p.y} r="3.5"
              fill={((startDone || startJustDone) && !startHold) ? '#b6fe3b' : '#c0c5d4'} />
          ))}
        </g>
      ))}
      {/* Диагностика только что пройдена: левые линии прорисовываются зелёным
          со скоростью кружочков — первый кружок касается первого урока ровно
          когда его линия дозеленела */}
      {startJustDone && arcs.filter(a => a.side === 'left').map((a, i) => (
        <ProgressStroke key={`left-${i}`} d={a.d} animate />
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
