// Магнит таймлайна: край клипа (и сам клип при перетаскивании) прилипает к
// синему флажку плейхеда. Кнопка 🧲 над колонкой названий дорожек включает и
// выключает его.
//
// Порог задан в ПИКСЕЛЯХ полосы, а не в секундах: на длинной композиции
// секундный порог хватал бы клип за полэкрана, а на короткой не срабатывал
// бы вовсе. 7px — заметно, но не назойливо: чтобы примагнитить, нужно
// подвести край почти вплотную.
export const SNAP_PX = 7

function threshold(duration, stripWidth) {
  if (!duration || !stripWidth) return 0
  return (SNAP_PX / stripWidth) * duration
}

// Одна точка (край клипа при растягивании). playhead === null — магнит выключен
export function snapPoint(t, { playhead, duration, stripWidth }) {
  const thr = threshold(duration, stripWidth)
  if (playhead == null || !thr) return t
  return Math.abs(t - playhead) <= thr ? playhead : t
}

// Перемещение целого клипа: прилипает тот край, который ближе к флажку.
// Возвращает новое НАЧАЛО клипа (длина не меняется).
export function snapMove(start, length, { playhead, duration, stripWidth }) {
  const thr = threshold(duration, stripWidth)
  if (playhead == null || !thr) return start
  const dStart = Math.abs(start - playhead)
  const dEnd   = Math.abs(start + length - playhead)
  if (dStart > thr && dEnd > thr) return start
  const snapped = dStart <= dEnd ? playhead : playhead - length
  // Не вылезаем за границы композиции — иначе магнит выталкивал бы клип наружу
  return Math.max(0, Math.min(duration - length, snapped))
}
