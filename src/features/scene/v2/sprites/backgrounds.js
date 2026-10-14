import { el, part } from './svgTree.js'

// Фоны сцены 9:16 (viewBox 0 0 360 640) как слои «стена / пол»: плоские
// прямоугольники и пара линий, ≤ 12 узлов. Предметы (окно, картина, стол…) —
// НЕ здесь: они ставятся в слоты (slots.js) и выбираются сценой.
// Кафе дополнительно несёт стойку у правой стены — на неё встаёт кофемашина
// (слот counter); это часть архитектуры помещения, а не предмет.

export const SCENE_VIEWBOX = '0 0 360 640'
export const SCENE_W = 360
export const SCENE_H = 640
export const FLOOR_Y = 430

export const BACKGROUNDS = {
  office: {
    id: 'office', title: 'Офис',
    colors: { wall: '#e8eef5', wallLine: '#d6dfea', floor: '#c9a27a', floorLine: '#b88c63' },
    build: () => part('background', { 'data-location': 'office' }, [
      part('wall', {}, [
        el('rect', { width: 360, height: 640, fill: '#e8eef5' }),
        el('path', { d: 'M0 200 H360 M0 300 H360', stroke: '#d6dfea', strokeWidth: 2, opacity: 0.5 }),
        el('rect', { y: 418, width: 360, height: 12, fill: '#d6dfea' }),
      ]),
      part('floor', {}, [
        el('rect', { y: 430, width: 360, height: 210, fill: '#c9a27a' }),
        el('path', { d: 'M0 430 H360', stroke: '#b88c63', strokeWidth: 3 }),
        el('path', { d: 'M0 490 H360 M0 560 H360', stroke: '#b88c63', strokeWidth: 1.5, opacity: 0.6 }),
      ]),
    ]),
  },
  cafe: {
    id: 'cafe', title: 'Кафе',
    colors: { wall: '#f3e3c8', wallLine: '#e2cda6', floor: '#6f5b4a', floorLine: '#5a4838' },
    build: () => part('background', { 'data-location': 'cafe' }, [
      part('wall', {}, [
        el('rect', { width: 360, height: 640, fill: '#f3e3c8' }),
        // Кирпичная кладка намёком: ряды и смещённые швы одним path
        el('path', {
          d: 'M0 60 H360 M0 120 H360 M0 180 H360 M0 240 H360 M0 300 H360 M0 360 H360 M60 60 V120 M180 60 V120 M300 60 V120 M120 180 V240 M240 180 V240 M60 300 V360 M180 300 V360 M300 300 V360',
          stroke: '#e2cda6', strokeWidth: 2, opacity: 0.7,
        }),
        el('rect', { y: 418, width: 360, height: 12, fill: '#d9bf92' }),
      ]),
      part('floor', {}, [
        el('rect', { y: 430, width: 360, height: 210, fill: '#6f5b4a' }),
        el('path', { d: 'M0 430 H360', stroke: '#5a4838', strokeWidth: 3 }),
        el('path', { d: 'M0 480 H360 M0 540 H360 M0 600 H360', stroke: '#5a4838', strokeWidth: 1.5, opacity: 0.6 }),
      ]),
      part('counter', {}, [
        el('rect', { x: 246, y: 392, width: 114, height: 10, rx: 3, fill: '#8a6a3f' }),
        el('rect', { x: 250, y: 402, width: 110, height: 40, fill: '#5e4630' }),
        el('path', { d: 'M270 408 V436 M300 408 V436 M330 408 V436', stroke: '#4a3624', strokeWidth: 2 }),
      ]),
    ]),
  },
}

export const LOCATIONS = Object.keys(BACKGROUNDS)
