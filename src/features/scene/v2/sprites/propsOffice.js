import { el, part } from './svgTree.js'

// Предметы офиса. Система координат каждого спрайта — относительно его якоря:
// предметы на столе/полу — (0,0) в нижней середине; настенные — (0,0) в центре.
// Каждый ≤ 8 узлов, без фильтров и градиентов. Размеры size — габарит в
// единицах сцены (viewBox сцены 0 0 360 640) для сборщика и контактного листа.

export const OFFICE_PROPS = [
  {
    id: 'laptop', title: 'Ноутбук', category: 'office', anchor: 'bottom', size: { w: 52, h: 30 },
    build: () => part('laptop', {}, [
      el('rect', { x: -22, y: -30, width: 44, height: 27, rx: 2.5, fill: '#4a5568' }),
      el('rect', { x: -19, y: -27, width: 38, height: 21, rx: 1, fill: '#9ecbff' }),
      el('path', { d: 'M-15 -22 h18 M-15 -17 h26 M-15 -12 h12', stroke: '#fff', strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.8 }),
      el('rect', { x: -26, y: -4, width: 52, height: 4, rx: 1.5, fill: '#718096' }),
    ]),
  },
  {
    id: 'mug', title: 'Кружка с паром', category: 'office', anchor: 'bottom', size: { w: 30, h: 36 },
    build: () => part('mug', {}, [
      el('rect', { x: -10, y: -22, width: 20, height: 22, rx: 3, fill: '#e04e5c' }),
      el('path', { d: 'M10 -16 q10 0 10 7 q0 7 -10 7', fill: 'none', stroke: '#e04e5c', strokeWidth: 3.5 }),
      el('rect', { x: -10, y: -22, width: 20, height: 4, rx: 1.5, fill: '#fff', opacity: 0.5 }),
      el('path', { class: 'prop-steam', d: 'M-4 -28 q3 -4 0 -8 M3 -28 q3 -4 0 -8', fill: 'none', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round', opacity: 0.7 }),
    ]),
  },
  {
    id: 'papers', title: 'Стопка бумаг', category: 'office', anchor: 'bottom', size: { w: 36, h: 16 },
    build: () => part('papers', {}, [
      el('rect', { x: -17, y: -10, width: 34, height: 10, rx: 1, fill: '#e9edf3' }),
      el('rect', { x: -16, y: -14, width: 32, height: 6, rx: 1, fill: '#fff', transform: 'rotate(-4 0 -11)' }),
      el('path', { d: 'M-12 -12 h16 M-12 -9.5 h10', stroke: '#9aa5b5', strokeWidth: 1.2, strokeLinecap: 'round' }),
      el('path', { d: 'M-17 -6 h34 M-17 -3 h34', stroke: '#c7cfda', strokeWidth: 1 }),
    ]),
  },
  {
    id: 'whiteboard', title: 'Доска-флипчарт', category: 'office', anchor: 'center', size: { w: 92, h: 70 },
    build: () => part('whiteboard', {}, [
      el('rect', { x: -46, y: -35, width: 92, height: 70, rx: 4, fill: '#fff', stroke: '#b7c2d0', strokeWidth: 4 }),
      el('path', { d: 'M-34 -16 h40 M-34 -4 h52 M-34 8 h28', stroke: '#3f6fb5', strokeWidth: 2.4, strokeLinecap: 'round' }),
      el('path', { d: 'M-30 26 l12 -14 l10 8 l14 -16 l10 10', fill: 'none', stroke: '#e0564e', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      el('rect', { x: -46, y: 31, width: 92, height: 5, rx: 2, fill: '#9aa5b5' }),
    ]),
  },
  {
    id: 'wall-clock', title: 'Настенные часы', category: 'office', anchor: 'center', size: { w: 56, h: 56 },
    build: () => part('wall-clock', {}, [
      el('circle', { r: 26, fill: '#fff', stroke: '#b7c2d0', strokeWidth: 4 }),
      el('path', { d: 'M0 -20 v4 M20 0 h-4 M0 20 v-4 M-20 0 h4', stroke: '#9aa5b5', strokeWidth: 2, strokeLinecap: 'round' }),
      el('path', { d: 'M0 0 v-15 M0 0 l11 6', stroke: '#444', strokeWidth: 3, strokeLinecap: 'round' }),
      el('circle', { r: 2.5, fill: '#444' }),
    ]),
  },
]
