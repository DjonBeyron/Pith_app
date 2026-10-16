import { useMemo } from 'react'
import { setSegmentAudio, templateSegments } from '../../../scene/v2/sceneVarsSegments.js'
import { removeOrphanIn } from './voiceGenerate.js'

// Запись озвучки частей реплики-шаблона в черновик сцены. Результат каждой части — отдельный шаг actions.updateLine(i, { segments })
// (подпись в истории «озвучка частей реплики N»). Несколько частей одной реплики приходят подряд, а сцена в sceneRef обновляется
// только после перерисовки — поэтому последний собранный массив segments хранится в буфере (reset() — в начале прогона).
// Заменённый файл части (устаревший) удаляется из R2, если на него больше никто не ссылается.
export function createSegmentApplier({ sceneRef, actions, deps }) {
  const buf = new Map() // индекс реплики → последний segments
  return {
    reset: () => buf.clear(),
    apply(item, patch) {
      const scene = sceneRef.current
      const i = item.index
      const line = scene.timeline[i]
      if (!line) return
      const base = buf.has(i) ? { ...line, segments: buf.get(i) } : line
      const oldUrl = templateSegments(base)[item.seg]?.audioUrl
      const segments = setSegmentAudio(base, item.seg, patch)
      buf.set(i, segments)
      actions.updateLine(i, { segments })
      if (oldUrl && oldUrl !== patch.audioUrl) removeOrphanIn(scene.timeline.map((l, n) => (n === i ? { ...l, segments } : l)), oldUrl, deps)
    },
  }
}

export function useSegmentApplier(sceneRef, actions, deps) {
  return useMemo(() => createSegmentApplier({ sceneRef, actions, deps }), [sceneRef, actions, deps])
}
