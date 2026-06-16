import { useEffect, useState } from 'react'
import { formatBytes } from '../../shared/lib/filesApi.js'
import { dbg } from '../../shared/lib/debug.js'

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

export function useSequentialPreload(files) {
  const [state, setState] = useState({})

  useEffect(() => {
    if (!files.length) return
    let cancelled = false

    async function runQueue() {
      setState(Object.fromEntries(files.map(f => [f.id, { status: 'queued', progress: 0 }])))
      for (const f of files) {
        if (cancelled) return
        setState(prev => ({ ...prev, [f.id]: { status: 'loading', progress: 0 } }))
        const t0 = performance.now()
        dbg('[preload] start', f.file_name, formatBytes(f.size_bytes))
        try {
          const blob = await fetchBlobWithProgress(f.r2_url, progress => {
            if (!cancelled) setState(prev => ({ ...prev, [f.id]: { status: 'loading', progress } }))
          })
          if (cancelled) return
          const ms = Math.round(performance.now() - t0)
          const kbps = Math.round(blob.size / 1024 / (ms / 1000))
          dbg('[preload] done', f.file_name, `${ms}ms`, `${kbps} KB/s`)
          const blobUrl = URL.createObjectURL(blob)
          setState(prev => ({ ...prev, [f.id]: { status: 'ready', progress: 100, blobUrl, ms, kbps } }))
        } catch (e) {
          console.error('[preload] failed', f.file_name, e)
          if (!cancelled) setState(prev => ({ ...prev, [f.id]: { status: 'error', progress: 0 } }))
        }
      }
    }

    runQueue()
    return () => { cancelled = true }
  }, [files])

  return state
}
