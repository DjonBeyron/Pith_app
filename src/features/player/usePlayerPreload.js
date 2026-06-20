import { useEffect, useRef, useState } from 'react'
import { pLog } from '../../shared/lib/debug.js'

// Preload blobs for currently visible nodes + next LOOKAHEAD nodes
// so modules receive instant local blobUrl instead of a remote URL
const LOOKAHEAD = 2
const MEDIA_TYPES = new Set(['video', 'circle', 'photo', 'audio', 'voice_record', 'sticker'])

export function usePlayerPreload(nodes, files, visibleNodes) {
  const [blobMap, setBlobMap] = useState({})
  const blobUrlsRef = useRef({})
  const loadingRef  = useRef(new Set())

  useEffect(() => {
    if (!visibleNodes.length || !nodes.length) return

    const lastSeq    = Math.max(...visibleNodes.map(n => n.seq ?? 0))
    const nodesBySeq = [...nodes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))

    // Target: currently visible nodes + next LOOKAHEAD nodes
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

  return blobMap
}
