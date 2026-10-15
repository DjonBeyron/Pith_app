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

// Фон продолжается ЗА кадр 360×640 (стандарт 2026-10-15): стена — вверх и в стороны, пол — вниз и в стороны. Лента рисует
// SVG с overflow: visible (feed-scene.css), и низ слайда под сценой, блоком фразы и кнопкой — продолжение пола, а не плоская
// полоса. Это те же узлы (прямоугольники и линии просто длиннее), число узлов не растёт; в кружке/ноде/превью кадр обрезан.
// Узор пола (доски/плитка) повторяется с тем же шагом, что внутри кадра.
export const BLEED = { x: 1000, top: 1400, bottom: 2000 } // на сколько единиц фон выходит за 360×640 влево/вправо, вверх, вниз

// Горизонтальные линии 'M{-x} y H{360+x}' с шагом step от y0 до нижнего края фона
function hLines(y0, step, extra = '') {
  let d = ''
  for (let y = y0; y <= SCENE_H + BLEED.bottom; y += step) d += `M${-BLEED.x} ${y} H${SCENE_W + BLEED.x} `
  return d + extra
}

// Кирпичная кладка кафе: ряды каждые 60 по всей ширине; швы в рядах 60–120 и 300–360 — x 60, 180, 300, в ряду 180–240 — x 120, 240
// (чередование через ряд, период 240). Рисуем от y −300 до 360 и от x −360 до 720
function bricks() {
  let d = ''
  for (let y = -300; y <= 360; y += 60) d += `M-360 ${y} H720 `
  for (let y = -300; y < 360; y += 120) {
    const type = (((y - 60) / 120) % 2 + 2) % 2 // 0 → швы 60/180/300, 1 → 120/240
    for (let x = -360; x <= 720; x += 120) d += `M${x + (type ? 120 : 60)} ${y} V${y + 60} `
  }
  return d.trim()
}

export const BACKGROUNDS = {
  office: {
    id: 'office', title: 'Офис',
    colors: { wall: '#e8eef5', wallLine: '#d6dfea', floor: '#c9a27a', floorLine: '#b88c63' },
    build: () => part('background', { 'data-location': 'office' }, [
      part('wall', {}, [
        el('rect', { x: -BLEED.x, y: -BLEED.top, width: 360 + 2 * BLEED.x, height: FLOOR_Y + BLEED.top, fill: '#e8eef5' }),
        el('path', { d: 'M-1000 200 H1360 M-1000 300 H1360', stroke: '#d6dfea', strokeWidth: 2, opacity: 0.5 }),
        el('rect', { x: -BLEED.x, y: 418, width: 360 + 2 * BLEED.x, height: 12, fill: '#d6dfea' }),
      ]),
      part('floor', {}, [
        el('rect', { x: -BLEED.x, y: FLOOR_Y, width: 360 + 2 * BLEED.x, height: SCENE_H - FLOOR_Y + BLEED.bottom, fill: '#c9a27a' }),
        el('path', { d: `M${-BLEED.x} 430 H${SCENE_W + BLEED.x}`, stroke: '#b88c63', strokeWidth: 3 }),
        el('path', { d: hLines(490, 70), stroke: '#b88c63', strokeWidth: 1.5, opacity: 0.6 }),
      ]),
    ]),
  },
  cafe: {
    id: 'cafe', title: 'Кафе',
    colors: { wall: '#f3e3c8', wallLine: '#e2cda6', floor: '#6f5b4a', floorLine: '#5a4838' },
    build: () => part('background', { 'data-location': 'cafe' }, [
      part('wall', {}, [
        el('rect', { x: -BLEED.x, y: -BLEED.top, width: 360 + 2 * BLEED.x, height: FLOOR_Y + BLEED.top, fill: '#f3e3c8' }),
        // Кирпичная кладка намёком: ряды и смещённые швы одним path (кладка продолжается за кадр на ±360 влево/вправо, вверх на 300)
        el('path', { d: bricks(), stroke: '#e2cda6', strokeWidth: 2, opacity: 0.7 }),
        el('rect', { x: -BLEED.x, y: 418, width: 360 + 2 * BLEED.x, height: 12, fill: '#d9bf92' }),
      ]),
      part('floor', {}, [
        el('rect', { x: -BLEED.x, y: FLOOR_Y, width: 360 + 2 * BLEED.x, height: SCENE_H - FLOOR_Y + BLEED.bottom, fill: '#6f5b4a' }),
        el('path', { d: `M${-BLEED.x} 430 H${SCENE_W + BLEED.x}`, stroke: '#5a4838', strokeWidth: 3 }),
        el('path', { d: hLines(480, 60), stroke: '#5a4838', strokeWidth: 1.5, opacity: 0.6 }),
      ]),
      part('counter', {}, [
        el('rect', { x: 246, y: 392, width: 114 + BLEED.x, height: 10, rx: 3, fill: '#8a6a3f' }),
        el('rect', { x: 250, y: 402, width: 110 + BLEED.x, height: 40, fill: '#5e4630' }),
        el('path', { d: 'M270 408 V436 M300 408 V436 M330 408 V436', stroke: '#4a3624', strokeWidth: 2 }),
      ]),
    ]),
  },
}

export const LOCATIONS = Object.keys(BACKGROUNDS)
