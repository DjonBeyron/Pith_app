import { useEffect, useRef, useState } from 'react'
import { formatBytes, getMediaKind } from '../../shared/lib/filesApi.js'
import { dbg } from '../../shared/lib/debug.js'
import { capturePosterFrame } from '../../shared/lib/videoFrame.js'

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 1500
const POLL_MS = 300
export const BUFFER_SIZE = 5

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Downloads files ONE AT A TIME, in array order, instead of letting every <img>/<video>/<audio>
// fight for the same slow connection in parallel. Files only get a real <src> once their blob
// is fully in memory — that's what guarantees the browser never starts its own parallel fetch
// for a file whose turn hasn't come yet.
async function fetchBlobWithProgress(url, onProgress) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const chunks = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    if (total) onProgress(Math.round((loaded / total) * 100))
  }
  return new Blob(chunks)
}

// `allowUpTo` caps how far into `files` the queue is allowed to prefetch right now — without
// this, the whole list downloads almost instantly regardless of reveal pace, and the buffer
// cycles through (evicting early items) long before the user has actually seen them.
export function useSequentialPreload(files, allowUpTo) {
  const [map, setMap] = useState({})
  // Mirrors `map` for synchronous reads inside async functions (eviction, retries) — `map`
  // itself is only ever read during render, per React's rules-of-refs.
  const snapshotRef = useRef({})
  const cancelledRef = useRef(false)
  const bufferQueueRef = useRef([]) // FIFO of ids holding full (non-photo) blob data
  const filesByIdRef = useRef({})
  const cursorRef = useRef(0)
  const allowUpToRef = useRef(allowUpTo)

  useEffect(() => {
    allowUpToRef.current = allowUpTo
  }, [allowUpTo])

  function patch(id, fields) {
    if (cancelledRef.current) return
    snapshotRef.current = { ...snapshotRef.current, [id]: { ...snapshotRef.current[id], ...fields } }
    setMap(snapshotRef.current)
  }

  // Photos are never evicted — an empty photo bubble would look broken. Videos lose the heavy
  // blob but keep one captured frame as a "frozen" preview. Audio just drops fully.
  async function evictOldestIfNeeded() {
    while (bufferQueueRef.current.length > BUFFER_SIZE) {
      const oldId = bufferQueueRef.current.shift()
      const rec = snapshotRef.current[oldId]
      const f = filesByIdRef.current[oldId]
      if (!rec || rec.status !== 'ready' || !f) continue
      if (getMediaKind(f.content_type) === 'video') {
        let posterUrl = rec.posterUrl
        if (!posterUrl) {
          try {
            posterUrl = await capturePosterFrame(rec.blobUrl)
          } catch (e) {
            console.error('[buffer] poster capture failed', f.file_name, e)
            posterUrl = null
          }
        }
        URL.revokeObjectURL(rec.blobUrl)
        dbg('[buffer] evict (видео → стоп-кадр)', f.file_name)
        patch(oldId, { status: 'evicted', blobUrl: null, posterUrl })
      } else {
        URL.revokeObjectURL(rec.blobUrl)
        dbg('[buffer] evict', f.file_name)
        patch(oldId, { status: 'evicted', blobUrl: null })
      }
    }
  }

  async function loadOne(f) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (cancelledRef.current) return
      patch(f.id, { status: 'loading', progress: 0, attempt })
      const t0 = performance.now()
      dbg('[preload] start', f.file_name, formatBytes(f.size_bytes), `попытка ${attempt}/${MAX_ATTEMPTS}`)
      try {
        const blob = await fetchBlobWithProgress(f.r2_url, progress => {
          patch(f.id, { status: 'loading', progress, attempt })
        })
        if (cancelledRef.current) return
        const ms = Math.round(performance.now() - t0)
        const kbps = Math.round(blob.size / 1024 / (ms / 1000))
        dbg('[preload] done', f.file_name, `${ms}ms`, `${kbps} KB/s`)
        const blobUrl = URL.createObjectURL(blob)
        patch(f.id, { status: 'ready', progress: 100, blobUrl, ms, kbps })
        if (getMediaKind(f.content_type) !== 'photo') {
          bufferQueueRef.current = bufferQueueRef.current.filter(id => id !== f.id)
          bufferQueueRef.current.push(f.id)
          await evictOldestIfNeeded()
        }
        return
      } catch (e) {
        console.error('[preload] attempt failed', f.file_name, attempt, e)
        dbg('[preload] attempt failed', f.file_name, `попытка ${attempt}/${MAX_ATTEMPTS}`)
        if (attempt < MAX_ATTEMPTS && !cancelledRef.current) await sleep(RETRY_DELAY_MS)
      }
    }
    if (!cancelledRef.current) patch(f.id, { status: 'error', progress: 0 })
  }

  useEffect(() => {
    cancelledRef.current = false
    Object.values(snapshotRef.current).forEach(rec => {
      if (rec?.blobUrl) URL.revokeObjectURL(rec.blobUrl)
      if (rec?.posterUrl) URL.revokeObjectURL(rec.posterUrl)
    })
    filesByIdRef.current = Object.fromEntries(files.map(f => [f.id, f]))
    bufferQueueRef.current = []
    cursorRef.current = 0
    snapshotRef.current = Object.fromEntries(files.map(f => [f.id, { status: 'queued', progress: 0 }]))
    setMap(snapshotRef.current)
    if (!files.length) return undefined

    // Waits for `allowUpTo` to grant permission to go further, instead of racing through
    // the whole list — keeps prefetch a few messages ahead of reveal, not the entire chat.
    async function runQueue() {
      while (!cancelledRef.current && cursorRef.current < files.length) {
        if (cursorRef.current >= allowUpToRef.current) {
          await sleep(POLL_MS)
          continue
        }
        const f = files[cursorRef.current]
        await loadOne(f)
        cursorRef.current += 1
      }
    }
    runQueue()
    return () => { cancelledRef.current = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files])

  // Called when the user interacts with an already-evicted item — fetches it again on demand,
  // which (per the same FIFO rule) bumps the oldest currently-buffered file out instead.
  function reload(f) {
    const cur = snapshotRef.current[f.id]
    if (cur && (cur.status === 'loading' || cur.status === 'ready')) return
    dbg('[preload] подгрузка по требованию', f.file_name)
    loadOne(f)
  }

  return { state: map, reload }
}
