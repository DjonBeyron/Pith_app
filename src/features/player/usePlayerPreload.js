import { useEffect, useRef, useState } from 'react'
import { capturePosterFrame } from '../../shared/lib/videoFrame.js'
import { enqueuePosterCapture } from './posterQueue.js'
import { fetchBlobWithRetry } from './preloadFetch.js'

const LOOKAHEAD    = 3
const CONCURRENCY  = 2
const FALLBACK_SIZE = 500 * 1024 // вес файла с неизвестным размером в байтовом прогрессе
export const CHAT_BUFFER_SIZE = 5
const MEDIA_TYPES  = new Set(['audio', 'voice_record', 'video', 'circle', 'photo', 'sticker', 'photo_choice'])
const POSTER_TYPES = new Set(['video', 'circle', 'sticker'])
// Only heavy media is evicted — photos/stickers are small, photo_choice panels are special
const EVICT_TYPES  = new Set(['audio', 'voice_record', 'video', 'circle'])

function isValidUrl(url) {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))
}

function bfsOrder(nodes) {
  if (!nodes.length) return []
  const byId  = Object.fromEntries(nodes.map(n => [n.id, n]))
  const entry = nodes.find(n => n.seq === 1)
    ?? nodes.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0]
  const visited = new Set()
  const queue   = [entry]
  const ordered = []
  while (queue.length) {
    const n = queue.shift()
    if (visited.has(n.id)) continue
    visited.add(n.id)
    ordered.push(n)
    for (const t of (n.triggers ?? [])) {
      if (t.then && byId[t.then] && !visited.has(t.then)) queue.push(byId[t.then])
    }
  }
  for (const n of nodes) if (!visited.has(n.id)) ordered.push(n)
  return ordered
}

function forwardReachable(node, byId) {
  const reach = new Set()
  const q     = [node]
  while (q.length) {
    const n = q.shift()
    if (reach.has(n.id)) continue
    reach.add(n.id)
    for (const t of (n.triggers ?? [])) {
      if (t.then && byId[t.then]) q.push(byId[t.then])
    }
  }
  return reach
}

function nodeDownloads(node, files) {
  if (node.type === 'photo_choice') {
    return (node.typeData?.photo_choice?.photos ?? [])
      .map(ph => {
        const f   = files.find(fl => fl.id === ph.fileId)
        const url = f?.r2Url ?? ph.photoUrl ?? null
        return isValidUrl(url) ? { id: ph.fileId, url, size: f?.size ?? 0, nodeType: 'photo_choice' } : null
      })
      .filter(Boolean)
  }
  const fileId = node.typeData?.[node.type]?.file_id
  if (!fileId) return []
  const f   = files.find(fl => fl.id === fileId)
  const url = f?.r2Url ?? node.typeData?.[node.type]?.r2Url ?? null
  return isValidUrl(url) ? [{ id: fileId, url, size: f?.size ?? 0, nodeType: node.type }] : []
}

function buildItemQueue(nodes, files) {
  const mediaNodes = bfsOrder(nodes).filter(n => MEDIA_TYPES.has(n.type))
  return mediaNodes.flatMap((n, nodeIdx) =>
    nodeDownloads(n, files).map(d => ({ ...d, nodeSeq: n.seq, nodeId: n.id, nodeIdx }))
  )
}

function revokeEntry(entry) {
  if (!entry) return
  if (entry.blobUrl)   URL.revokeObjectURL(entry.blobUrl)
  if (entry.posterUrl) URL.revokeObjectURL(entry.posterUrl)
}

