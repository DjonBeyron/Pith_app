// Математика бесконечного круга ленты (без React и без DOM).
//
// Лента — это виртуальный список Swiper из len * cycles слайдов, модуль
// слайда = индекс % len. Стартуем с середины, у края запаса незаметно
// переносимся обратно в середину (slideTo без анимации: контент в точке
// переноса тот же самый). Раньше то же делал нативный скролл со snap и
// телепортами scrollTop — и именно он давал все болячки iOS/Android (полёт,
// отскоки, скрытая вкладка). Swiper двигает ленту transform'ом, нативного
// скролла больше нет, а круг остался прежним.

// Около 200 слайдов в круге: у края запаса (ближе одного цикла) —
// перенос в середину. Больше не нужно: перенос невидим, а чем длиннее список,
// тем дороже каждый рендер (React создаёт элемент на каждый индекс)
export function circleCycles(len) {
  return len > 0 ? Math.max(4, Math.ceil(200 / len)) : 0
}

export function midSlide(len, cycles) {
  return len * Math.floor(cycles / 2)
}

// Какой слайд круга показать после пересборки списка. Круг пересобирается не
// только по фильтру: startedIds приезжают с сервера уже ПОСЛЕ первого кадра
// ленты (useFeedSocial), начатые модули вырезаются из рекомендаций, len
// меняется — и без этого лента вставала на модуль №0, то есть первый слайд
// подменялся сам собой через секунду после входа. Держим тот же модуль; его
// нет в новом списке (сам его и начал) — встаём на начало.
// keepId = null при повороте из поиска: там закреплённая фраза уже первая
export function pickSlideAfterRebuild(ids, keepId, len, cycles) {
  const base = midSlide(len, cycles)
  const idx = keepId ? ids.indexOf(keepId) : -1
  return idx >= 0 ? base + idx : base
}

// Нужен ли перенос в середину круга: null — нет, число — куда (тот же модуль)
export function recentreTarget(idx, len, cycles) {
  const total = len * cycles
  if (!len || (idx >= len && idx < total - len)) return null
  return midSlide(len, cycles) + (((idx % len) + len) % len)
}

// Номер модуля для слайда круга (индекс может быть и отрицательным)
export function moduleOf(idx, len) {
  return len ? ((idx % len) + len) % len : 0
}
