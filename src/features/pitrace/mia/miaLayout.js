// Раскладка эпизода «Мия» на экране игры: чистая арифметика без DOM (тесты). Исходные данные — прямоугольники сцены (.wlStage) и головы Пита (.wlCat)
// в одних координатах. Глаза Пита в игре сидят на 53 % высоты .wlCat по центру, расстояние между радужками — 34 % её ширины (замер на iPhone 12 mini: голова
// 187,5 × 159,5 px, глаза в 63,9 px друг от друга): коробка масштабируется так, чтобы глаза в её прорези легли на глаза Пита (S), и стоит на нижнем краю.
export const EYE_SPACING = 63.88 / 187.5     // расстояние между радужками Пита / ширина .wlCat
export const EYE_Y = 0.5304                  // высота глаз / высота .wlCat (от верха)
export const MIA_W = 215.5, MIA_H = 258.6    // спрайт Мии (200×240 единиц) при ширине головы Пита 187,5 px
export const FEET = 0.93                     // где у спрайта Мии низ лап (доля высоты)

/** { f, S, ex, ey, W, H }: f — во сколько раз голова Пита крупнее образца 187,5 px, S — масштаб рисунка коробки, (ex, ey) — середина глаз Пита в координатах сцены */
export function layoutOf({ stageW, stageH, catX, catY, catW, catH }, perEye) {
  const f = catW / 187.5
  return { f, S: (EYE_SPACING * catW) / perEye, ex: catX + 0.5 * catW + 0.3 * f, ey: catY + EYE_Y * catH, W: stageW, H: stageH }
}

/** Матрица «рисунок → сцена»: середина глаз рисунка (eyeMid) попадает на глаза Пита; возвращает [S 0 0 S tx ty] */
export const artMatrix = (L, eyeMid) => [L.S, 0, 0, L.S, L.ex - L.S * eyeMid[0], L.ey - L.S * eyeMid[1]]

/** Точка рисунка → сцена */
export const toScene = (m, p) => [m[0] * p[0] + m[4], m[3] * p[1] + m[5]]

/** Поза коробки в пикселях { dx, dy, rot (°), sx, sy } вокруг опоры piv (низ коробки): преобразование точки и строка для CSS / SVG */
export const poseApply = (pose, piv) => p => {
  const x = (p[0] - piv[0]) * pose.sx, y = (p[1] - piv[1]) * pose.sy, r = pose.rot * Math.PI / 180, c = Math.cos(r), n = Math.sin(r)
  return [x * c - y * n + piv[0] + pose.dx, x * n + y * c + piv[1] + pose.dy]
}
export const poseSvg = (pose, piv) => `translate(${pose.dx.toFixed(2)} ${pose.dy.toFixed(2)}) translate(${piv[0].toFixed(2)} ${piv[1].toFixed(2)}) rotate(${pose.rot.toFixed(3)}) scale(${pose.sx.toFixed(4)} ${pose.sy.toFixed(4)}) translate(${(-piv[0]).toFixed(2)} ${(-piv[1]).toFixed(2)})`

/** Из позы motion (dy в высотах сцены×1,3, dx при масштабе 1) в пиксели сцены */
export const poseOfMotion = (box, L) => ({ dx: box.dx * L.f, dy: box.dy * L.H * 1.3, rot: box.rot, sx: box.sx, sy: box.sy })

/** Transform спрайта Мии: низ лап (FEET) — в точке (ax, ay) сцены, масштаб головы f, наклон rot и сжатие sx / sy вокруг лап */
export const miaCss = (ax, ay, f, rot, sx, sy) => `translate(${(ax - (MIA_W * f) / 2).toFixed(1)}px,${(ay - FEET * MIA_H * f).toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})`
