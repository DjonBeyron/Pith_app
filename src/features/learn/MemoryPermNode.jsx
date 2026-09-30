import { useId } from 'react'
import { plural } from '../../shared/lib/plural.js'

// Контур финала модуля (MgFinalNode.jsx), сдвинутый в коробку 240×212, и его
// границы: рисуем в системе координат самого контура (viewBox = его рамка),
// поэтому фигура заполняет коробку целиком и растягивается по ширине без
// перекоса линий (vector-effect: non-scaling-stroke держит толщину в px)
const PERM_PATH = 'M 5.4 118.0 L 16.6 42.4 A 43.8 43.8 0 0 1 60.0 4.6 L 186.0 4.6 A 43.8 43.8 0 0 1 229.8 42.4 L 240.6 118.0 A 43.8 43.8 0 0 1 220.0 161.4 L 146.2 206.8 A 43.8 43.8 0 0 1 100.0 206.8 L 26.2 161.4 A 43.8 43.8 0 0 1 5.4 118.0 Z'
const BOX = { x: 5.003, y: 4.598, w: 236.009, h: 208.789 }
// Тот же контур, приведённый к рамке 0..1 — маска фона (clipPathUnits: objectBoundingBox)
const CLIP_PATH = 'M 0.0017 0.5431 L 0.0491 0.1811 A 0.1856 0.2098 0 0 1 0.233 0 L 0.7669 0 A 0.1856 0.2098 0 0 1 0.9525 0.1811 L 0.9983 0.5431 A 0.1856 0.2098 0 0 1 0.911 0.751 L 0.5983 0.9685 A 0.1856 0.2098 0 0 1 0.4025 0.9685 L 0.0898 0.751 A 0.1856 0.2098 0 0 1 0.0017 0.5431 Z'

// Размер на экране, px (память-ladder.css .memPerm: width min(100%, PERM_W), height PERM_H).
// Шире прежнего, чтобы подпись «Слова в постоянной памяти» уместилась в одну
// строку на iPhone mini
export const PERM_W = 264
export const PERM_H = 166

// Внешние кольца: g — на сколько px кольцо отстоит от контура (одинаково со
// всех сторон: масштаб по осям считается отдельно), w и o — толщина и яркость
// по убыванию; f — фильтр искажения (MemoryTurbulence.jsx, у каждого свой)
const RINGS = [
  { g: 5, w: 2, o: 0.3, f: 'memTurbA' },
  { g: 10, w: 1.4, o: 0.17, f: 'memTurbB' },
  { g: 15, w: 0.9, o: 0.09, f: 'memTurbC' },
]
const CX = BOX.x + BOX.w / 2
const CY = BOX.y + BOX.h / 2
const ringTransform = g => `translate(${CX} ${CY}) scale(${1 + 2 * g / PERM_W} ${1 + 2 * g / PERM_H}) translate(${-CX} ${-CY})`

// Фиолетовый пятиугольник «N слов в постоянной памяти» под ступенями (форма
// финала модуля): сюда уходят усвоенные слова, вспомненные на месячной
// проверке. Четыре контура с затуханием наружу — как обводки ступеней (1 / 2 /
// 3). В фоне, кроме узора приложения, — еле видный узор мозга (как значок
// вкладки «Память», memory-ladder.css). Тап — четвёртая вкладка страницы уровней
export default function MemoryPermNode({ count, onOpen }) {
  // id градиента — только буквы и цифры: url(#…) в SVG надёжен без спецсимволов
  const grad = 'memPermGrad' + useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <button className="memPerm" onClick={onOpen}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        <defs>
          <clipPath id="memPermClip" clipPathUnits="objectBoundingBox"><path d={CLIP_PATH} /></clipPath>
        </defs>
      </svg>
      <svg className="memPermOutline" viewBox={`${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity=".35" />
          </linearGradient>
        </defs>
        <path d={PERM_PATH} stroke={`url(#${grad})`} vectorEffect="non-scaling-stroke" />
        {RINGS.map(r => (
          <path key={r.g} className="memPermRing" d={PERM_PATH} vectorEffect="non-scaling-stroke"
            transform={ringTransform(r.g)}
            style={{ strokeWidth: r.w, opacity: r.o, filter: `url(#${r.f})` }} />
        ))}
      </svg>
      <span className="memPermText">
        <b>{count}</b>
        <span>{plural(count, 'Слово', 'Слова', 'Слов')} в постоянной памяти</span>
        <small>{count ? 'легко вспоминаются' : 'пока пусто'}</small>
      </span>
    </button>
  )
}
