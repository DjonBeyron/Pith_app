// «Безопасный» режим слоёв пилюль для iOS Safari. На iPhone (iOS 18, Safari) контур пилюли пропадал в полёте и появлялся, когда в заливку попадал звук: браузер пересобирал дерево композитных слоёв
// (will-change у пилюли и заливки, слои частиц с visibility, анимации на псевдоэлементах), и граница пилюли выпадала из растра. В безопасном режиме (класс wl--safe на корне .wlField, word-lane-pill-safe.css):
// ни одного will-change, заливка без слоёв (частицы — сдвиг фона самой заливки), контур рисуется дважды (border + outline поверх него), у летящей пилюли постоянный слой translateZ(0).
// Включается ключом localStorage pithy_wl_pill_safe_v1 = '1' (по умолчанию выключен: на остальных устройствах обычный режим с композитными слоями быстрее).
export const PILL_SAFE_KEY = 'pithy_wl_pill_safe_v1'

/** Включён ли безопасный режим слоёв пилюль (localStorage может быть недоступен — тогда обычный режим) */
export function isPillSafe() {
  try { return globalThis.localStorage?.getItem(PILL_SAFE_KEY) === '1' } catch { return false }
}
