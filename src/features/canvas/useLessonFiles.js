import { useState, useEffect, useRef } from 'react'
import { uploadToR2 } from '../../shared/lib/r2.js'
import { insertFile } from '../../shared/lib/filesApi.js'
import { lfSave, lfGet, lfDelete } from '../../shared/lib/localFileStore.js'

const LS_KEY  = id => `lesson_files_${id}`
const IDB_KEY = (lid, fid) => `lesson_blob_${lid}_${fid}`

// Manages lesson-level files: local (picked from disk) and synced (uploaded to server).
// Persists metadata to localStorage and File blobs to IndexedDB — survives page reload.
export function useLessonFiles(lessonId) {
  const [files, setFiles] = useState([])
  const [syncing, setSyncing] = useState(false)
  // readyRef: true once initial load completes; guards autosave from firing before load.
  const readyRef = useRef(false)

  // ── Load on mount ──────────────────────────────────────────────
  useEffect(() => {
    readyRef.current = false
    if (!lessonId) { readyRef.current = true; return }
    let cancelled = false

    const raw = localStorage.getItem(LS_KEY(lessonId))
    if (!raw) { readyRef.current = true; return }

    let saved
    try { saved = JSON.parse(raw) } catch { readyRef.current = true; return }
    if (!Array.isArray(saved) || saved.length === 0) { readyRef.current = true; return }

    const localMeta = saved.filter(f => f.status === 'local')
    const synced    = saved.filter(f => f.status === 'synced')

    if (localMeta.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!cancelled) { setFiles(synced); readyRef.current = true }
      return
    }

    // Restore File blobs from IndexedDB for unsynced files
    Promise.all(
      localMeta.map(f =>
        lfGet(IDB_KEY(lessonId, f.id)).then(blob => ({ ...f, localFile: blob ?? null }))
      )
    ).then(restored => {
      if (cancelled) return
      setFiles([...synced, ...restored])
      readyRef.current = true
    }).catch(() => {
      if (!cancelled) { setFiles(saved); readyRef.current = true }
    })

    return () => { cancelled = true }
  }, [lessonId])

  // ── Autosave metadata to localStorage (debounced, only after load) ──
  useEffect(() => {
    if (!readyRef.current || !lessonId) return
    const t = setTimeout(() => {
      // Strip localFile — File objects can't be JSON-serialized; blobs live in IDB
      localStorage.setItem(LS_KEY(lessonId), JSON.stringify(
        files.map(f => ({ id: f.id, name: f.name, size: f.size, type: f.type, status: f.status, r2Url: f.r2Url }))
      ))
    }, 400)
    return () => clearTimeout(t)
  }, [lessonId, files])

  // ── Operations ─────────────────────────────────────────────────
  // Returns existing id if same name+size already in lesson (dedup guard).
  function pickFile(file) {
    const dup = files.find(f => f.name === file.name && f.size === file.size)
    if (dup) return dup.id
    const id = crypto.randomUUID()
    setFiles(prev => [...prev, {
      id, name: file.name, size: file.size, type: file.type,
      status: 'local', localFile: file, r2Url: null,
    }])
    if (lessonId) lfSave(IDB_KEY(lessonId, id), file).catch(console.error)
    return id
  }

  function removeFile(id) {
    setFiles(prev => prev.filter(f => f.id !== id))
    if (lessonId) lfDelete(IDB_KEY(lessonId, id)).catch(console.error)
  }

  async function syncToServer() {
    const toUpload = files.filter(f => f.status === 'local' && f.localFile)
    if (!toUpload.length) return
    setSyncing(true)
    for (const f of toUpload) {
      try {
        const r2Url = await uploadToR2(f.localFile)
        await insertFile({ fileName: f.name, sizeBytes: f.size, contentType: f.type, r2Url })
        setFiles(prev => prev.map(x =>
          x.id === f.id ? { ...x, status: 'synced', r2Url, localFile: null } : x
        ))
        if (lessonId) lfDelete(IDB_KEY(lessonId, f.id)).catch(() => {})
      } catch (err) {
        console.error('[lessonFiles] sync failed', f.name, err)
      }
    }
    setSyncing(false)
  }

  const hasUnsynced = files.some(f => f.status === 'local')

  return { files, syncing, hasUnsynced, pickFile, removeFile, syncToServer }
}
