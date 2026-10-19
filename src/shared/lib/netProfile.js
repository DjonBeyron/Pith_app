// Профиль сети устройства для фоновых загрузок: на слабом канале тяжёлая предзагрузка медиа (фото по 1,5 МБ) съедает полосу, и звуки
// интерфейса опаздывают. Network Information API есть не везде (Safari его не имеет) — тогда считаем сеть обычной
const WEAK_TYPES = new Set(['slow-2g', '2g', '3g'])
const WEAK_DOWNLINK_MBPS = 1.5

export function isWeakNetwork(nav = globalThis.navigator) {
  const c = nav?.connection
  if (!c) return false
  if (c.saveData) return true
  if (WEAK_TYPES.has(c.effectiveType)) return true
  return Number.isFinite(c.downlink) && c.downlink > 0 && c.downlink < WEAK_DOWNLINK_MBPS
}

/** Сколько медиафайлов качать одновременно: на слабой сети — по одному, чтобы звуки и текущая нода не стояли в очереди за фоном */
export const preloadConcurrency = (base, nav) => (isWeakNetwork(nav) ? 1 : base)
