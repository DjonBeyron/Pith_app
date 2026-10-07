// Эхо-кольца ступени: тонкие обводки снаружи блока с прозрачным зазором (линии
// связей видны сквозь), слегка искажённые «турбулентностью» (MemoryTurbulence.jsx).
// Рисуются SVG-прямоугольником с фильтром ВНУТРИ svg — такой фильтр считается один
// раз при растеризации слоя. Раньше кольца были CSS-рамками с filter: url(...) на
// HTML-элементе: такой фильтр композитор пересчитывает на КАЖДОМ кадре (шум на
// полный размер блока), и любая анимация рядом (шарики, орбиты счётчика, волна
// узора, окошко) шла в 30 кадров вместо 60. Слой статичный (will-change), поля
// M вокруг рамки — чтобы слой не подрезал искажённую линию. inset — на сколько
// кольцо вынесено за блок, r — радиус, w — толщина. У первой ступени колец нет
const M = 16
const RINGS = {
  2: [{ inset: 5, r: 21, w: 1.25, color: 'rgba(79, 179, 238, 0.24)', f: 'memTurbA' }], // небесный — «Знакомые»
  3: [
    { inset: 5, r: 21, w: 1.5, color: 'rgba(241, 189, 60, 0.26)', f: 'memTurbA' },
    { inset: 10, r: 26, w: 1, color: 'rgba(241, 189, 60, 0.13)', f: 'memTurbB' },
  ],
}

export default function MemoryLvlRings({ level }) {
  const rings = RINGS[level]
  if (!rings) return null
  return rings.map(r => (
    <span key={r.inset} className="memRing" style={{ inset: -(r.inset - r.w / 2 + M) }} aria-hidden="true">
      <svg>
        <rect x="0" y="0" width="100%" height="100%" rx={r.r - r.w / 2} fill="none"
          stroke={r.color} strokeWidth={r.w} filter={`url(#${r.f})`} />
      </svg>
    </span>
  ))
}
