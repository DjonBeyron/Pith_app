import { useLayoutEffect, useRef, useState } from 'react'
import { ladderLinks, ballPath, ballScale, haloScale, WIRE_COLORS, W_MIN } from './ladderWires.js'
import { ladderWireSet } from './ladderWireSet.js'
import { tearWire } from './ladderTear.js'
import MemoryTearSparks from './MemoryTearSparks.jsx'

const MAX_BALLS = 3 // на ступень: больше — каша из шариков

// Слой линий «Моей памяти» поверх зоны лестницы (родитель слоя): меряет
// шапку (.lrMain), круг-счётчик (.memCount), ступени (.memLvl) и пятиугольник (.memPerm), рисует
// связи (ladderWireSet.js: толщина плавно растёт от шапки через круг до пятиугольника —
// короткими отрезками, общая прозрачность на группе, чтобы стыки не темнели)
// (у каждого элемента линия раздувается «трубой» и кончается кружком — как
// отросток нервной клетки) и шарики — слова сегодняшнего повторения бегут из
// своей ступени через круг к кнопке.
// Шарик — светлое ядро 115% толщины линии у ступени + ореол; оба сжимаются
// вместе с линией до её толщины у шапки (--s0 → --s1 и --h0 → --h1: масштаб во
// вложенных элементах в CSS-анимации, на кадр ничего не считается). Меряет после каждого рендера и при смене размеров;
// в скрытой вкладке (ширина 0) не меряет. Зона — через СВОЙ элемент слоя:
// ref родителя в эффекте ребёнка при монтировании ещё пуст (React цепляет
// ref родителя после эффектов детей) — так линии пропадали после «Назад».
// today — число сегодняшних слов по ступеням. sleeping — мозг спит: кабель оборван (ladderTear.js): крупный разрыв на
// горизонтали левее круга, по три тонких провода цветов ступеней у концов, электрическое искрение на концах
// (MemoryTearSparks.jsx); линия до разрыва зелёная, после — бело-серая (ladderWireSet с { sleeping })
export default function MemoryLadderWires({ today, sleeping = false }) {
  const [geo, setGeo] = useState(null) // { links, pieces, dots, flares, widths, tearAt }
  const layerRef = useRef(null)

  useLayoutEffect(() => {
    const zone = layerRef.current?.parentElement
    if (!zone) return undefined
    const measure = () => {
      const box = zone.getBoundingClientRect()
      const hero = zone.querySelector('.lrMain')
      const circle = zone.querySelector('.memCount')
      const blocks = [...zone.querySelectorAll('.memLvl')]
      if (!box.width || !hero || !circle || blocks.length !== 3) return
      const rel = el => {
        const r = el.getBoundingClientRect()
        return { l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top }
      }
      const fin = zone.querySelector('.memPerm')
      const edge = (zone.parentElement?.getBoundingClientRect().left ?? box.left) - box.left
      const rects = { hero: rel(hero), circle: rel(circle), blocks: blocks.map(rel), fin: fin && rel(fin), edge }
      const next = { links: ladderLinks(rects), ...ladderWireSet(rects, { sleeping }) }
      setGeo(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(zone)
    return () => ro.disconnect()
  })

  if (!geo) return <div className="memWires" ref={layerRef} aria-hidden="true" />
  const tear = sleeping ? tearWire(geo.pieces, geo.tearAt) : null
  return (
    <div className="memWires" ref={layerRef} aria-hidden="true">
      <svg>
        <g className="memWire">
          {(tear?.pieces ?? geo.pieces).map((p, k) => (
            <line key={k} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.color} strokeWidth={p.w} />
          ))}
          {tear?.strands.map((s, k) => <path key={`s${k}`} className="memStrand" d={s.d} fill="none" stroke={s.color} strokeWidth={s.w} />)}
          {geo.flares.map((fl, k) => <path key={`f${k}`} d={fl.d} fill={fl.color} stroke="none" />)}
          {geo.dots.map((d, k) => (d.half
            // полуточка на нижней грани шапки: нижний полукруг (дуга против часовой — через низ)
            ? <path key={k} d={`M ${d.x - d.r} ${d.y} A ${d.r} ${d.r} 0 0 0 ${d.x + d.r} ${d.y} Z`} fill={d.color} />
            : <circle key={k} cx={d.x} cy={d.y} r={d.r} fill={d.color} />))}
        </g>
        <MemoryTearSparks sparks={tear?.sparks} />
      </svg>
      {[0, 1, 2].flatMap(i => Array.from({ length: Math.min(today[i] ?? 0, MAX_BALLS) }, (_, k) => (
        <span key={`${i}-${k}`} className="memBall" style={{
          offsetPath: `path('${ballPath(geo.links[0], geo.links[i + 1])}')`,
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
