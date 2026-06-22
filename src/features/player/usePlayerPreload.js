import { useEffect, useRef, useState } from 'react'
import { pLog } from '../../shared/lib/debug.js'

const LOOKAHEAD    = 3   // preload this many media nodes ahead of last visible
const CONCURRENCY  = 2   // parallel downloads at once
const POLL_MS      = 200
const MEDIA_TYPES  = new Set(['audio', 'voice_record', 'video', 'circle', 'photo', 'sticker', 'photo_choice'])

function isValidUrl(url) {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))
}

// BFS from entry (seq=1), following ALL trigger branches simultaneously.
// Both sides of every fork are enqueued — graph-distance order, not seq order.
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

// Returns list of {id, url} pairs to fetch for a node (1 for media, N for photo_choice).
function nodeDownloads(node, files) {
  if (node.type === 'photo_choice') {
    return (node.typeData?.photo_choice?.photos ?? [])
      .map(ph => {
        const f   = files.find(fl => fl.id === ph.fileId)
        const url = f?.r2Url ?? ph.photoUrl ?? null
        return isValidUrl(url) ? { id: ph.fileId, url } : null
      })
      .filter(Boolean)
  }
  const fileId = node.typeData?.[node.type]?.file_id
  if (!fileId) return []
  const f   = files.find(fl => fl.id === fileId)
  const url = f?.r2Url ?? node.typeData?.[node.type]?.r2Url ?? null
  return isValidUrl(url) ? [{ id: fileId, url }] : []
}

export function usePlayerPreload(nodes, files, visibleNodes) {
  const [blobMap, setBlobMap] = useState({})

  const blobUrlsRef  = useRef({})
  const genRef       = useRef(0)
  const queueRef     = useRef([])
  const cursorRef    = useRef(0)
  const allowUpToRef = useRef(LOOKAHEAD)
  const inFlightRef  = useRef(0)   // active concurrent downloads
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
    const active      = remaining.filter(n =>  reach.has(n.id))
    const speculative = remaining.filter(n => !reach.has(n.id))

    if (speculative.length > 0) {
      queueRef.current = [
        ...queueRef.current.slice(0, loaded),
        ...active,
        ...speculative,
      ]
      pLog('PlayerPreload reorder → active:', active.map(n => n.seq).join(','),
           '/ speculative:', speculative.map(n => n.seq).join(','))
    }
  }, [visibleNodes]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const gen = genRef.current

    Object.values(blobUrlsRef.current).forEach(url => URL.revokeObjectURL(url))
    blobUrlsRef.current = {}
    setBlobMap({})
    byIdRef.current    = Object.fromEntries(nodes.map(n => [n.id, n]))
    queueRef.current   = bfsOrder(nodes).filter(n => MEDIA_TYPES.has(n.type))
    cursorRef.current  = 0
    allowUpToRef.current = LOOKAHEAD
    inFlightRef.current  = 0

    if (!queueRef.current.length || !files.length) return

    // Fetch a single {id, url} download and store result.
    async function fetchOne(id, url, label) {
      pLog('PlayerPreload start:', label)
      inFlightRef.current++
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        if (genRef.current !== gen) return
        const blob   = await res.blob()
        if (genRef.current !== gen) return
        const blobUrl = URL.createObjectURL(blob)
        blobUrlsRef.current[id] = blobUrl
        pLog('PlayerPreload ready:', label, Math.round(blob.size / 1024), 'KB')
        setBlobMap(prev => ({ ...prev, [id]: blobUrl }))
      } catch (e) {
        pLog('PlayerPreload error:', label, e.message)
      } finally {
        inFlightRef.current--
      }
    }

    // Dispatcher: picks next node from queue, fires fetchOne() for each download,
    // respects CONCURRENCY and allowUpTo window.
    async function runQueue() {
      while (genRef.current === gen) {
        if (cursorRef.current >= queueRef.current.length && inFlightRef.current === 0) break

        // Wait if too far ahead or at concurrency limit
        if (
          cursorRef.current >= allowUpToRef.current ||
          inFlightRef.current >= CONCURRENCY ||
          cursorRef.current >= queueRef.current.length
        ) {
          await new Promise(r => setTimeout(r, POLL_MS))
          continue
        }

        const node = queueRef.current[cursorRef.current]
        cursorRef.current++

        const downloads = nodeDownloads(node, files).filter(d => !blobUrlsRef.current[d.id])
        for (const { id, url } of downloads) {
          const label = `seq=${node.seq} type=${node.type}`
          fetchOne(id, url, label)  // fire-and-forget — dispatcher continues
        }
      }
    }

    runQueue()
    return () => { genRef.current++ }
  }, [nodes, files]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      Object.values(blobUrlsRef.current).forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  return blobMap
}
