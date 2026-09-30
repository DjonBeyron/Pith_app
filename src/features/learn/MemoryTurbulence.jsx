// Искажение внешних обводок «эхом» (Turbulent Displace из After Effects):
// фрактальный шум смещает пиксели контура — линия идёт мягкой неровной
// волной. Основная (первая) обводка блока остаётся чистой. У каждого кольца
// свой рисунок шума (seed) и сила, поэтому кольца не повторяют друг друга.
// Фильтры статичные — считаются один раз, на iPhone не крутятся каждый кадр.
// Подключены в memory-ladder.css (кольца ступеней, ::before/::after) и в
// MemoryPermNode.jsx (кольца пятиугольника). Нет поддержки фильтра — кольца
// просто чистые, ничего не ломается
const RINGS = [
  { id: 'memTurbA', seed: 3, scale: 5 },
  { id: 'memTurbB', seed: 8, scale: 7 },
  { id: 'memTurbC', seed: 15, scale: 9 },
]

export default function MemoryTurbulence() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {RINGS.map(r => (
          <filter key={r.id} id={r.id} x="-8%" y="-25%" width="116%" height="150%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed={r.seed} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale={r.scale} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ))}
      </defs>
    </svg>
  )
}
