import { useEffect, useSyncExternalStore } from 'react'
import { feedSceneStore, IDLE } from './feedSceneStore.js'

// Сцена для слайда ленты: { scene, status } (см. feedSceneStore.js).
// enabled — просить загрузку только у слайдов окна (активный ± 1): далёкие
// слайды ничего не грузят и видят 'idle'. Рендер не блокируется: пока
// 'loading' — слайд показывает постер/скелетон, как видео до первого кадра.
export function useFeedScene(sceneId, { enabled = true, store = feedSceneStore() } = {}) {
  const entry = useSyncExternalStore(
    store.subscribe,
    () => (sceneId ? store.get(sceneId) : IDLE),
    () => IDLE,
  )
  useEffect(() => {
    if (enabled && sceneId) store.request(sceneId)
  }, [enabled, sceneId, store])
  return entry
}
