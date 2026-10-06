import { capturePosterFrame } from '../../shared/lib/videoFrame.js'
import { POSTER_TYPES, EVICT_TYPES } from './preloadFetchOne.js'

// Выгрузка (eviction) дальних blob-ов прогрева — вынесено из
// usePlayerPreload.js (упирался в потолок 400 строк) без изменения логики.
// В счёт буфера идут только ПОКАЗАННЫЕ (visibleNodes) тяжёлые файлы
// (EVICT_TYPES); скачанное вперёд — бесплатно, в счёт попадает при показе.
// Собирается в момент вызова из рефов хука (ctx), как makePreloadFetch.
//
// limit() — текущий размер буфера. Не константа: при «Продолжить урок» лента
// стартует сразу с HISTORY_PAGE строк истории, и их файлы (только что
// прогретые карточкой запуска) превышали буфер в 5 — выгружались на первом
// же кадре. Хук даёт запас на старт и снимает его по одной ноде с каждым
// новым сообщением (см. graceRef в usePlayerPreload.js)
export function makeEvict(ctx) {
  const {
    genRef, blobUrlsRef, setBlobMap, queueRef, visibleNodesRef, evictingIdsRef,
    evictLogRef, setEvictLog, ts, limit,
  } = ctx

  function revealedEvictableFids() {
    const visNodeIds = new Set(visibleNodesRef.current.map(n => n.id))
    return Object.entries(blobUrlsRef.current)
      .filter(([id, entry]) => {
        if (!entry?.blobUrl) return false
        if (evictingIdsRef.current.has(id)) return false
        const item = queueRef.current.find(i => i.id === id)
        if (!item) return false
        if (!EVICT_TYPES.has(item.nodeType)) return false
        return visNodeIds.has(item.nodeId)
      })
      .map(([id]) => id)
  }

  async function evictFarthestIfNeeded(gen, justLoadedId) {
    let revealed = revealedEvictableFids()
    while (revealed.length > limit()) {
      if (genRef.current !== gen) return
      const candidates = justLoadedId ? revealed.filter(id => id !== justLoadedId) : revealed
      if (!candidates.length) break
      // Выгружаем самый давний ПО ПОКАЗУ (место ноды в ленте), а не по BFS-
      // индексу: в циклах «ошибся → подсказка → снова тот же вопрос» и после
      // «Продолжить урок» маленький индекс бывал у только что показанной ноды
      const order = new Map(visibleNodesRef.current.map((n, i) => [n.id, i]))
      const rank = id => {
        const item = queueRef.current.find(i => i.id === id)
        return order.get(item?.nodeId) ?? item?.nodeIdx ?? Infinity
      }
      const evictId = candidates.reduce((minId, id) => (rank(id) < rank(minId) ? id : minId), candidates[0])
      if (evictingIdsRef.current.has(evictId)) {
        revealed = revealed.filter(id => id !== evictId)
        continue
      }
      evictingIdsRef.current.add(evictId)
      revealed = revealed.filter(id => id !== evictId)
      const item  = queueRef.current.find(i => i.id === evictId)
      const entry = blobUrlsRef.current[evictId]
      if (!entry || !item) { evictingIdsRef.current.delete(evictId); continue }
      const log = { ts: ts(), id: evictId, seq: item.nodeSeq, type: item.nodeType }
      evictLogRef.current = [...evictLogRef.current, log]
      setEvictLog([...evictLogRef.current])
      if (POSTER_TYPES.has(item.nodeType)) {
        let posterUrl = entry.posterUrl
        if (!posterUrl) posterUrl = await capturePosterFrame(entry.blobUrl, 2000)
        if (genRef.current !== gen) { evictingIdsRef.current.delete(evictId); return }
        blobUrlsRef.current[evictId] = { blobUrl: null, posterUrl, evicted: true }
      } else {
        blobUrlsRef.current[evictId] = { blobUrl: null, evicted: true }
      }
      setBlobMap(prev => ({ ...prev, [evictId]: blobUrlsRef.current[evictId] }))
      // Отзыв — ПОСЛЕ того, как React докоммитит новый blobMap: раскрытая
      // кнопкой «показать раньше» старая строка могла смонтировать <audio>
      // с этим blob в том же рендере, что и попала под вытеснение — отзыв до
      // коммита ронял её загрузку (ERR_FILE_NOT_FOUND), а так элемент успевает
      // переключиться на прямую ссылку и blob-запрос просто отменяется
      setTimeout(() => URL.revokeObjectURL(entry.blobUrl), 1000)
      evictingIdsRef.current.delete(evictId)
    }
  }

  return evictFarthestIfNeeded
}
