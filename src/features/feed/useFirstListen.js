import { useSyncExternalStore } from 'react'
import { onTrack } from '../../shared/lib/analytics/track.js'
import { createFirstListen } from './firstListen.js'

// Одно общее «первое прослушивание» на приложение (правило — firstListen.js): слушатель журнала ставится при первом
// же использовании и живёт всё приложение — HUD каждого слайда подписан на готовый флаг, а не на журнал сам.
// → true, когда значок сложности можно показывать (послушал со звуком ≥ 3 с, либо звук включал раньше)
let shared = null
function store() {
  if (!shared) {
    let storage = null
    try { storage = localStorage } catch { /* закрытое хранилище */ }
    shared = createFirstListen({ storage })
    onTrack((name, props) => shared.onEvent(name, props))
  }
  return shared
}

export function useFirstListen() {
  const s = store()
  return useSyncExternalStore(s.subscribe, s.get, s.get)
}
