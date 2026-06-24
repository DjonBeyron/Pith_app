import { useEffect, useRef, useState } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { capturePosterFrame } from '../../shared/lib/videoFrame.js'

const LOOKAHEAD    = 3
const CONCURRENCY  = 2
const POLL_MS      = 200
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
        return isValidUrl(url) ? { id: ph.fileId, url, nodeType: 'photo_choice' } : null
      })
      .filter(Boolean)
  }
  const fileId = node.typeData?.[node.type]?.file_id
  if (!fileId) return []
  const f   = files.find(fl => fl.id === fileId)
  const url = f?.r2Url ?? node.typeData?.[node.type]?.r2Url ?? null
  return isValidUrl(url) ? [{ id: fileId, url, nodeType: node.type }] : []
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

  const [blobMap, setBlobMap] = useState(() => ({ ...initRef.current }))
  const [queueTotal, setQueueTotal] = useState(0)
  const [readyNodeIds, setReadyNodeIds] = useState(() => new Set())

  // Debug overlay: one item per download, updated in place
  const debugItemsRef = useRef(new Map())
  const [debugTick, setDebugTick] = useState(0)
  const tick = () => setDebugTick(t => t + 1)

  // Eviction
  const [evictLog, setEvictLog] = useState([])
  const evictLogRef     = useRef([])
  const evictingIdsRef  = useRef(new Set())
  const visibleNodesRef = useRef(visibleNodes)

  const blobUrlsRef    = useRef({ ...initRef.current })
  const genRef         = useRef(0)
  const queueRef       = useRef([])
  const cursorRef      = useRef(0)
  const allowUpToRef   = useRef(initialLookahead)
  const inFlightRef    = useRef(0)
  const byIdRef        = useRef({})
  const startTimeRef   = useRef(Date.now())

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
      pLog(`[evict] seq=${item.nodeSeq} ${item.nodeType} revealed=${revealed.length + 1}→${CHAT_BUFFER_SIZE}`)
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

  async function fetchOne(item, gen) {
    const { id, url, nodeType, nodeSeq, nodeId } = item
    const label    = `seq=${nodeSeq} type=${nodeType}`
    const startTs  = ts()
    const key      = `${nodeSeq}_${id}`
    const debugItem = {
      key, seq: nodeSeq, type: nodeType, url, startTs,
      readyTs: null, sizeKb: null, msgTs: null, status: 'start', error: null, httpStatus: null,
    }
    debugItemsRef.current.set(key, debugItem)
    pLog('PlayerPreload start:', label)
    console.log('[PRELOAD] start', label, url.slice(-40))
    tick()
    inFlightRef.current++

    let blobUrl = null
    try {
      const res = await fetch(url)
      debugItem.httpStatus = res.status
      console.log('[PRELOAD] fetch ответ', label, res.status, res.ok ? 'ok' : 'ОШИБКА')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (genRef.current !== gen) return

      // Stream with progress so large files show % instead of hanging silently
      const total = Number(res.headers.get('content-length')) || 0
      const reader = res.body.getReader()
      const chunks = []
      let loaded = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (genRef.current !== gen) return
        chunks.push(value)
        loaded += value.length
        if (total) {
          debugItem.progress = Math.round(loaded / total * 100)
          tick()
        }
      }
      const blob = new Blob(chunks)
      if (genRef.current !== gen) return
      blobUrl = URL.createObjectURL(blob)
      debugItem.readyTs = ts()
      debugItem.sizeKb  = Math.round(blob.size / 1024)
      debugItem.status  = 'ready'
      debugItem.progress = 100
      pLog('PlayerPreload ready:', label, debugItem.sizeKb, 'KB')
      tick()
    } catch (e) {
      debugItem.status  = 'error'
      debugItem.error   = e.message
      debugItem.readyTs = ts()
      pLog('PlayerPreload error:', label, e.message)
      console.error('[PRELOAD] ОШИБКА', label, e)
      blobUrlsRef.current[id] = { blobUrl: null, error: true }
      tick()
      inFlightRef.current--
      // Mark node ready even on error so progress bar doesn't freeze
      if (checkNodeReady(nodeId)) {
        setReadyNodeIds(prev => { const s = new Set(prev); s.add(nodeId); return s })
      }
      return
    }

    // Release download slot immediately — poster runs in background, doesn't block queue
    inFlightRef.current--

    // Publish blobUrl right away so modules can start playing
    blobUrlsRef.current[id] = { blobUrl, posterUrl: null }
    setBlobMap(prev => ({ ...prev, [id]: { blobUrl, posterUrl: null } }))

    // Mark node as ready when all its files are downloaded
    if (checkNodeReady(nodeId)) {
      setReadyNodeIds(prev => { const s = new Set(prev); s.add(nodeId); return s })
    }

    // Evict if revealed buffer is over limit
    if (EVICT_TYPES.has(nodeType)) await evictFarthestIfNeeded(gen, id)

    if (!POSTER_TYPES.has(nodeType)) return

    pLog('PlayerPreload poster start:', label)
    const posterUrl = await capturePosterFrame(blobUrl, 4000)
    if (genRef.current !== gen) {
      // Only revoke if we still own the blob
      if (blobUrlsRef.current[id]) URL.revokeObjectURL(blobUrl)
      if (posterUrl) URL.revokeObjectURL(posterUrl)
      return
    }
    pLog('PlayerPreload poster:', posterUrl ? 'ok' : 'null (timeout)', label)
    if (posterUrl) {
      blobUrlsRef.current[id].posterUrl = posterUrl
      setBlobMap(prev => ({ ...prev, [id]: { ...prev[id], posterUrl } }))
    }
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
      pLog('PlayerPreload reorder → active:', [...new Set(active.map(i => i.nodeSeq))].join(','),
        '/ speculative:', [...new Set(speculative.map(i => i.nodeSeq))].join(','))
    }
    // New nodes became revealed → re-check buffer (preloaded-ahead files now count)
    evictFarthestIfNeeded(genRef.current, null).catch(console.error)
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
    tick()
    byIdRef.current     = Object.fromEntries(nodes.map(n => [n.id, n]))
    queueRef.current    = buildItemQueue(nodes, files)
    cursorRef.current   = 0
    inFlightRef.current = 0
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

    if (!queueRef.current.length || !files.length) return

    async function runQueue() {
      let lastBlockLog = 0
      while (genRef.current === gen) {
        if (cursorRef.current >= queueRef.current.length && inFlightRef.current === 0) {
          console.log('[PRELOAD] очередь завершена, cursor=' + cursorRef.current + ' len=' + queueRef.current.length)
          break
        }
        const item = queueRef.current[cursorRef.current]
        const done = cursorRef.current >= queueRef.current.length
        const atGate = !done && item && item.nodeIdx >= allowUpToRef.current && inFlightRef.current === 0
        if (done || (item && item.nodeIdx >= allowUpToRef.current) || inFlightRef.current >= CONCURRENCY) {
          // Only log when blocked on concurrency or done — not when silently waiting at the gate
          if (!atGate) {
            const now = Date.now()
            if (now - lastBlockLog > 2000) {
              lastBlockLog = now
              console.log('[PRELOAD] ожидание:', {
                done,
                cursor: cursorRef.current,
                queueLen: queueRef.current.length,
                nodeIdx: item?.nodeIdx,
                allowUpTo: allowUpToRef.current,
                inFlight: inFlightRef.current,
                CONCURRENCY,
              })
            }
          }
          await new Promise(r => setTimeout(r, POLL_MS))
          continue
        }
        cursorRef.current++
        // Skip if blobUrl already present (evicted entries have blobUrl=null → re-download ok)
        if (blobUrlsRef.current[item.id]?.blobUrl) continue
        fetchOne(item, gen)
      }
    }
    runQueue()
    return () => { genRef.current++ }
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

  const debugItems = [...debugItemsRef.current.values()]
  return { blobMap, queueTotal, readyNodeIds, warmupNodeIds, initialized, debugItems, addMsgTs, releaseBlobs, evictLog }
}
