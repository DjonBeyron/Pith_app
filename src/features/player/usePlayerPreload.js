import { useEffect, useRef, useState } from 'react'
import { pLog } from '../../shared/lib/debug.js'

const LOOKAHEAD = 2
const MEDIA_TYPES = new Set(['video', 'circle', 'photo', 'audio', 'voice_record', 'sticker'])
const FRAME_TYPES = new Set(['video', 'circle']) // types that need first-frame capture

export function usePlayerPreload(nodes, files, visibleNodes) {
  const [blobMap,   setBlobMap]   = useState({})
  const [posterMap, setPosterMap] = useState({}) // fileId → JPEG data URL of first frame
  const blobUrlsRef = useRef({})
  const loadingRef  = useRef(new Set())

  useEffect(() => {
    if (!visibleNodes.length || !nodes.length) return

    const lastSeq    = Math.max(...visibleNodes.map(n => n.seq ?? 0))
    const nodesBySeq = [...nodes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))

    const targets = nodesBySeq.filter(n => {
      if (!MEDIA_TYPES.has(n.type)) return false
      const s = n.seq ?? 0
      const isVisible  = visibleNodes.some(v => v.id === n.id)
      const isUpcoming = s > lastSeq && s <= lastSeq + LOOKAHEAD
      return isVisible || isUpcoming
    })

    targets.forEach(node => {
      const fileId = node.typeData?.[node.type]?.file_id
      if (!fileId) return
      if (blobUrlsRef.current[fileId] || loadingRef.current.has(fileId)) return
      const file = files.find(f => f.id === fileId)
      const url  = file?.r2Url ?? node.typeData?.[node.type]?.r2Url
      if (!url) return

      loadingRef.current.add(fileId)
      pLog('PlayerPreload start: seq=', node.seq, 'type=', node.type)

      fetch(url)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob() })
        .then(blob => {
          const blobUrl = URL.createObjectURL(blob)
          blobUrlsRef.current[fileId] = blobUrl
          loadingRef.current.delete(fileId)
          pLog('PlayerPreload ready: seq=', node.seq, Math.round(blob.size / 1024), 'KB')
          setBlobMap(prev => ({ ...prev, [fileId]: blobUrl }))

          if (FRAME_TYPES.has(node.type)) {
            captureFirstFrame(blobUrl, fileId, node.seq).then(posterUrl => {
              if (posterUrl) {
                pLog('PlayerPreload poster captured: seq=', node.seq)
                setPosterMap(prev => ({ ...prev, [fileId]: posterUrl }))
              }
            })
          }
        })
        .catch(e => {
          loadingRef.current.delete(fileId)
          pLog('PlayerPreload error: seq=', node.seq, e.message)
        })
    })
  }, [visibleNodes, files, nodes]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      Object.values(blobUrlsRef.current).forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  return { blobMap, posterMap }
}

// Capture first frame from a video blob URL via offscreen <video> + <canvas>
function captureFirstFrame(blobUrl, fileId, seq) {
  return new Promise(resolve => {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.crossOrigin = 'anonymous'
    v.src = blobUrl

    let done = false
    const finish = (result) => {
      if (done) return
      done = true
      v.src = ''
      try { v.load() } catch {}
      resolve(result)
    }

    const timer = setTimeout(() => {
      pLog('PlayerPreload: first frame timeout seq=', seq)
      finish(null)
    }, 6000)

    v.addEventListener('canplay', () => {
      v.currentTime = 0.001
    })

    v.addEventListener('seeked', () => {
      clearTimeout(timer)
      try {
        const canvas = document.createElement('canvas')
        canvas.width  = v.videoWidth  || 320
        canvas.height = v.videoHeight || 240
        canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        finish(dataUrl)
      } catch (e) {
        pLog('PlayerPreload: canvas capture failed seq=', seq, e.message)
        finish(null)
      }
    })

    v.addEventListener('error', () => {
      clearTimeout(timer)
      pLog('PlayerPreload: offscreen video error seq=', seq, v.error?.code)
      finish(null)
    })
  })
}
