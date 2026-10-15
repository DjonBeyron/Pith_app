import { el, part } from './svgTree.js'

// Предметы кафе. Координаты — относительно якоря (см. propsOffice.js):
// на столе/стойке — нижняя середина, настенные — центр, потолочные — верхняя
// середина (лампа висит вниз от точки крепления; шнур тянется вверх за кадр — потолка в кадре нет).

export const CAFE_PROPS = [
  {
    id: 'coffee-machine', title: 'Кофемашина', category: 'cafe', anchor: 'bottom', size: { w: 48, h: 52 },
    build: () => part('coffee-machine', {}, [
      el('rect', { x: -22, y: -50, width: 44, height: 50, rx: 4, fill: '#5b6472' }),
      el('rect', { x: -18, y: -46, width: 36, height: 12, rx: 2, fill: '#2f3640' }),
      el('path', { d: 'M-8 -30 h16 v8 h-16 z M0 -22 v8', fill: '#3a424d', stroke: '#2f3640', strokeWidth: 1.5 }),
      el('path', { d: 'M-7 -10 h14 v8 a3 3 0 0 1 -3 3 h-8 a3 3 0 0 1 -3 -3 z', fill: '#f3f4f6' }),
      el('circle', { cx: 14, cy: -38, r: 2.2, fill: '#f6c94b' }),
      el('path', { d: 'M-24 -2 h48 v3 h-48 z', fill: '#3a424d' }),
    ]),
  },
  {
    id: 'coffee-cup', title: 'Чашка кофе на блюдце', category: 'cafe', anchor: 'bottom', size: { w: 34, h: 26 },
    build: () => part('coffee-cup', {}, [
      el('ellipse', { cy: -2, rx: 17, ry: 4, fill: '#e6e9ee' }),
      el('path', { d: 'M-10 -20 h20 l-3 15 h-14 z', fill: '#fff', stroke: '#cfd5de', strokeWidth: 1.2 }),
      el('path', { d: 'M10 -17 q8 0 8 5 q0 5 -8 5', fill: 'none', stroke: '#fff', strokeWidth: 3 }),
      el('ellipse', { cy: -20, rx: 10, ry: 2.4, fill: '#6b3f26' }),
      el('path', { class: 'prop-steam', d: 'M-3 -26 q3 -4 0 -8 M3 -26 q3 -4 0 -8', fill: 'none', stroke: '#fff', strokeWidth: 1.8, strokeLinecap: 'round', opacity: 0.7 }),
    ]),
  },
  {
    id: 'pastry-plate', title: 'Тарелка с выпечкой', category: 'cafe', anchor: 'bottom', size: { w: 40, h: 20 },
    build: () => part('pastry-plate', {}, [
      el('ellipse', { cy: -3, rx: 20, ry: 5, fill: '#f3f4f6', stroke: '#cfd5de', strokeWidth: 1.2 }),
      el('path', { d: 'M-14 -6 q6 -14 16 -8 q6 4 4 9 z', fill: '#d9a05b' }),
      el('path', { d: 'M-10 -8 q6 -8 12 -5', fill: 'none', stroke: '#b97a3a', strokeWidth: 1.6, strokeLinecap: 'round' }),
      el('circle', { cx: 10, cy: -8, r: 5, fill: '#e97a8a' }),
    ]),
  },
  {
    id: 'menu-board', title: 'Меню-доска', category: 'cafe', anchor: 'center', size: { w: 80, h: 64 },
    build: () => part('menu-board', {}, [
      el('rect', { x: -40, y: -32, width: 80, height: 64, rx: 3, fill: '#2f3a33', stroke: '#8a6a3f', strokeWidth: 4 }),
      el('path', { d: 'M-22 -20 h44', stroke: '#f6c94b', strokeWidth: 3, strokeLinecap: 'round' }),
      el('path', { d: 'M-28 -6 h30 M-28 6 h36 M-28 18 h24', stroke: '#e6e9ee', strokeWidth: 2.2, strokeLinecap: 'round' }),
      el('path', { d: 'M18 -6 h10 M18 6 h10 M18 18 h10', stroke: '#f6c94b', strokeWidth: 2.2, strokeLinecap: 'round' }),
    ]),
  },
  {
    id: 'pendant-lamp', title: 'Подвесная лампа', category: 'cafe', anchor: 'top', size: { w: 44, h: 70 },
    build: () => part('pendant-lamp', {}, [
      el('line', { x1: 0, y1: -600, x2: 0, y2: 38, stroke: '#4a4a52', strokeWidth: 2 }),
      el('path', { d: 'M-22 64 l8 -26 h28 l8 26 z', fill: '#2f3640' }),
      el('path', { d: 'M-16 64 h32', stroke: '#f6c94b', strokeWidth: 3, strokeLinecap: 'round' }),
      el('ellipse', { cy: 70, rx: 9, ry: 4, fill: '#fff3b0', opacity: 0.9 }),
    ]),
  },
]
