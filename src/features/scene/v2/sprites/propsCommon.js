import { el, part } from './svgTree.js'

// Общие предметы — ставятся и в офис, и в кафе. Координаты относительно якоря
// (напольные — нижняя середина; окно и картина — центр). Цвета нейтральные,
// чтобы сочетаться с обоими фонами.

export const COMMON_PROPS = [
  {
    id: 'table', title: 'Стол', category: 'common', anchor: 'bottom', size: { w: 150, h: 60 },
    build: () => part('table', {}, [
      el('rect', { x: -75, y: -60, width: 150, height: 14, rx: 4, fill: '#a67c57' }),
      el('rect', { x: -75, y: -46, width: 150, height: 6, fill: '#8d6a4b' }),
      el('path', { d: 'M-64 -40 h10 v40 h-10 z M54 -40 h10 v40 h-10 z', fill: '#8d6a4b' }),
    ]),
  },
  {
    id: 'window', title: 'Окно', category: 'common', anchor: 'center', size: { w: 150, h: 180 },
    build: () => part('window', {}, [
      el('rect', { x: -75, y: -85, width: 150, height: 170, rx: 8, fill: '#fff' }),
      el('rect', { x: -65, y: -75, width: 130, height: 150, rx: 4, fill: '#9fd3f4' }),
      el('circle', { cx: 30, cy: -40, r: 16, fill: '#fff3b0' }),
      el('path', { d: 'M-50 -25 a12 9 0 1 0 24 0 a10 8 0 1 0 -24 0 M-5 25 a12 8 0 1 0 24 0 a12 8 0 1 0 -24 0', fill: '#fff', opacity: 0.9 }),
      el('path', { d: 'M-3 -75 h6 v150 h-6 z M-65 -3 h130 v6 h-130 z', fill: '#fff' }),
      el('rect', { x: -81, y: 85, width: 162, height: 10, rx: 3, fill: '#d6dfea' }),
    ]),
  },
  {
    id: 'plant', title: 'Растение в горшке', category: 'common', anchor: 'bottom', size: { w: 60, h: 80 },
    build: () => part('plant', {}, [
      el('path', { d: 'M-16 -20 h32 v18 a3 3 0 0 1 -3 3 h-26 a3 3 0 0 1 -3 -3 z', fill: '#c75c3a' }),
      el('rect', { x: -18, y: -24, width: 36, height: 6, rx: 2, fill: '#b04f30' }),
      el('ellipse', { cx: -12, cy: -40, rx: 9, ry: 18, fill: '#4fa36b', transform: 'rotate(-25 -12 -40)' }),
      el('ellipse', { cx: 12, cy: -40, rx: 9, ry: 18, fill: '#4fa36b', transform: 'rotate(25 12 -40)' }),
      el('ellipse', { cy: -52, rx: 9, ry: 24, fill: '#5bb37a' }),
      el('ellipse', { cx: -4, cy: -32, rx: 7, ry: 12, fill: '#3f8c58', transform: 'rotate(-50 -4 -32)' }),
    ]),
  },
  {
    id: 'floor-lamp', title: 'Торшер', category: 'common', anchor: 'bottom', size: { w: 56, h: 150 },
    build: () => part('floor-lamp', {}, [
      el('ellipse', { cy: -3, rx: 18, ry: 4, fill: '#4a4a52' }),
      el('rect', { x: -2, y: -120, width: 4, height: 118, fill: '#6b6b74' }),
      el('path', { d: 'M-22 -118 l6 -30 h32 l6 30 z', fill: '#f2d9a4' }),
      el('path', { d: 'M-22 -118 h44', stroke: '#d9b97a', strokeWidth: 2.5, strokeLinecap: 'round' }),
    ]),
  },
  {
    id: 'picture', title: 'Картина в рамке', category: 'common', anchor: 'center', size: { w: 70, h: 54 },
    build: () => part('picture', {}, [
      el('rect', { x: -33, y: -25, width: 66, height: 50, rx: 3, fill: '#fff', stroke: '#8a6a3f', strokeWidth: 4 }),
      el('rect', { x: -27, y: -19, width: 54, height: 38, fill: '#cfe7f7' }),
      el('polygon', { points: '-25,17 -7,-7 7,9 15,1 25,17', fill: '#4fa36b', opacity: 0.85 }),
      el('circle', { cx: 14, cy: -9, r: 5, fill: '#fff3b0' }),
    ]),
  },
]
