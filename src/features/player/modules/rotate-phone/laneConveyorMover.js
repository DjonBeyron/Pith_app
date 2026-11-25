// «Двигатель» узора дорожки: сдвиг слоя ::before колонки .wlLanes i без пересчёта её стилей.
// Раньше привод (laneConveyorDrive.js) каждый кадр писал переменную --run-y в стиль колонки: браузер заново считал стили самой колонки и обоих её псевдоэлементов (длинные градиенты узора
// раскрываются из переменных заново) — на три дорожки ≈ 160 мкс за кадр на ноутбуке, при CPU 4× это 170 мс из каждой секунды конвейера (замер 2026-11-25, трасса Chromium и микрозамер).
// Здесь сдвиг ведёт стоящая на паузе анимация псевдоэлемента: её значение в момент t мс — ровно t px, привод пишет «время» = нужный сдвиг в px. Стили колонки не трогаются (≈ 18 мкс за кадр),
// а на экране то же самое: тот же transform translate3d(0, y px, 0) того же слоя, сдвиг по-прежнему кратен пикселю устройства (его считает привод). Правила CSS не менялись: анимация лишь
// перекрывает transform слоя; обратный конвейер (data-up, CSS: период − сдвиг) привод считает сам.
// Браузер без анимации псевдоэлементов (pseudoElement — Safari 14+, Chrome 84+) → null: привод пишет --run-y, как раньше.
export const MOVE_SPAN = 100000 // длина анимации в мс и её ход в px: 1 мс = 1 px (сдвиг узора не больше периода — сотни px)

/** col — колонка дорожки → { set(px), stop() } | null (не поддерживается — работать по-старому, через --run-y) */
export function pseudoMover(col) {
  try {
    if (typeof col?.animate !== 'function') return null
    const a = col.animate([{ transform: 'translate3d(0, 0px, 0)' }, { transform: `translate3d(0, ${MOVE_SPAN}px, 0)` }], { pseudoElement: '::before', duration: MOVE_SPAN, easing: 'linear', fill: 'both' })
    if (a?.effect?.pseudoElement !== '::before') { a?.cancel?.(); return null } // параметр не понят: анимация встала бы на саму колонку и увезла бы её
    a.pause(); a.currentTime = 0
    return { set(px) { a.currentTime = px }, stop() { try { a.cancel() } catch { /* уже снята */ } } }
  } catch { return null }
}
