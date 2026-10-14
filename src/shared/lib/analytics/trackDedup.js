import { track } from './track.js'

// Защита от дребезга для событий-переключателей (свайп, пауза, звук): то же событие
// с тем же ключом в окне windowMs второй раз не пишется. Ключ — строка из значимых
// props (например `${module_id}:${on}`). Память — одна запись на имя события
const last = new Map()

export function trackDedup(name, props, key, windowMs = 1500) {
  const now = Date.now()
  const prev = last.get(name)
  if (prev && prev.key === key && now - prev.at < windowMs) return
  last.set(name, { key, at: now })
  track(name, props)
}
