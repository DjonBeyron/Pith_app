import { useId, useLayoutEffect, useState } from 'react'
import { ladderLinks, orth, ballPath, WIRE_COLORS } from './ladderWires.js'

const MAX_BALLS = 3 // на ступень: больше — каша из шариков

// Слой линий «Моей памяти» поверх зоны zoneRef (ладдер): меряет шапку
// (.lrMain), ступени (.memLvl) и пятиугольник (.memPerm), рисует связи
// (ladderWires.js) и шарики — слова сегодняшнего повторения бегут из своей
// ступени к кнопке. Меряет после каждого рендера и при смене размеров; в
// скрытой вкладке (ширина 0) не меряет. today — число сегодняшних слов по ступеням
export default function MemoryLadderWires({ zoneRef, today }) {
  const [links, setLinks] = useState(null)
  const uid = 'memw' + useId().replace(/[^a-zA-Z0-9]/g, '')

  useLayoutEffect(() => {
    const zone = zoneRef.current
    if (!zone) return undefined
    const measure = () => {
      const box = zone.getBoundingClientRect()
      const hero = zone.querySelector('.lrMain')
      const blocks = [...zone.querySelectorAll('.memLvl')]
      if (!box.width || !hero || blocks.length !== 3) return
      const rel = el => {
        const r = el.getBoundingClientRect()
        return { l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top }
      }
      const fin = zone.querySelector('.memPerm')
      const edge = (zone.parentElement?.getBoundingClientRect().left ?? box.left) - box.left
      const next = ladderLinks({ hero: rel(hero), blocks: blocks.map(rel), fin: fin && rel(fin), edge })
      setLinks(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(zone)
    return () => ro.disconnect()
  })

  if (!links) return null
  return (
    <div className="memWires" aria-hidden="true">
      <svg>
        <defs>
          {links.map((l, k) => {
            const [a, z] = [l.pts[0], l.pts[l.pts.length - 1]]
            return (
              <linearGradient key={k} id={`${uid}${k}`} gradientUnits="userSpaceOnUse"
                x1={a[0]} y1={a[1]} x2={z[0] + 0.01} y2={z[1] + 0.01}>
                <stop offset="0" stopColor={l.from} />
                <stop offset="1" stopColor={l.to} />
              </linearGradient>
            )
          })}
        </defs>
        {links.map((l, k) => <path key={k} className="memWire" d={orth(l.pts)} stroke={`url(#${uid}${k})`} />)}
        {links.map((l, k) => {
          const z = l.pts[l.pts.length - 1]
          return <circle key={k} cx={z[0]} cy={z[1]} r="3.5" fill={l.to} />
        })}
        <circle cx={links[0].pts[0][0]} cy={links[0].pts[0][1]} r="3.5" fill={WIRE_COLORS.accent} />
        {links[3] && <circle cx={links[3].pts[0][0]} cy={links[3].pts[0][1]} r="3.5" fill={WIRE_COLORS.levels[2]} />}
      </svg>
      {[0, 1, 2].flatMap(i => Array.from({ length: Math.min(today[i] ?? 0, MAX_BALLS) }, (_, k) => (
        <span key={`${i}-${k}`} className="memBall" style={{
          offsetPath: `path('${ballPath(links[i])}')`,
          background: WIRE_COLORS.levels[i],
          color: WIRE_COLORS.levels[i],
          animationDelay: `${(k * 0.2 + i * 0.1).toFixed(2)}s`,
          animationDuration: `${2.6 + i * 0.3}s`,
        }} />
      )))}
    </div>
  )
}
