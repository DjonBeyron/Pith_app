import { useEffect, useRef, useState } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { capturePosterFrame } from '../../shared/lib/videoFrame.js'

const LOOKAHEAD    = 3   // preload this many media nodes ahead of last visible
const CONCURRENCY  = 2   // parallel downloads at once
const POLL_MS      = 200
const MEDIA_TYPES  = new Set(['audio', 'voice_record', 'video', 'circle', 'photo', 'sticker', 'photo_choice'])
const POSTER_TYPES = new Set(['video', 'circle', 'sticker'])

function isValidUrl(url) {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))
}

// BFS from entry (seq=1), following ALL trigger branches simultaneously.
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

// All nodes reachable forward from `node` via triggers (the confirmed branch).
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

// Returns [{id, url, nodeType}] for a single node.
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

// Build a flat queue of individual download items (one per file, not per node).
// Each item carries nodeIdx so allowUpTo gate works on node-count, not item-count.
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

export function usePlayerPreload(nodes, files, visibleNodes) {
  const [blobMap, setBlobMap] = useState({})

  // blobUrlsRef stores { blobUrl, posterUrl } per fileId
  const blobUrlsRef  = useRef({})
  const genRef       = useRef(0)
  // Flat queue: [{id, url, nodeType, nodeSeq, nodeId, nodeIdx}]
  const queueRef     = useRef([])
  const cursorRef    = useRef(0)
  const allowUpToRef = useRef(LOOKAHEAD)  // in node-count units
  const inFlightRef  = useRef(0)
  const byIdRef      = useRef({})

  // When user advances: open lookahead window and reorder toward confirmed branch.
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
      queueRef.current = [
        ...queueRef.current.slice(0, loaded),
        ...active,
        ...speculative,
      ]
      const activeSeqs = [...new Set(active.map(i => i.nodeSeq))].join(',')
      const specSeqs   = [...new Set(speculative.map(i => i.nodeSeq))].join(',')
      pLog('PlayerPreload reorder → active:', activeSeqs, '/ speculative:', specSeqs)
    }
  }, [visibleNodes]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const gen = genRef.current

    Object.values(blobUrlsRef.current).forEach(revokeEntry)
    blobUrlsRef.current = {}
    setBlobMap({})
    byIdRef.current    = Object.fromEntries(nodes.map(n => [n.id, n]))
    queueRef.current   = buildItemQueue(nodes, files)
    cursorRef.current  = 0
    allowUpToRef.current = LOOKAHEAD
    inFlightRef.current  = 0

    if (!queueRef.current.length || !files.length) return

    // Download one file, capture poster frame for video types, store result.
    async function fetchOne(item) {
      const { id, url, nodeType, nodeSeq } = item
      const label = `seq=${nodeSeq} type=${nodeType}`
      pLog('PlayerPreload start:', label)
      inFlightRef.current++
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        if (genRef.current !== gen) return
        const blob    = await res.blob()
        if (genRef.current !== gen) return
        const blobUrl = URL.createObjectURL(blob)
        pLog('PlayerPreload ready:', label, Math.round(blob.size / 1024), 'KB')

        let posterUrl = null
        if (POSTER_TYPES.has(nodeType)) {
          pLog('PlayerPreload poster start:', label)
          posterUrl = await capturePosterFrame(blobUrl, 4000)
          if (genRef.current !== gen) {
            URL.revokeObjectURL(blobUrl)
            if (posterUrl) URL.revokeObjectURL(posterUrl)
            return
          }
          pLog('PlayerPreload poster:', posterUrl ? 'ok' : 'null (timeout)', label)
        }

        const entry = { blobUrl, posterUrl }
        blobUrlsRef.current[id] = entry
        setBlobMap(prev => ({ ...prev, [id]: entry }))
      } catch (e) {
        pLog('PlayerPreload error:', label, e.message)
      } finally {
        inFlightRef.current--
      }
    }

    // Dispatcher: picks one item at a time, respects CONCURRENCY and allowUpTo gate.
    async function runQueue() {
      while (genRef.current === gen) {
        if (cursorRef.current >= queueRef.current.length && inFlightRef.current === 0) break

        const item = queueRef.current[cursorRef.current]
        const done = cursorRef.current >= queueRef.current.length

        if (
          done ||
          (item && item.nodeIdx >= allowUpToRef.current) ||
          inFlightRef.current >= CONCURRENCY
        ) {
          await new Promise(r => setTimeout(r, POLL_MS))
          continue
        }

        cursorRef.current++

        // Skip if already downloaded (e.g. same file referenced twice)
        if (blobUrlsRef.current[item.id]) continue

        fetchOne(item)  // fire-and-forget; inFlightRef managed inside
      }
    }

    runQueue()
    return () => { genRef.current++ }
  }, [nodes, files]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { Object.values(blobUrlsRef.current).forEach(revokeEntry) }
  }, [])

  return blobMap
}
