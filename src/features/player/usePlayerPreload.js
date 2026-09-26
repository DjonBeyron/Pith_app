import { useEffect, useRef, useState } from 'react'
import { capturePosterFrame } from '../../shared/lib/videoFrame.js'
import { pLog } from '../../shared/lib/debug.js'
import { forwardReachable, buildItemQueue, revokeEntry } from './preloadQueue.js'
import { usePreloadProgress } from './usePreloadProgress.js'
import { makePreloadFetch, POSTER_TYPES, EVICT_TYPES } from './preloadFetchOne.js'

const LOOKAHEAD    = 3
const CONCURRENCY  = 2
export const CHAT_BUFFER_SIZE = 5
const MEDIA_TYPES  = new Set(['audio', 'voice_record', 'video', 'circle', 'photo', 'sticker', 'photo_choice', 'table'])
// POSTER_TYPES / EVICT_TYPES — в preloadFetchOne.js (там же и загрузка файла)

export function usePlayerPreload(nodes, files, visibleNodes, opts = {}) {
  const { initialLookahead = LOOKAHEAD, initialBlobMap = null, bufferSize = CHAT_BUFFER_SIZE } = opts
  const initRef = useRef(initialBlobMap ?? {})

  const [blobMap, setBlobMap] = useState(() => ({ ...(initialBlobMap ?? {}) }))
  const [queueTotal, setQueueTotal] = useState(0)
  const [readyNodeIds, setReadyNodeIds] = useState(() => new Set())

  // Eviction
  const [evictLog, setEvictLog] = useState([])
  const evictLogRef     = useRef([])
  const evictingIdsRef  = useRef(new Set())
  const visibleNodesRef = useRef(visibleNodes)

  const blobUrlsRef    = useRef({ ...(initialBlobMap ?? {}) })
  const genRef         = useRef(0)
  const queueRef       = useRef([])
  const cursorRef      = useRef(0)
  const allowUpToRef   = useRef(initialLookahead)
  // Сколько элементов уже взято «вперёд по пути» с последнего переупорядочивания
  // очереди (см. гейт в pump и эффект visibleNodes)
  const aheadRef       = useRef(0)
  const inFlightRef    = useRef(0)
  const byIdRef        = useRef({})
  const startTimeRef   = useRef(0) // выставляется в Date.now() при rebuild-эффекте

  // Байтовый прогресс, процент прогрева, реестр загрузок — usePreloadProgress.js
  const {
    debugItemsRef, bytesTotalRef, bytesLoadedRef, warmupPct, tick, throttledTick, cancelFlush, markFailed,
  } = usePreloadProgress(queueRef, initialLookahead)

  const [warmupNodeIds, setWarmupNodeIds] = useState([])
  const [initialized, setInitialized]     = useState(false)

  useEffect(() => { visibleNodesRef.current = visibleNodes }, [visibleNodes])

  function ts() {
    const s = (Date.now() - startTimeRef.current) / 1000
    return `+${s.toFixed(1)}`
  }

  function addMsgTs(seq, tsStr) {
    debugItemsRef.current.forEach(item => {
      if (item.seq === seq && !item.msgTs) item.msgTs = tsStr
    })
    tick()
  }

  // ─── Eviction ────────────────────────────────────────────────────────────
  // Counts only revealed (visible) evictable files against the buffer limit.
  // Preloaded-ahead files are free — they only enter the count once revealed.

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

  // Returns true when all queue items for this node have a blobUrl or errored out.
  function checkNodeReady(nodeId) {
    const items = queueRef.current.filter(i => i.nodeId === nodeId)
    if (!items.length) return true
    return items.every(i => blobUrlsRef.current[i.id]?.blobUrl || blobUrlsRef.current[i.id]?.error)
  }

  async function evictFarthestIfNeeded(gen, justLoadedId) {
    let revealed = revealedEvictableFids()
    while (revealed.length > bufferSize) {
      if (genRef.current !== gen) return
      const candidates = justLoadedId ? revealed.filter(id => id !== justLoadedId) : revealed
      if (!candidates.length) break
      // Evict the file with the lowest nodeIdx (furthest back in history)
      const evictId = candidates.reduce((minId, id) => {
        const a = queueRef.current.find(i => i.id === id)?.nodeIdx ?? Infinity
        const b = queueRef.current.find(i => i.id === minId)?.nodeIdx ?? Infinity
        return a < b ? id : minId
      }, candidates[0])
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
        URL.revokeObjectURL(entry.blobUrl)
        blobUrlsRef.current[evictId] = { blobUrl: null, posterUrl, evicted: true }
      } else {
        URL.revokeObjectURL(entry.blobUrl)
        blobUrlsRef.current[evictId] = { blobUrl: null, evicted: true }
      }
      setBlobMap(prev => ({ ...prev, [evictId]: blobUrlsRef.current[evictId] }))
      evictingIdsRef.current.delete(evictId)
    }
  }

  // ─── Download ────────────────────────────────────────────────────────────
  // Событийная очередь: pump добирает свободные слоты до CONCURRENCY. Вызывается
  // при старте, после каждого завершённого скачивания и при сдвиге гейта — без таймеров.

  function pump(gen) {
    if (genRef.current !== gen) return
    while (inFlightRef.current < CONCURRENCY && cursorRef.current < queueRef.current.length) {
      const item = queueRef.current[cursorRef.current]
      // Гейт по BFS-индексу (nodeIdx) ИЛИ первые LOOKAHEAD элементов очереди
      // после курсора. Одного nodeIdx мало: в ветвящемся уроке (выбор, сигналы)
      // ближайшие по BFS ноды лежат на чужих ветках, а следующее голосовое по
      // РЕАЛЬНОМУ пути имеет индекс много больше гейта — эффект visibleNodes
      // ставит его первым в очереди (forwardReachable), но гейт по индексу его
      // не пропускал, и файл качался только когда нода уже показана: в логе
      // play() при readyState=1, rate=0.3 первые секунды, текст и заливка
      // разъезжались со звуком, буферящимся с сети
      const ahead = aheadRef.current < LOOKAHEAD
      if (item.nodeIdx >= allowUpToRef.current && !ahead) return
      cursorRef.current++
      // Skip if blobUrl already present (evicted entries have blobUrl=null → re-download ok)
      if (blobUrlsRef.current[item.id]?.blobUrl) continue
      if (item.nodeIdx >= allowUpToRef.current) {
        aheadRef.current++
        pLog(`[preload] вперёд по пути: seq=${item.nodeSeq} ${item.nodeType} idx=${item.nodeIdx} (гейт ${allowUpToRef.current}, ${aheadRef.current}/${LOOKAHEAD})`)
      }
      fetchOne(item, gen)
    }
  }

  // Загрузка одного файла очереди (+ мета голосового и постер в фоне) —
  // preloadFetchOne.js. Собирается в момент вызова (из pump, то есть из
  // эффектов), а не при рендере: те же рефы, сеттеры и функции этого хука
  function fetchOne(item, gen) {
    return makePreloadFetch({
      genRef, blobUrlsRef, setBlobMap, setReadyNodeIds, inFlightRef,
      debugItemsRef, bytesLoadedRef, bytesTotalRef, tick, throttledTick, markFailed,
      ts, checkNodeReady, evictFarthestIfNeeded, pump,
    })(item, gen)
  }

  // ─── visibleNodes: reorder queue + eviction check ────────────────────────
  useEffect(() => {
    if (!visibleNodes.length) return
    // Гейт считаем от МЕСТА в очереди (nodeIdx — BFS-расстояние от начала
    // урока), а не от числа увиденных ЗА ЭТУ СЕССИЮ медиа-нод. Раньше это
    // было одно и то же только потому, что сессия всегда начиналась с ноды
    // 0 — счёт «сколько видели» совпадал с позицией в очереди. При
    // «Продолжить урок» (startNodeId где-то в середине графа) видимых нод
    // за сессию мало (счёт с нуля), а их реальный nodeIdx уже большой —
    // гейт оставался маленьким и блокировал докачку файлов рядом с точкой
    // возобновления: голосовые играли «в лоб» с сервера без буфера
    // (readyState=0 в момент play(), реальные паузы на несколько секунд)
    const nodeIdxById = new Map(queueRef.current.map(item => [item.nodeId, item.nodeIdx]))
    const maxVisibleIdx = visibleNodes.reduce((max, n) => {
      const idx = nodeIdxById.get(n.id)
      return idx != null && idx > max ? idx : max
    }, -1)
    const needed = maxVisibleIdx + 1 + LOOKAHEAD
    if (needed > allowUpToRef.current) {
      pLog(`[preload] гейт ${allowUpToRef.current}→${needed} (дальняя видимая нода idx=${maxVisibleIdx})`)
      allowUpToRef.current = needed
    }

    const lastVisible = visibleNodes[visibleNodes.length - 1]
    if (!lastVisible) return
    const reach     = forwardReachable(lastVisible, byIdRef.current)
    const loaded    = cursorRef.current
    const remaining = queueRef.current.slice(loaded)
    const active      = remaining.filter(item =>  reach.has(item.nodeId))
    const speculative = remaining.filter(item => !reach.has(item.nodeId))
    if (speculative.length > 0) {
      queueRef.current = [...queueRef.current.slice(0, loaded), ...active, ...speculative]
    }
    // Новая видимая нода — снова можно взять LOOKAHEAD файлов вперёд по пути
    aheadRef.current = 0
    evictFarthestIfNeeded(genRef.current, null).catch(() => {})
    pump(genRef.current)
  }, [visibleNodes]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── nodes/files: rebuild everything ─────────────────────────────────────
  useEffect(() => {
    const gen = genRef.current

    // Revoke only entries this hook created — not ones from initialBlobMap
    Object.entries(blobUrlsRef.current).forEach(([id, entry]) => {
      if (!initRef.current[id]) revokeEntry(entry)
    })
    blobUrlsRef.current = { ...initRef.current }
    setBlobMap({ ...initRef.current })
    setInitialized(false)
    setWarmupNodeIds([])
    debugItemsRef.current = new Map()
    evictLogRef.current = []
    setEvictLog([])
    evictingIdsRef.current.clear()
    startTimeRef.current = Date.now()
    allowUpToRef.current = initialLookahead
    byIdRef.current     = Object.fromEntries(nodes.map(n => [n.id, n]))
    queueRef.current    = buildItemQueue(nodes, files, MEDIA_TYPES)
    cursorRef.current   = 0
    inFlightRef.current = 0
    // Ожидаемые размеры из метаданных files — бар честный с первого чанка
    bytesTotalRef.current  = new Map(queueRef.current.filter(i => i.size).map(i => [i.id, i.size]))
    bytesLoadedRef.current = new Map()
    tick()
    // Count only items within the warmup gate (nodeIdx < initialLookahead)
    const warmup = queueRef.current.filter(item => item.nodeIdx < initialLookahead).length
    setQueueTotal(warmup || queueRef.current.length)
    // Expose the exact node IDs being warmed up (BFS order, ≤ initialLookahead nodes)
    const warmupIds = [...new Set(
      queueRef.current.filter(i => i.nodeIdx < initialLookahead).map(i => i.nodeId)
    )]
    setWarmupNodeIds(warmupIds)
    setInitialized(true)
    // Диагностика handoff: сколько файлов уже пришло с блобами из карточки запуска
    const handoff = queueRef.current.filter(i => blobUrlsRef.current[i.id]?.blobUrl).length
    pLog(`[preload] очередь: ${queueRef.current.length} файлов, с handoff-блобами: ${handoff}, warmup-нод: ${warmupIds.length}`)
    const pcItems = queueRef.current.filter(i => i.nodeType === 'photo_choice')
    if (pcItems.length) {
      const pcBlobs = pcItems.filter(i => blobUrlsRef.current[i.id]?.blobUrl).length
      pLog(`[preload] photo_choice: ${pcBlobs}/${pcItems.length} фото с блобами на старте`)
    }
    // Nodes with no downloadable files are ready immediately
    const nodesWithDownloads = new Set(queueRef.current.map(i => i.nodeId))
    const autoReady = new Set(
      nodes.filter(n => MEDIA_TYPES.has(n.type) && !nodesWithDownloads.has(n.id)).map(n => n.id)
    )
    setReadyNodeIds(autoReady)

    // If player starts with preloaded blobs, advance gate past already-cached items
    if (Object.keys(initRef.current).length > 0) {
      const maxPreloadedIdx = queueRef.current.reduce((max, item) =>
        blobUrlsRef.current[item.id] ? Math.max(max, item.nodeIdx + 1) : max, 0)
      if (maxPreloadedIdx + LOOKAHEAD > allowUpToRef.current) {
        allowUpToRef.current = maxPreloadedIdx + LOOKAHEAD
      }
    }

    // Safety net: if warmup nodes are still not ready after 10s, force-unblock the
    // progress bar. Handles capturePosterFrame hangs, gen-mismatch early-returns, etc.
    const SAFETY_MS = 10_000
    const safetyTimer = setTimeout(() => {
      if (genRef.current !== gen) return
      setReadyNodeIds(prev => {
        const next = new Set(prev)
        warmupIds.forEach(id => next.add(id))
        return next
      })
    }, SAFETY_MS)

    if (queueRef.current.length && files.length) pump(gen)
    return () => {
      genRef.current++
      clearTimeout(safetyTimer)
      cancelFlush()
    }
  }, [nodes, files]) // eslint-disable-line react-hooks/exhaustive-deps

  // Размонтирование: blob-ссылки освобождаются на следующем такте и только
  // если хук не смонтировался снова. StrictMode в dev «размонтирует» и тут же
  // монтирует заново — сразу отозванные ссылки, переданные карточкой запуска
  // или прогревом карточки повторения (initialBlobMap), терялись, и файлы
  // качались второй раз
  const releaseTimerRef = useRef(null)
  useEffect(() => {
    clearTimeout(releaseTimerRef.current)
    return () => {
      releaseTimerRef.current = setTimeout(() => {
        Object.values(blobUrlsRef.current).forEach(revokeEntry)
        blobUrlsRef.current = {}
        initRef.current = {}
      }, 0)
    }
  }, [])

  // Transfer ownership of all blob URLs to the caller (card → player handoff).
  function releaseBlobs() { blobUrlsRef.current = {} }

  // Дебаг-оверлей живёт в ref и «дёргается» через setDebugTick — чтение при рендере намеренное
  // eslint-disable-next-line react-hooks/refs
  const debugItems = [...debugItemsRef.current.values()]
  return { blobMap, queueTotal, readyNodeIds, warmupNodeIds, warmupPct, initialized, debugItems, addMsgTs, releaseBlobs, evictLog }
}
