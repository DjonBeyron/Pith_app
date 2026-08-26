// Магнит таймлайна: край клипа (и сам клип при перетаскивании) прилипает к
// синему флажку плейхеда И к краям клипов на других дорожках — так соседние
// слои встают ровно встык, без ручной подгонки на пиксели. Кнопка 🧲 над
// колонкой названий включает и выключает его.
//
// Порог задан в ПИКСЕЛЯХ полосы, а не в секундах: на длинной композиции
// секундный порог хватал бы клип за полэкрана, а на короткой не срабатывал
// бы вовсе. 7px — заметно, но не назойливо: чтобы примагнитить, нужно
// подвести край почти вплотную.
//
// targets — куда липнуть: плейхед плюс границы клипов ДРУГИХ дорожек (свои
// границы туда не попадают, иначе клип прилипал бы сам к себе и не двигался).
// Пустой список = магнит выключен.
export const SNAP_PX = 7

function threshold(duration, stripWidth) {
  if (!duration || !stripWidth) return 0
  return (SNAP_PX / stripWidth) * duration
}

// Ближайшая цель в пределах порога. Порядок в targets решает споры при равном
// расстоянии — плейхед стоит первым, он важнее краёв соседей
function nearest(value, targets, thr) {
  let best = null
  let bestD = Infinity
  for (const target of targets ?? []) {
    if (target == null) continue
    const d = Math.abs(value - target)
    if (d <= thr && d < bestD) { best = target; bestD = d }
  }
  return { best, bestD }
}

// Одна точка (край клипа при растягивании)
export function snapPoint(t, { targets, duration, stripWidth }) {
  const thr = threshold(duration, stripWidth)
  if (!thr) return t
  return nearest(t, targets, thr).best ?? t
}

// Перемещение целого клипа: прилипает тот край, который ближе к цели.
// Возвращает новое НАЧАЛО клипа (длина не меняется).
export function snapMove(start, length, { targets, duration, stripWidth }) {
  const thr = threshold(duration, stripWidth)
  if (!thr) return start
  const head = nearest(start, targets, thr)
  const tail = nearest(start + length, targets, thr)
  if (head.best == null && tail.best == null) return start
  const snapped = head.bestD <= tail.bestD ? head.best : tail.best - length
  // Не вылезаем за границы композиции — иначе магнит выталкивал бы клип наружу
  return Math.max(0, Math.min(duration - length, snapped))
}
