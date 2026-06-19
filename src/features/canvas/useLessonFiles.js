import { useState, useEffect, useRef, useCallback } from 'react'
import { uploadToR2, deleteFromR2 } from '../../shared/lib/r2.js'
import { insertFile, deleteFileByR2Url, getFilesByIds } from '../../shared/lib/filesApi.js'
import { lfSave, lfGet, lfDelete } from '../../shared/lib/localFileStore.js'

const LS_KEY  = id => `lesson_files_${id}`
const IDB_KEY = (lid, fid) => `lesson_blob_${lid}_${fid}`

// Manages lesson-level files: local (picked from disk) and synced (uploaded to server).
// Persists metadata to localStorage and File blobs to IndexedDB — survives page reload.
// Status lifecycle: 'local' → 'synced' (on sync upload) | 'toDelete' (on remove) → removed (on sync delete)
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
    const rest      = saved.filter(f => f.status !== 'local')  // synced + toDelete

    if (localMeta.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!cancelled) { setFiles(rest); readyRef.current = true }
      return
    }

    // Restore File blobs from IndexedDB for unsynced files
    Promise.all(
      localMeta.map(f =>
        lfGet(IDB_KEY(lessonId, f.id)).then(blob => ({ ...f, localFile: blob ?? null }))
      )
    ).then(restored => {
      if (cancelled) return
      setFiles([...rest, ...restored])
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

  // Local files: removed immediately. Synced files: marked toDelete, removed on next sync.
  // Clicking × on a toDelete file cancels the pending deletion.
  function removeFile(id) {
    const file = files.find(f => f.id === id)
    if (!file) return
    if (file.status === 'local') {
      setFiles(prev => prev.filter(f => f.id !== id))
      if (lessonId) lfDelete(IDB_KEY(lessonId, id)).catch(console.error)
    } else if (file.status === 'toDelete') {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'synced' } : f))
    } else {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'toDelete' } : f))
    }
  }

  async function syncToServer() {
    const toUpload = files.filter(f => f.status === 'local' && f.localFile)
    const toDelete = files.filter(f => f.status === 'toDelete')
    if (!toUpload.length && !toDelete.length) return
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
        console.error('[lessonFiles] upload failed', f.name, err)
      }
    }

    for (const f of toDelete) {
      try {
        if (f.r2Url) {
          await deleteFromR2(f.r2Url)
          await deleteFileByR2Url(f.r2Url)
        }
        setFiles(prev => prev.filter(x => x.id !== f.id))
      } catch (err) {
        console.error('[lessonFiles] delete failed', f.name, err)
      }
    }

    setSyncing(false)
  }

  const hasUnsynced = files.some(f => f.status === 'local' || f.status === 'toDelete')

  // Fetch from Supabase any file IDs not already known locally.
  // Call this when you have node file_ids but no local metadata (e.g. deployed version).
  const fetchMissingFiles = useCallback(async (fileIds) => {
    if (!fileIds?.length) return
    const missing = fileIds.filter(id => !files.some(f => f.id === id))
    if (!missing.length) return
    try {
      const fetched = await getFilesByIds(missing)
      if (fetched.length) setFiles(prev => [...prev, ...fetched])
    } catch (e) {
      console.warn('[lessonFiles] fetchMissingFiles error', e)
    }
  }, [files])

  return { files, syncing, hasUnsynced, pickFile, removeFile, syncToServer, fetchMissingFiles }
}
