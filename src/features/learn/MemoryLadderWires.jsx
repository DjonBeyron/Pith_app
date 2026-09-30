import { useLayoutEffect, useRef, useState } from 'react'
import { ladderLinks, ladderWireSet, ballPath, ballScale, haloScale, WIRE_COLORS, W_MIN } from './ladderWires.js'

const MAX_BALLS = 3 // на ступень: больше — каша из шариков

// Слой линий «Моей памяти» поверх зоны лестницы (родитель слоя): меряет
// шапку (.lrMain), ступени (.memLvl) и пятиугольник (.memPerm), рисует
// связи (ladderWires.js: толщина плавно растёт от шапки до пятиугольника —
// короткими отрезками, общая прозрачность на группе, чтобы стыки не темнели)
// и шарики — слова сегодняшнего повторения бегут из своей ступени к кнопке.
// Шарик — светлое ядро 115% толщины линии у ступени + ореол; оба сжимаются
// вместе с линией до её толщины у шапки (--s0 → --s1 и --h0 → --h1: масштаб во
// вложенных элементах в CSS-анимации, на кадр ничего не считается). Меряет после каждого рендера и при смене размеров;
// в скрытой вкладке (ширина 0) не меряет. Зона — через СВОЙ элемент слоя:
// ref родителя в эффекте ребёнка при монтировании ещё пуст (React цепляет
// ref родителя после эффектов детей) — так линии пропадали после «Назад».
// today — число сегодняшних слов по ступеням
export default function MemoryLadderWires({ today }) {
  const [geo, setGeo] = useState(null) // { links, pieces, dots }
  const layerRef = useRef(null)

  useLayoutEffect(() => {
    const zone = layerRef.current?.parentElement
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
      const rects = { hero: rel(hero), blocks: blocks.map(rel), fin: fin && rel(fin), edge }
      const next = { links: ladderLinks(rects), ...ladderWireSet(rects) }
      setGeo(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(zone)
    return () => ro.disconnect()
  })

  if (!geo) return <div className="memWires" ref={layerRef} aria-hidden="true" />
  return (
    <div className="memWires" ref={layerRef} aria-hidden="true">
      <svg>
        <g className="memWire">
          {geo.pieces.map((p, k) => (
            <line key={k} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.color} strokeWidth={p.w} />
          ))}
        </g>
        {geo.dots.map((d, k) => <circle key={k} cx={d.x} cy={d.y} r={d.r} fill={d.color} />)}
      </svg>
      {[0, 1, 2].flatMap(i => Array.from({ length: Math.min(today[i] ?? 0, MAX_BALLS) }, (_, k) => (
        <span key={`${i}-${k}`} className="memBall" style={{
          offsetPath: `path('${ballPath(geo.links[i])}')`,
          '--s0': ballScale(geo.widths[i]),
          '--s1': ballScale(W_MIN),
          '--h0': haloScale(geo.widths[i]),
          '--h1': haloScale(W_MIN),
          color: WIRE_COLORS.levels[i],
          '--delay': `${(k * 0.2 + i * 0.1).toFixed(2)}s`,
          '--dur': `${(2.6 + i * 0.3).toFixed(1)}s`,
        }}>
          <i className="memBallGlow" />
          <i className="memBallDot" />
        </span>
      )))}
    </div>
  )
}
