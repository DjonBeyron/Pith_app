import { useId } from 'react'
import { Maximize2 } from 'lucide-react'
import { plural } from '../../shared/lib/plural.js'

// Контур финала модуля (MgFinalNode.jsx), сдвинутый в коробку 240×212; на
// экране — в масштабе 3/4 (clip-path того же контура — memory-perm.css)
// Внешние контуры: масштаб от центра коробки, толщина и яркость — по убыванию;
// f — фильтр искажения кольца (MemoryTurbulence.jsx: у каждого свой рисунок)
const RINGS = [
  { s: 1.07, w: 2, o: 0.3, f: 'memTurbA' },
  { s: 1.14, w: 1.4, o: 0.17, f: 'memTurbB' },
  { s: 1.21, w: 0.9, o: 0.09, f: 'memTurbC' },
]
const PERM_PATH = 'M 5.4 118.0 L 16.6 42.4 A 43.8 43.8 0 0 1 60.0 4.6 L 186.0 4.6 A 43.8 43.8 0 0 1 229.8 42.4 L 240.6 118.0 A 43.8 43.8 0 0 1 220.0 161.4 L 146.2 206.8 A 43.8 43.8 0 0 1 100.0 206.8 L 26.2 161.4 A 43.8 43.8 0 0 1 5.4 118.0 Z'

// Фиолетовый пятиугольник «N Слов в постоянной памяти» под ступенями (форма
// финала модуля): сюда уходят усвоенные слова, вспомненные на месячной
// проверке. Четыре контура с затуханием наружу — как обводки ступеней (1 / 2 /
// 3). В фоне, кроме узора приложения, — один еле видный мозг (как значок
// вкладки «Память», memory-perm.css). Тап — четвёртая вкладка страницы уровней
export default function MemoryPermNode({ count, onOpen }) {
  // id градиента — только буквы и цифры: url(#…) в SVG надёжен без спецсимволов
  const grad = 'memPermGrad' + useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <button className="memPerm" onClick={onOpen}>
      <svg viewBox="0 0 240 212" aria-hidden="true">
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity=".35" />
          </linearGradient>
        </defs>
        <path d={PERM_PATH} stroke={`url(#${grad})`} />
        {RINGS.map(r => (
          <path key={r.s} className="memPermRing" d={PERM_PATH}
            transform={`translate(120 106) scale(${r.s}) translate(-120 -106)`}
            style={{ strokeWidth: r.w, opacity: r.o, filter: `url(#${r.f})` }} />
        ))}
      </svg>
      <span className="memExpand memExpand--perm" aria-hidden="true"><Maximize2 /></span>
      <span className="memPermText">
        <b>{count}</b>
        <span>{plural(count, 'Слово', 'Слова', 'Слов')} в постоянной памяти</span>
        <small>{count ? 'легко вспоминаются' : 'пока пусто'}</small>
      </span>
    </button>
  )
}
