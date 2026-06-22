import { useEffect, useRef, useState } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { capturePosterFrame } from '../../shared/lib/videoFrame.js'

const LOOKAHEAD    = 3
const CONCURRENCY  = 2
const POLL_MS      = 200
const MEDIA_TYPES  = new Set(['audio', 'voice_record', 'video', 'circle', 'photo', 'sticker', 'photo_choice'])
const POSTER_TYPES = new Set(['video', 'circle', 'sticker'])

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
  const { initialLookahead = LOOKAHEAD, initialBlobMap = null } = opts
  const initRef = useRef(initialBlobMap ?? {})

  const [blobMap, setBlobMap] = useState(() => ({ ...initRef.current }))

  // Debug overlay: one item per download, updated in place
  const debugItemsRef = useRef(new Map())
  const [debugTick, setDebugTick] = useState(0)
  const tick = () => setDebugTick(t => t + 1)

  const blobUrlsRef  = useRef({ ...initRef.current })
  const genRef       = useRef(0)
  const queueRef     = useRef([])
  const cursorRef    = useRef(0)
  const allowUpToRef = useRef(initialLookahead)
  const inFlightRef  = useRef(0)
  const byIdRef      = useRef({})
  const startTimeRef = useRef(Date.now())

  function ts() {
    const s = (Date.now() - startTimeRef.current) / 1000
    return `+${s.toFixed(1)}`
  }

  // Called from LessonPlayer when a node becomes visible in chat
  function addMsgTs(seq, tsStr) {
    debugItemsRef.current.forEach(item => {
      if (item.seq === seq && !item.msgTs) {
        item.msgTs = tsStr
      }
    })
    tick()
  }

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
      const activeSeqs = [...new Set(active.map(i => i.nodeSeq))].join(',')
      const specSeqs   = [...new Set(speculative.map(i => i.nodeSeq))].join(',')
      pLog('PlayerPreload reorder → active:', activeSeqs, '/ speculative:', specSeqs)
    }
  }, [visibleNodes]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const gen = genRef.current

    // Revoke only entries this hook created — not ones from initialBlobMap
    Object.entries(blobUrlsRef.current).forEach(([id, entry]) => {
      if (!initRef.current[id]) revokeEntry(entry)
    })
    blobUrlsRef.current = { ...initRef.current }  // preserve pre-loaded blobs
    setBlobMap({ ...initRef.current })
    debugItemsRef.current = new Map()
    startTimeRef.current = Date.now()
    allowUpToRef.current = initialLookahead
    tick()
    byIdRef.current    = Object.fromEntries(nodes.map(n => [n.id, n]))
    queueRef.current   = buildItemQueue(nodes, files)
    cursorRef.current  = 0
    inFlightRef.current  = 0

    if (!queueRef.current.length || !files.length) return

    async function fetchOne(item) {
      const { id, url, nodeType, nodeSeq } = item
      const label = `seq=${nodeSeq} type=${nodeType}`
      const startTs = ts()
      const key = `${nodeSeq}_${id}`
      const debugItem = { key, seq: nodeSeq, type: nodeType, startTs, readyTs: null, sizeKb: null, msgTs: null, status: 'start', error: null }
      debugItemsRef.current.set(key, debugItem)
      pLog('PlayerPreload start:', label)
      tick()
      inFlightRef.current++

      let blobUrl = null
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        if (genRef.current !== gen) return
        const blob = await res.blob()
        if (genRef.current !== gen) return
        blobUrl = URL.createObjectURL(blob)
        debugItem.readyTs = ts()
        debugItem.sizeKb  = Math.round(blob.size / 1024)
        debugItem.status  = 'ready'
        pLog('PlayerPreload ready:', label, debugItem.sizeKb, 'KB')
        tick()
      } catch (e) {
        debugItem.status = 'error'
        debugItem.error  = e.message
        debugItem.readyTs = ts()
        pLog('PlayerPreload error:', label, e.message)
        tick()
        inFlightRef.current--
        return
      }

      // Release download slot immediately — poster runs in background, doesn't block queue
      inFlightRef.current--

      // Publish blobUrl right away so video module can start playing
      blobUrlsRef.current[id] = { blobUrl, posterUrl: null }
      setBlobMap(prev => ({ ...prev, [id]: { blobUrl, posterUrl: null } }))

      if (!POSTER_TYPES.has(nodeType)) return

      pLog('PlayerPreload poster start:', label)
      const posterUrl = await capturePosterFrame(blobUrl, 4000)
      if (genRef.current !== gen) {
        // Only revoke if we still own the blob — if releaseBlobs() was called,
        // blobUrlsRef is empty and the blobs belong to the player now.
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

    async function runQueue() {
      while (genRef.current === gen) {
        if (cursorRef.current >= queueRef.current.length && inFlightRef.current === 0) break

        const item = queueRef.current[cursorRef.current]
        const done = cursorRef.current >= queueRef.current.length

        if (done || (item && item.nodeIdx >= allowUpToRef.current) || inFlightRef.current >= CONCURRENCY) {
          await new Promise(r => setTimeout(r, POLL_MS))
          continue
        }

        cursorRef.current++
        if (blobUrlsRef.current[item.id]) continue
        fetchOne(item)
      }
    }

    runQueue()
    return () => { genRef.current++ }
  }, [nodes, files]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { Object.values(blobUrlsRef.current).forEach(revokeEntry) }
  }, [])

  // Transfer ownership of all blob URLs to the caller (card → player handoff).
  // After calling this, the hook's cleanup will revoke nothing.
  function releaseBlobs() { blobUrlsRef.current = {} }

  const debugItems = [...debugItemsRef.current.values()]
  return { blobMap, debugItems, addMsgTs, releaseBlobs }
}
