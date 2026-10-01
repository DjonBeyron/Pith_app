import { useEffect, useImperativeHandle, useRef } from 'react'
import { usePlayerPreload } from '../player/usePlayerPreload.js'

// Прогрев медиа СЛЕДУЮЩЕЙ карточки, пока отвечают на текущую (PROJECT.md →
// «Формат повторения»); первую карточку греют, пока на экране «Ищу слова…» (ReviewScreen
// держит её, пока onWarm(100) или не вышло время). Ничего не рисует. Список файлов — из
// самих нод карточки (card.files, reviewDecks.cardFiles): без него прогрев не стартует.
// ref.take() — забрать скачанное: blob-ссылки переходят плееру карточки
// (initialBlobMap), как у карточки запуска урока (LaunchPreloader)
const NONE = []
const ALL_AHEAD = 50

export default function ReviewWarmup({ card, onWarm = null, ref }) {
  const { blobMap, releaseBlobs, warmupPct } = usePlayerPreload(card.nodes, card.files, NONE, { initialLookahead: ALL_AHEAD })
  useImperativeHandle(ref, () => ({
    take() { releaseBlobs(); return blobMap },
  }))
  const onWarmRef = useRef(onWarm)
  useEffect(() => { onWarmRef.current = onWarm })
  useEffect(() => { onWarmRef.current?.(warmupPct) }, [warmupPct])
  return null
}
