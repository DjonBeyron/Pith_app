import { useImperativeHandle } from 'react'
import { usePlayerPreload } from '../player/usePlayerPreload.js'

// Прогрев медиа СЛЕДУЮЩЕЙ карточки, пока отвечают на текущую (PROJECT.md →
// «Формат повторения»). Ничего не рисует. Список файлов — из самих нод
// карточки (card.files, reviewDecks.cardFiles): без него прогрев не стартует.
// ref.take() — забрать скачанное: blob-ссылки переходят плееру карточки
// (initialBlobMap), как у карточки запуска урока (LaunchPreloader)
const NONE = []
const ALL_AHEAD = 50

export default function ReviewWarmup({ card, ref }) {
  const { blobMap, releaseBlobs } = usePlayerPreload(card.nodes, card.files, NONE, { initialLookahead: ALL_AHEAD })
  useImperativeHandle(ref, () => ({
    take() { releaseBlobs(); return blobMap },
  }))
  return null
}
