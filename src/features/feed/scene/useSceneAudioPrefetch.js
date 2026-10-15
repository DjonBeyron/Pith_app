import { useEffect } from 'react'
import { sceneAudioCache, prefetchAllowed } from '../../scene/v2/sceneAudioCache.js'
import { resolveVoiceFlags } from '../../scene/v2/sceneOptions.js'
import { isVideoActive } from '../../../shared/lib/netBusy.js'

// Лёгкая подкачка озвучки для СОСЕДНЕГО слайда-сцены ленты (near, не active):
// только ПЕРВАЯ реплика, в кэш сцен (sceneAudioCache: fetch → blob, без
// декодирования), с задержкой NEAR_DELAY_MS и не в момент, когда видео
// соседа/активного слайда ещё буферизуется (netBusy.isVideoActive) — с
// видео-предзагрузкой не конкурируем. Экономия трафика / 2g → ничего.
// Далёкие слайды — ничего. Следующие реплики активного слайда подкачивает
// сам режиссёр (scenePlayLine.js) по ходу диалога.

export const NEAR_DELAY_MS = 1200

export function firstAudioUrl(scene) {
  return scene?.timeline?.[0]?.audioUrl ?? null
}

// Файлы первой реплики: оригинал и, если озвучка перевода включена у сцены, её перевод
export function firstAudioUrls(scene) {
  const l = scene?.timeline?.[0]
  const urls = [l?.audioUrl, resolveVoiceFlags(scene).translation ? l?.translationAudioUrl : null]
  return urls.filter(u => typeof u === 'string' && u)
}

// Чистое решение «качать первую реплику соседа?» — для тестов
export function shouldPrefetchNear({ url, active, near, allowed, videoActive }) {
  return !!url && !active && !!near && !!allowed && !videoActive
}

export function useSceneAudioPrefetch({ scene, active, near, cache = sceneAudioCache, allowed = prefetchAllowed }) {
  const urls = firstAudioUrls(scene)
  const key = urls.join('\n')
  useEffect(() => {
    const list = key ? key.split('\n') : []
    if (!shouldPrefetchNear({ url: list[0], active, near, allowed: allowed(), videoActive: false })) return undefined
    const t = setTimeout(() => {
      if (shouldPrefetchNear({ url: list[0], active, near, allowed: true, videoActive: isVideoActive() })) {
        for (const u of list) cache.prefetch(u, { light: true })
      }
    }, NEAR_DELAY_MS)
    return () => clearTimeout(t)
  }, [key, active, near, cache, allowed])
}
