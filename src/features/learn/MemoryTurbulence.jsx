// Искажение внешних обводок «эхом» (Turbulent Displace из After Effects):
// шум смещает пиксели контура — линия идёт мягкой неровной волной. Основная
// (первая) обводка блока остаётся чистой. Волна ПЛАВНАЯ, без острых углов:
// одна октава шума с низкой частотой (широкие изгибы, без мелкой ряби) и
// лёгкое сглаживание после смещения (ступеньки по пикселям пропадают). У
// каждого кольца свой рисунок шума (seed) и сила, поэтому кольца не
// повторяют друг друга. Фильтры применяются ТОЛЬКО к SVG-элементам внутри svg
// (кольца ступеней — MemoryLvlRings.jsx, кольца пятиугольника —
// MemoryPermNode.jsx): так шум считается один раз при растеризации слоя.
// CSS-фильтр filter: url(...) на HTML-элементе композитор пересчитывает на каждом
// кадре — этим кольца ступеней раньше роняли анимации вокруг до 30 кадров/с.
// Нет поддержки фильтра — кольца просто чистые, ничего не ломается
const RINGS = [
  { id: 'memTurbA', seed: 3, scale: 9 },
  { id: 'memTurbB', seed: 8, scale: 12 },
  { id: 'memTurbC', seed: 15, scale: 14 },
]

export default function MemoryTurbulence() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {RINGS.map(r => (
          <filter key={r.id} id={r.id} x="-8%" y="-25%" width="116%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves="1" seed={r.seed} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={r.scale} xChannelSelector="R" yChannelSelector="G" result="warped" />
            <feGaussianBlur in="warped" stdDeviation="0.45" />
          </filter>
        ))}
      </defs>
    </svg>
  )
}
