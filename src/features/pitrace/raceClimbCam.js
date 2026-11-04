// «Камера за героем» и прыжки «Вершины» (CONCEPT_RACE.md, раунд 3) — чистая геометрия без React и DOM, по ней RaceClimb.jsx строит экран и анимации.
//  • Островки стоят зигзагом по трём дорожкам: ступень k — на дорожке (k − 1) mod 3 (первая слева, вторая посередине, третья справа, четвёртая снова слева…); «земля» (ступень 0) — посередине.
//  • Герой всегда в одной точке экрана (HERO_BOTTOM_DVH от низа ≈ 62 % высоты сверху), «мир» с островками смещается вниз на rung · GAP_DVH под ним (worldShift), 600 мс ease-out.
//  • Прыжок: взятие ступени — вверх и вбок на соседнюю дорожку, с сальто 360° (700 мс) и приземлением с приседанием; соскальзывание — дуга вниз без сальто, дрожание; слабое устройство — без дуги и сальто, только перенос с затуханием.
export const LANES = 3
export const LANE_X = [0.17, 0.5, 0.83]    // центры дорожек, доля ширины экрана
export const GAP_DVH = 45                  // расстояние между островками по вертикали, % высоты экрана
export const HERO_BOTTOM_DVH = 38          // низ героя (верх его островка) от низа экрана, % высоты: герой на ≈ 60 % высоты сверху
export const WORLD_MS = 600                // мир съезжает под героя
export const JUMP_MS = 700                 // прыжок с сальто
export const SLIP_MS = 600                 // соскальзывание
export const SHAKE_MS = 350                // дрожание на месте
export const LITE_MS = 260                 // слабое устройство: перенос с затуханием
export const JUMP_APEX_DVH = 14            // высота дуги прыжка над островком, % высоты экрана

/** Дорожка островка ступени k: 1…n — зигзаг (k − 1) mod 3, земля (0) — средняя */
export const laneOf = k => (k > 0 ? (k - 1) % LANES : 1)

/** Центр островка ступени k по горизонтали, доля ширины экрана */
export const xOf = k => LANE_X[laneOf(k)]

/** Смещение мира вниз для героя на ступени rung, % высоты экрана: островок rung оказывается под героем */
export const worldShift = rung => rung * GAP_DVH

/** Низ островка ступени k от низа экрана при герое на ступени rung, % высоты (у героя — HERO_BOTTOM_DVH) */
export const islandBottom = (k, rung) => HERO_BOTTOM_DVH + (k - rung) * GAP_DVH

/** Куда прыгает герой: from → to (ступени). kind: 'up' (взял ступень, сальто), 'down' (соскользнул, дуга вниз), 'stay' (остался на месте — дрожит); fromX / toX — доли ширины */
export function jumpOf(from, to) {
  const kind = to > from ? 'up' : to < from ? 'down' : 'stay'
  return { kind, from, to, fromX: xOf(from), toX: xOf(to), flip: kind === 'up', ms: kind === 'up' ? JUMP_MS : kind === 'down' ? SLIP_MS : SHAKE_MS }
}

const pct = x => `${(x * 100).toFixed(2)}%`

/**
 * Кадры Web Animations API для прыжка j (jumpOf): move — на внешнем элементе героя (left), arc — на внутреннем (transform: дуга, сальто, приседание), options — параметры обоих.
 * j.fromLeft / j.toLeft (необязательные строки CSS) — положение left вместо долей fromX / toX. lite — слабое устройство или reduced-motion: ни дуги, ни сальто, перенос с затуханием. Только transform / opacity / left, без filter.
 */
export function heroFrames(j, lite = false) {
  const base = { duration: j.ms, fill: 'both' }
  const L = x => pct(x), fromL = j.fromLeft ?? L(j.fromX), toL = j.toLeft ?? L(j.toX) // fromLeft / toLeft — строки CSS (капсула прижата к краям экрана, raceCapsule.capLeft); без них — доли ширины
  const move = [{ left: fromL }, { left: toL }]
  if (lite) return { move, arc: [{ opacity: 0.35 }, { opacity: 1 }], options: { move: { ...base, duration: LITE_MS, easing: 'ease-out' }, arc: { ...base, duration: LITE_MS } } }
  const opts = { move: { ...base, easing: 'ease-in-out' }, arc: base }
  if (j.kind === 'up') {
    return {
      move,
      arc: [
        { transform: 'translateY(0) rotate(0deg) scale(1, 1)', offset: 0, easing: 'ease-out' },
        { transform: `translateY(${-JUMP_APEX_DVH}dvh) rotate(180deg) scale(0.94, 1.06)`, offset: 0.5, easing: 'ease-in' },
        { transform: 'translateY(0) rotate(360deg) scale(1, 1)', offset: 0.88 },
        { transform: 'translateY(0) rotate(360deg) scale(1.12, 0.84)', offset: 0.94 },
        { transform: 'translateY(0) rotate(360deg) scale(1, 1)', offset: 1 },
      ],
      options: opts,
    }
  }
  if (j.kind === 'down') {
    return {
      move,
      arc: [
        { transform: 'translateY(0) rotate(0deg)', offset: 0, easing: 'ease-out' },
        { transform: 'translateY(-4dvh) rotate(-10deg)', offset: 0.3, easing: 'ease-in' },
        { transform: 'translateY(0) rotate(6deg) scale(1.1, 0.88)', offset: 0.75 },
        { transform: 'translateY(0) rotate(0deg) scale(1, 1)', offset: 1 },
      ],
      options: opts,
    }
  }
  const shake = [0, -5, 5, -3, 0].map(x => ({ transform: `translateX(${x}px)` }))
  return { move: [{ left: toL }, { left: toL }], arc: shake, options: { move: { ...base, duration: SHAKE_MS }, arc: { ...base, duration: SHAKE_MS } } }
}
