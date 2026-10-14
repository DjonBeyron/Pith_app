import { el, part } from './svgTree.js'

// Лицо кота v2 в системе координат головы (центр 0,0; радиус ≈ 48).
// Глаза — 4 эмоции (веко как плоская фигура поверх глаза), рот — три виземы
// (closed/half/open) лежат в DOM ОДНОВРЕМЕННО, видимую выбирает CSS по
// атрибуту data-mouth на корне кота (scene-v2-cat.css) — так рот
// переключается без перерендера React. Женский кот: ресницы; мужской: гуще брови.

const DARK = '#3b2a2a'
const PINK = '#f08a9b'

function eye(x, pal, emotion, gender) {
  const surprised = emotion === 'surprised'
  const kids = [
    el('ellipse', { rx: 11, ry: 13, fill: '#fff' }),
    el('circle', { r: 7.5, fill: pal.eye }),
    el('ellipse', { rx: surprised ? 5 : 3, ry: surprised ? 9 : 6, fill: '#1e1e24' }),
    el('circle', { cx: -3, cy: -4, r: 2.2, fill: '#fff' }),
  ]
  // Усталость — верхнее веко прикрывает глаз; радость — нижнее веко «улыбается»
  if (emotion === 'tired') kids.push(el('path', { d: 'M-12 -13 H12 V-2 Q0 -6 -12 -2 Z', fill: pal.fur }))
  if (emotion === 'happy') kids.push(el('path', { d: 'M-12 14 H12 V6 Q0 0 -12 6 Z', fill: pal.fur }))
  if (gender === 'female') {
    // Ресницы у внешнего уголка (у левого глаза — слева, у правого — справа)
    const s = x < 0 ? -1 : 1
    kids.push(el('path', {
      'data-part': 'lashes',
      d: `M${s * 10} -11 l${s * 5} -4 M${s * 11} -7 l${s * 6} -2 M${s * 11} -3 l${s * 6} 1`,
      fill: 'none', stroke: DARK, strokeWidth: 1.6, strokeLinecap: 'round',
    }))
  }
  return el('g', { 'data-part': 'eye', transform: `translate(${x} -4)` }, kids)
}

function brows(emotion, gender) {
  const w = gender === 'male' ? 3.2 : 2
  // Удивление — брови вверх, усталость — вниз к центру, иначе спокойные дуги
  const d = emotion === 'surprised'
    ? 'M-26 -24 q8 -6 16 -2 M26 -24 q-8 -6 -16 -2'
    : emotion === 'tired'
      ? 'M-26 -20 q8 1 16 -3 M26 -20 q-8 1 -16 -3'
      : 'M-26 -21 q8 -3 16 -1 M26 -21 q-8 -3 -16 -1'
  return el('path', { 'data-part': 'brows', d, fill: 'none', stroke: DARK, strokeWidth: w, strokeLinecap: 'round', opacity: 0.75 })
}

function mouthVisemes(emotion) {
  const closedD = emotion === 'happy'
    ? 'M-12 0 Q-6 8 0 1 Q6 8 12 0'
    : emotion === 'tired'
      ? 'M-9 2 Q-4.5 -1 0 2 Q4.5 -1 9 2'
      : 'M-9 0 Q-4.5 5 0 1 Q4.5 5 9 0'
  return el('g', { 'data-part': 'mouth', transform: 'translate(0 22)' }, [
    el('g', { 'data-viseme': 'closed' }, [
      el('path', { d: closedD, fill: 'none', stroke: DARK, strokeWidth: 2.2, strokeLinecap: 'round' }),
    ]),
    el('g', { 'data-viseme': 'half' }, [
      el('ellipse', { cy: 5, rx: 6, ry: 3.5, fill: DARK }),
    ]),
    el('g', { 'data-viseme': 'open' }, [
      el('ellipse', { cy: 7, rx: 8, ry: 7.5, fill: DARK }),
      el('ellipse', { cy: 11, rx: 4.5, ry: 3, fill: PINK }),
    ]),
  ])
}

// Усы: один path на обе стороны — 4 штриха, 1 узел
function whiskers() {
  return el('path', {
    'data-part': 'whiskers',
    d: 'M-28 14 L-56 8 M-28 20 L-56 22 M28 14 L56 8 M28 20 L56 22',
    fill: 'none', stroke: '#4a3a3a', strokeWidth: 1.4, strokeLinecap: 'round', opacity: 0.8,
  })
}

export function buildCatFace({ pal, emotion = 'neutral', gender = 'male' }) {
  return part('face', {}, [
    part('eyes', { class: 'cat-eyes' }, [eye(-18, pal, emotion, gender), eye(18, pal, emotion, gender)]),
    brows(emotion, gender),
    // Щёчки
    el('path', { d: 'M-36 14 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M24 14 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0', fill: '#f6b0a8', opacity: 0.55 }),
    el('polygon', { 'data-part': 'nose', points: '-5,12 5,12 0,18', fill: pal.accent }),
    el('line', { x1: 0, y1: 18, x2: 0, y2: 22, stroke: DARK, strokeWidth: 1.6, strokeLinecap: 'round' }),
    whiskers(),
    mouthVisemes(emotion),
  ])
}
