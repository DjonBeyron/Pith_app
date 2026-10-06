import { POSTER_TYPES } from './preloadFetchOne.js'

// «Нода прогрета» — её можно показывать в чате так, чтобы ничего не доезжало
// после появления: у фото/голосового/кружка есть blob, у кружка/видео/стикера
// снят постер, у голосового посчитаны длительность и волна. Это строже, чем
// readyNodeIds прогрева (там — «байты в памяти», для прогресс-бара карточки
// запуска): по этому предикату граф урока (useGraphPlayer.js) держит точки
// «печатает» до готовности следующей ноды, но не дольше WARM_MAX_MS.
//
// items   — записи очереди прогрева этой ноды (preloadQueue.js: {id, nodeType})
// entries — blobUrlsRef/blobMap: id → { blobUrl, posterUrl, posterDone,
//           metaDone, evicted, error }
export function isNodeWarm(items, entries) {
  for (const item of items) {
    const e = entries[item.id]
    if (!e) return false
    // Не скачался или уже выгружен: ждать нечего — модуль возьмёт прямую ссылку
    if (e.error || e.evicted) continue
    if (!e.blobUrl) return false
    if (POSTER_TYPES.has(item.nodeType) && !e.posterUrl && !e.posterDone) return false
    if (item.nodeType === 'audio' && !e.metaDone) return false
  }
  return true
}

// Сколько ещё держать «печатает» сверх обычной паузы, пока нода не прогрета.
// Слабая сеть — нода может не успеть и за это время; тогда показываем как
// есть (дальше работают запасные пути модулей: прямая ссылка, скелетон,
// кольцо загрузки у голосового)
export const WARM_MAX_MS = 4000
export const WARM_POLL_MS = 100