export function usePlayerPreload(nodes, files, visibleNodes, opts = {}) {
  const { initialLookahead = LOOKAHEAD, initialBlobMap = null, bufferSize = CHAT_BUFFER_SIZE } = opts
  const initRef = useRef(initialBlobMap ?? {})

  const [blobMap, setBlobMap] = useState(() => ({ ...(initialBlobMap ?? {}) }))
  const [queueTotal, setQueueTotal] = useState(0)
  const [readyNodeIds, setReadyNodeIds] = useState(() => new Set())

  // Debug overlay: one item per download, updated in place
  const debugItemsRef = useRef(new Map())
  const [, setDebugTick] = useState(0)

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
  const inFlightRef    = useRef(0)
  const byIdRef        = useRef({})
  const startTimeRef   = useRef(0) // выставляется в Date.now() при rebuild-эффекте

  // Байтовый прогресс warmup-файлов — для честного плавного бара на карточке запуска
  const bytesTotalRef  = useRef(new Map())
  const bytesLoadedRef = useRef(new Map())
  const [warmupPct, setWarmupPct] = useState(0)
  const lastFlushRef   = useRef(0)
  const flushTimerRef  = useRef(null)

  function computeWarmupPct() {
    let loaded = 0
    let total  = 0
    for (const it of queueRef.current) {
      if (it.nodeIdx >= initialLookahead) continue
      const size = bytesTotalRef.current.get(it.id) || it.size || FALLBACK_SIZE
      total  += size
      loaded += Math.min(bytesLoadedRef.current.get(it.id) ?? 0, size)
    }
    return total ? Math.round(loaded / total * 100) : 100
  }

  const tick = () => {
    setWarmupPct(computeWarmupPct())
    setDebugTick(t => t + 1)
  }

  // Шторм чанков при скачивании → не чаще одного обновления state в 100 мс
  function throttledTick() {
    const now = Date.now()
    if (now - lastFlushRef.current >= 100) {
      lastFlushRef.current = now
      tick()
      return
    }
    if (flushTimerRef.current) return
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      lastFlushRef.current = Date.now()
      tick()
    }, 100)
  }

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
      if (item.nodeIdx >= allowUpToRef.current) return
      cursorRef.current++
      // Skip if blobUrl already present (evicted entries have blobUrl=null → re-download ok)
      if (blobUrlsRef.current[item.id]?.blobUrl) continue
      fetchOne(item, gen)
    }
  }

  async function fetchOne(item, gen) {
    const { id, url, nodeType, nodeSeq, nodeId } = item
    const key = `${nodeSeq}_${id}`
    const debugItem = {
      key, seq: nodeSeq, type: nodeType, url, startTs: ts(),
      readyTs: null, sizeKb: null, msgTs: null, status: 'start', error: null, httpStatus: null,
    }
    debugItemsRef.current.set(key, debugItem)
    tick()
    inFlightRef.current++

    let result = null
    try {
      result = await fetchBlobWithRetry(url, {
        isAlive: () => genRef.current === gen,
        onProgress: (loaded, total) => {
          bytesLoadedRef.current.set(id, loaded)
          if (total) {
            bytesTotalRef.current.set(id, total)
            debugItem.progress = Math.round(loaded / total * 100)
          }
          throttledTick()
        },
      })
    } catch (e) {
      debugItem.status     = 'error'
      debugItem.error      = e.message
      debugItem.httpStatus = e.httpStatus ?? null
      debugItem.readyTs    = ts()
      // Файл не скачался после всех попыток — для бара считается «завершённым»
      bytesLoadedRef.current.set(id, bytesTotalRef.current.get(id) || item.size || FALLBACK_SIZE)
      blobUrlsRef.current[id] = { blobUrl: null, error: true }
      setBlobMap(prev => ({ ...prev, [id]: { blobUrl: null, error: true } }))
      tick()
      inFlightRef.current--
      // Mark node ready even on error so progress bar doesn't freeze
      if (checkNodeReady(nodeId)) {
        setReadyNodeIds(prev => { const s = new Set(prev); s.add(nodeId); return s })
      }
      pump(gen)
      return
    }
    if (!result || genRef.current !== gen) { inFlightRef.current--; return }

    const blob    = result.blob
    const blobUrl = URL.createObjectURL(blob)
    debugItem.httpStatus = result.httpStatus
    debugItem.readyTs  = ts()
    debugItem.sizeKb   = Math.round(blob.size / 1024)
    debugItem.status   = 'ready'
    debugItem.progress = 100
    bytesTotalRef.current.set(id, blob.size)
    bytesLoadedRef.current.set(id, blob.size)
    tick()

    // Release download slot and immediately start the next queued download
    inFlightRef.current--

    // Publish blobUrl so already-visible modules can start using it immediately
    blobUrlsRef.current[id] = { blobUrl, posterUrl: null }
    setBlobMap(prev => ({ ...prev, [id]: { blobUrl, posterUrl: null } }))
    pump(gen)

    if (EVICT_TYPES.has(nodeType)) await evictFarthestIfNeeded(gen, id)

    // Node is ready as soon as bytes are in memory. Poster capture must NOT gate
    // readiness — slow Android decoders take seconds per file and froze the launch bar.
    if (checkNodeReady(nodeId)) {
      setReadyNodeIds(prev => { const s = new Set(prev); s.add(nodeId); return s })
    }
    if (!POSTER_TYPES.has(nodeType)) return

    // Background: still frame for <video poster> / eviction placeholder, one at a time.
    enqueuePosterCapture(blobUrl, posterUrl => {
      if (!posterUrl) return
      const entry = blobUrlsRef.current[id]
      if (genRef.current !== gen || !entry?.blobUrl || entry.posterUrl) {
        // gen changed, file evicted (eviction captures its own poster), or poster already set
        URL.revokeObjectURL(posterUrl)
        return
      }
      entry.posterUrl = posterUrl
      setBlobMap(prev => ({ ...prev, [id]: { ...prev[id], posterUrl } }))
    })
  }

  // ─── visibleNodes: reorder queue + eviction check ────────────────────────
  useEffect(() => {
    if (!visibleNodes.length) return
    const visibleMediaCount = visibleNodes.filter(n => MEDIA_TYPES.has(n.type)).length
    const needed = visibleMediaCount + LOOKAHEAD
    if (needed > allowUpToRef.current) allowUpToRef.current = needed

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
    queueRef.current    = buildItemQueue(nodes, files)
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
      if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null }
    }
  }, [nodes, files]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      Object.values(blobUrlsRef.current).forEach(revokeEntry)
      // Clear refs so StrictMode remount doesn't reuse revoked blob URLs
      blobUrlsRef.current = {}
      initRef.current = {}
    }
  }, [])

  // Transfer ownership of all blob URLs to the caller (card → player handoff).
  function releaseBlobs() { blobUrlsRef.current = {} }

  // Дебаг-оверлей живёт в ref и «дёргается» через setDebugTick — чтение при рендере намеренное
  // eslint-disable-next-line react-hooks/refs
  const debugItems = [...debugItemsRef.current.values()]
  return { blobMap, queueTotal, readyNodeIds, warmupNodeIds, warmupPct, initialized, debugItems, addMsgTs, releaseBlobs, evictLog }
}
