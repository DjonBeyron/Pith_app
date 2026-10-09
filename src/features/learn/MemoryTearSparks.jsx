// Искрение на оборванных концах кабеля (режим сна) внутри svg слоя линий: данные — ladderSparks.js
// (через ladderTear.js → tear.sparks), стили и мерцание — memory-sparks.css. Разряд — два path одного контура:
// широкий бледный ореол под тонким почти белым ядром (без фильтров). Анимируются только opacity группы и
// transform летящих искорок; формы статичны. Элементов ≈ 19: 4 разряда (по 2 path), 2 звёздочки, 6 искорок,
// 1 дуга через разрыв (2 path)
import { timingVars as T } from './sparkTiming.js'

function Glow({ d }) {
  return (
    <>
      <path className="memSparkHalo" d={d} />
      <path className="memSparkCore" d={d} />
    </>
  )
}

export default function MemoryTearSparks({ sparks }) {
  if (!sparks) return null
  return (
    <g className="memSparks">
      {sparks.bolts.map((b, k) => (
        <g key={`b${k}`} className={`memBolt${b.kind === 'B' ? ' memBolt--b' : ''}`} style={T(b.period, b.delay)}><Glow d={b.d} /></g>
      ))}
      {sparks.stars.map((s, k) => <path key={`s${k}`} className="memStar" d={s.d} style={T(s.period, s.delay)} />)}
      {sparks.flies.map((f, k) => (
        <line key={`f${k}`} className="memFly" x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2}
          style={{ ...T(f.period, f.delay), '--mx': `${f.mx}px`, '--my': `${f.my}px`, '--tx': `${f.tx}px`, '--ty': `${f.ty}px` }} />
      ))}
      <g className="memArc" style={T(sparks.arc.period, sparks.arc.delay)}><Glow d={sparks.arc.d} /></g>
    </g>
  )
}
