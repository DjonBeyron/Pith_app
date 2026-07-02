import { useEffect, useRef, useState } from 'react'

// Разбивает total на n случайных положительных слагаемых (их сумма = total).
function splitXp(total, n) {
  if (total <= 0) return []
  n = Math.max(1, Math.min(n, total))
  const cuts = new Set()
  while (cuts.size < n - 1) cuts.add(1 + Math.floor(Math.random() * (total - 1)))
  const sorted = [...cuts].sort((a, b) => a - b)
  const parts = []
  let prev = 0
  for (const c of [...sorted, total]) { parts.push(c - prev); prev = c }
  return parts
}

// Интервал между кружочками = длительности transition прогресс-бара (0.3s linear):
// прилетают ровно с этим шагом, и бар растёт непрерывно от первого касания до последнего.
const ORB_GAP_MS = 300
const SPEED = 0.55      // px за миллисекунду

// Задержка старта полёта после возврата из урока: сначала пауза, потом пульс
// «урок пройден» (0.4s + 2×0.9s), потом кружки. Используется и в ModuleGraph
// (отложенный setFlight), и в ChainLines (отложенная прорисовка зелёной линии).
export const FLIGHT_DELAY_MS = 2400

// Кружочки с XP летят по SVG-путям (paths — d-строки в координатах контейнера),
// затем по прямой до звёздочки прогресс-бара. getTarget() запрашивается каждый кадр —
// звёздочка едет вместе с баром, и кружок доводится точно в её актуальное положение.
// onLaunch(durMs) — старт полёта (durMs — время до прилёта первого кружочка),
// onArrive(value) — по прилёте каждого, onDone() — когда прилетели все.
export default function XpFlight({ paths, getTarget, amount, onLaunch, onArrive, onDone }) {
  const pathRefs = useRef([])
  const orbRefs  = useRef([])
  const doneRef  = useRef(false)
  const [parts] = useState(() => splitXp(amount, Math.max(2, Math.min(4, Math.round(amount / 15)))))

  useEffect(() => {
    const els = pathRefs.current.filter(Boolean)
    if (!els.length || !parts.length) { onDone?.(); return }

    const lens = els.map(el => el.getTotalLength())
    const pathLen = lens.reduce((a, b) => a + b, 0)
    const end = els[els.length - 1].getPointAtLength(lens[lens.length - 1])
    const initTarget = getTarget?.() ?? null
    const tail = initTarget ? Math.hypot(initTarget.x - end.x, initTarget.y - end.y) : 0
    const totalLen = pathLen + tail
    const dur = totalLen / SPEED
    onLaunch?.(dur) // первый кружочек стартует без задержки и летит ровно dur

    const pointAt = (s) => {
      let acc = 0
      for (let k = 0; k < els.length; k++) {
        if (s <= acc + lens[k]) return els[k].getPointAtLength(s - acc)
        acc += lens[k]
      }
      // Хвост: доводка к актуальному положению звёздочки (она едет вместе с баром)
      const cur = getTarget?.() ?? initTarget
      if (!cur) return end
      const q = tail > 0 ? Math.min(1, (s - pathLen) / tail) : 1
      return { x: end.x + (cur.x - end.x) * q, y: end.y + (cur.y - end.y) * q }
    }

    let raf
    const t0 = performance.now()
    const arrived = new Set()
    const tick = (now) => {
      let allDone = true
      parts.forEach((val, i) => {
        const el = orbRefs.current[i]
        if (!el || arrived.has(i)) return
        const t = (now - t0 - i * ORB_GAP_MS) / dur
        if (t < 0) { allDone = false; return }
        if (t >= 1) {
          arrived.add(i)
          el.setAttribute('opacity', '0')
          onArrive?.(val)
          return
        }
        allDone = false
        const p = pointAt(t * totalLen)
        el.setAttribute('transform', `translate(${p.x} ${p.y})`)
        el.setAttribute('opacity', '1')
      })
      if (allDone) {
        if (!doneRef.current) { doneRef.current = true; onDone?.() }
      } else {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <svg className="mgOrbsSvg">
      {paths.map((d, i) => (
        <path key={i} d={d} ref={el => { pathRefs.current[i] = el }} fill="none" stroke="none" />
      ))}
      {parts.map((val, i) => (
        <g key={i} ref={el => { orbRefs.current[i] = el }} opacity="0" className="mgOrb">
          <circle r="5.5" />
          <text y="2" textAnchor="middle">{val}</text>
        </g>
      ))}
    </svg>
  )
}
