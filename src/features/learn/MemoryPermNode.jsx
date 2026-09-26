import { useId } from 'react'
import { plural } from '../../shared/lib/plural.js'

// Контур финала модуля (MgFinalNode.jsx), сдвинутый в коробку 240×212; на
// экране — в масштабе 3/4 (clip-path того же контура — memory-ladder.css)
const PERM_PATH = 'M 5.4 118.0 L 16.6 42.4 A 43.8 43.8 0 0 1 60.0 4.6 L 186.0 4.6 A 43.8 43.8 0 0 1 229.8 42.4 L 240.6 118.0 A 43.8 43.8 0 0 1 220.0 161.4 L 146.2 206.8 A 43.8 43.8 0 0 1 100.0 206.8 L 26.2 161.4 A 43.8 43.8 0 0 1 5.4 118.0 Z'

// Постоянная память — фиолетовый пятиугольник под ступенями (форма финала
// модуля): сюда уходят родные слова, выдержавшие месячную проверку. Тап —
// фиолетовая страница этих слов (MemoryPermPage.jsx)
export default function MemoryPermNode({ count, onOpen }) {
  // id градиента — только буквы и цифры: url(#…) в SVG надёжен без спецсимволов
  const grad = 'memPermGrad' + useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <button className="memPerm" onClick={onOpen} aria-label={`Постоянная память: ${count}`}>
      <svg viewBox="0 0 240 212" aria-hidden="true">
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity=".35" />
          </linearGradient>
        </defs>
        <path d={PERM_PATH} stroke={`url(#${grad})`} />
      </svg>
      <span className="memPermText">
        <b>{count}</b>
        <span>{plural(count, 'слово', 'слова', 'слов')} в постоянной памяти</span>
        <small>{count ? 'выучены навсегда' : 'пока пусто'}</small>
      </span>
    </button>
  )
}
