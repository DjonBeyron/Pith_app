import { useEffect, useRef, useState } from 'react'
import { pLog } from '../../shared/lib/debug.js'

// Download next LOOKAHEAD nodes as blobs so modules get instant local URL
const LOOKAHEAD = 2

export function usePlayerPreload(nodes, files, visibleNodes) {
  const [blobMap, setBlobMap] = useState({})
  const blobUrlsRef = useRef({}) // fileId → blobUrl, kept for cleanup
  const loadingRef  = useRef(new Set())

  useEffect(() => {
    if (!visibleNodes.length || !nodes.length) return

    const lastSeq    = Math.max(...visibleNodes.map(n => n.seq ?? 0))
    const nodesBySeq = [...nodes].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))

    nodesBySeq
      .filter(n => {
        const s = n.seq ?? 0
        return s > lastSeq && s <= lastSeq + LOOKAHEAD
      })
      .forEach(node => {
        const fileId = node.typeData?.[node.type]?.file_id
        if (!fileId) return
        if (blobUrlsRef.current[fileId] || loadingRef.current.has(fileId)) return
        const file = files.find(f => f.id === fileId)
        const url  = file?.r2Url ?? node.typeData?.[node.type]?.r2Url
        if (!url) return

        loadingRef.current.add(fileId)
        pLog('PlayerPreload start: seq=', node.seq, 'type=', node.type, 'url=', url)

        fetch(url)
          .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob() })
          .then(blob => {
            const blobUrl = URL.createObjectURL(blob)
            blobUrlsRef.current[fileId] = blobUrl
            loadingRef.current.delete(fileId)
            pLog('PlayerPreload ready: seq=', node.seq, Math.round(blob.size / 1024), 'KB → blobUrl created')
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
