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

// `allowUpTo` caps how far ahead of reveal we may prefetch. `currentIndex` is "where the user
// is now" in the sequence — eviction always drops whichever buffered item sits farthest from
// that position (not whichever was loaded longest ago), so messages near the live edge of the
// chat stay cached even if an old one was just viewed on demand.
export function useSequentialPreload(files, allowUpTo, currentIndex) {
  const [map, setMap] = useState({})
  // Mirrors `map` for synchronous reads inside async functions (eviction, retries) — `map`
  // itself is only ever read during render, per React's rules-of-refs.
  const snapshotRef = useRef({})
  // Generation counter: incremented on every effect cleanup. Each async queue captures its own
  // `gen` at launch; any operation that finds genRef.current !== gen knows it was superseded
  // and must stop — this prevents two queues from running in parallel when `files` changes
  // (e.g. user taps Refresh while an earlier load is still in progress).
  const genRef = useRef(0)
  const filesByIdRef = useRef({})
  const indexByIdRef = useRef({})
  const cursorRef = useRef(0)
  const allowUpToRef = useRef(allowUpTo)
  const currentIndexRef = useRef(currentIndex)

  useEffect(() => { allowUpToRef.current = allowUpTo }, [allowUpTo])
  useEffect(() => { currentIndexRef.current = currentIndex }, [currentIndex])

  function patch(id, fields, gen) {
    if (genRef.current !== gen) return
    snapshotRef.current = { ...snapshotRef.current, [id]: { ...snapshotRef.current[id], ...fields } }
    setMap(snapshotRef.current)
  }

  function bufferedEvictableIds() {
    return Object.entries(snapshotRef.current)
      .filter(([id, rec]) => rec.status === 'ready' && getMediaKind(filesByIdRef.current[id]?.content_type) !== 'photo')
      .map(([id]) => id)
  }

  // Photos are never evicted — an empty photo bubble would look broken. Videos lose the heavy
  // blob but keep one captured frame as a "frozen" preview. Audio just drops fully.
  async function evictFarthestIfNeeded(gen) {
    let buffered = bufferedEvictableIds()
    while (buffered.length > BUFFER_SIZE) {
      if (genRef.current !== gen) return
      const cur = currentIndexRef.current
      let worstId = buffered[0]
      let worstDist = Math.abs((indexByIdRef.current[worstId] ?? 0) - cur)
      for (const id of buffered) {
        const dist = Math.abs((indexByIdRef.current[id] ?? 0) - cur)
        if (dist > worstDist) { worstId = id; worstDist = dist }
      }
      const rec = snapshotRef.current[worstId]
      const f = filesByIdRef.current[worstId]
      buffered = buffered.filter(id => id !== worstId)
      if (!rec || !f) continue
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
        if (genRef.current !== gen) return
        URL.revokeObjectURL(rec.blobUrl)
        dbg('[buffer] evict (видео → стоп-кадр, дальше всех от текущего)', f.file_name)
        patch(worstId, { status: 'evicted', blobUrl: null, posterUrl }, gen)
      } else {
        URL.revokeObjectURL(rec.blobUrl)
        dbg('[buffer] evict (дальше всех от текущего)', f.file_name)
        patch(worstId, { status: 'evicted', blobUrl: null }, gen)
      }
    }
  }

  async function loadOne(f, gen) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (genRef.current !== gen) return
      patch(f.id, { status: 'loading', progress: 0, attempt }, gen)
      const t0 = performance.now()
      dbg('[preload] start', f.file_name, formatBytes(f.size_bytes), `попытка ${attempt}/${MAX_ATTEMPTS}`)
      try {
        const blob = await fetchBlobWithProgress(f.r2_url, progress => {
          patch(f.id, { status: 'loading', progress, attempt }, gen)
        })
        if (genRef.current !== gen) return
        const ms = Math.round(performance.now() - t0)
        const kbps = Math.round(blob.size / 1024 / (ms / 1000))
        dbg('[preload] done', f.file_name, `${ms}ms`, `${kbps} KB/s`)
        const blobUrl = URL.createObjectURL(blob)
        // Guard after async gap — if superseded, revoke immediately to avoid a leak.
        if (genRef.current !== gen) { URL.revokeObjectURL(blobUrl); return }
        patch(f.id, { status: 'ready', progress: 100, blobUrl, ms, kbps }, gen)
        if (getMediaKind(f.content_type) !== 'photo') await evictFarthestIfNeeded(gen)
        return
      } catch (e) {
        console.error('[preload] attempt failed', f.file_name, attempt, e)
        dbg('[preload] attempt failed', f.file_name, `попытка ${attempt}/${MAX_ATTEMPTS}`)
        if (attempt < MAX_ATTEMPTS && genRef.current === gen) await sleep(RETRY_DELAY_MS)
      }
    }
    if (genRef.current === gen) patch(f.id, { status: 'error', progress: 0 }, gen)
  }

  useEffect(() => {
    const gen = genRef.current
    Object.values(snapshotRef.current).forEach(rec => {
      if (rec?.blobUrl) URL.revokeObjectURL(rec.blobUrl)
      if (rec?.posterUrl) URL.revokeObjectURL(rec.posterUrl)
    })
    filesByIdRef.current = {}
    indexByIdRef.current = {}
    files.forEach((f, idx) => {
      filesByIdRef.current[f.id] = f
      indexByIdRef.current[f.id] = idx
    })
    cursorRef.current = 0
    snapshotRef.current = Object.fromEntries(files.map(f => [f.id, { status: 'queued', progress: 0 }]))
    setMap(snapshotRef.current)
    if (!files.length) return () => { genRef.current++ }

    // Waits for `allowUpTo` to grant permission to go further, instead of racing through
    // the whole list — keeps prefetch a few messages ahead of reveal, not the entire chat.
    async function runQueue() {
      while (genRef.current === gen && cursorRef.current < files.length) {
        if (cursorRef.current >= allowUpToRef.current) {
          await sleep(POLL_MS)
          continue
        }
        const f = files[cursorRef.current]
        await loadOne(f, gen)
        cursorRef.current += 1
      }
    }
    runQueue()
    return () => { genRef.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files])

  // Called when the user interacts with an already-evicted item — fetches it again on demand.
  // Because eviction is distance-based, an old item loaded this way will likely be the next
  // thing evicted anyway, since it sits far from wherever reveal currently is.
  function reload(f) {
    const cur = snapshotRef.current[f.id]
    if (cur && (cur.status === 'loading' || cur.status === 'ready')) return
    dbg('[preload] подгрузка по требованию', f.file_name)
    loadOne(f, genRef.current)
  }

  return { state: map, reload }
}
