import { useState, useEffect, useRef, useCallback } from 'react'
import { uploadToR2, deleteFromR2 } from '../../shared/lib/r2.js'
import { insertFile, deleteFileRow, otherRowsShareR2Url, findFileByHash, getFilesByIds } from '../../shared/lib/filesApi.js'
import { lfSave, lfGet, lfDelete } from '../../shared/lib/localFileStore.js'
import { hashFile } from '../../shared/lib/fileHash.js'
import { pLog } from '../../shared/lib/debug.js'

const LS_KEY  = id => `lesson_files_${id}`
const IDB_KEY = (lid, fid) => `lesson_blob_${lid}_${fid}`

// Manages lesson-level files: local (picked from disk) and synced (uploaded to server).
// Persists metadata to localStorage and File blobs to IndexedDB — survives page reload.
// Status lifecycle: 'local' → 'synced' (on sync upload) | 'toDelete' (on remove) → removed (on sync delete)
export function useLessonFiles(lessonId) {
  const [files, setFiles] = useState([])
  const [syncing, setSyncing] = useState(false)
  const readyRef = useRef(false)
  // filesRef keeps current files without being a useCallback dependency
  const filesRef = useRef(files)
  useEffect(() => { filesRef.current = files }, [files])

  // Фоновая сверка synced-файлов с сервером (вызывается из эффекта загрузки
  // ниже) — не блокирует первый кадр (рисуем сразу из кэша), молча
  // поправляет расхождения: файл удалили в другом месте — убираем повисшую
  // ссылку; r2Url/имя изменились — подтягиваем актуальные
  function reconcileSynced(cachedRest) {
    const syncedIds = cachedRest.filter(f => f.status === 'synced').map(f => f.id)
    if (!syncedIds.length) return
    getFilesByIds(syncedIds).then(serverFiles => {
      const byId = Object.fromEntries(serverFiles.map(f => [f.id, f]))
      setFiles(prev => {
        let changed = false
        const next = prev
          .filter(f => {
            if (f.status !== 'synced' || !syncedIds.includes(f.id)) return true
            if (byId[f.id]) return true
            changed = true
            return false // удалили на сервере в другом месте — не тащим висячую ссылку
          })
          .map(f => {
            if (f.status !== 'synced' || !byId[f.id]) return f
            const s = byId[f.id]
            if (s.r2Url === f.r2Url && s.name === f.name) return f
            changed = true
            return { ...f, r2Url: s.r2Url, name: s.name, size: s.size, type: s.type }
          })
        return changed ? next : prev
      })
    }).catch(() => {})
  }

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

    // Кэш synced-записей мог отстать от сервера (файл удалили/переоформили
    // в другом месте) — этот ключ никогда сам не чистится, поэтому сверяем
    // при каждом открытии урока. В отличие от нод/структуры — у уже
    // синхронизированных файлов легитимных локальных правок не бывает,
    // сервер тут безусловная истина, спрашивать не нужно
    reconcileSynced(rest)

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
  // useCallback + filesRef (не files) — эта функция идёт пропом
  // (onPickLessonFile) до каждой CanvasNode.jsx (React.memo, canvas/CanvasNode.jsx):
  // нестабильная ссылка на каждый рендер CanvasPage срывала бы мемоизацию у
  // всех нод разом, как раньше срывал moduleLessons (см. CanvasPage.jsx)
  const pickFile = useCallback((file) => {
    const dup = filesRef.current.find(f => f.name === file.name && f.size === file.size)
    if (dup) return dup.id
    const id = crypto.randomUUID()
    setFiles(prev => [...prev, {
      id, name: file.name, size: file.size, type: file.type,
      status: 'local', localFile: file, r2Url: null,
    }])
    if (lessonId) lfSave(IDB_KEY(lessonId, id), file).catch(console.error)
    return id
  }, [lessonId])

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

  // Возвращает АКТУАЛЬНЫЙ список файлов после синка (не полагаясь на state
  // files, который в closure вызывающего кода — например CanvasPage.handleSave —
  // остаётся старым до следующего рендера). Раньше handleSave не дожидался
  // реального смысла синка и «запекал» в урок либо пустой, либо прошлый
  // r2Url — отсюда расхождение данных на сервере с тем, что видно в редакторе.
  async function syncToServer() {
    const toUpload = files.filter(f => f.status === 'local' && f.localFile)
    const toDelete = files.filter(f => f.status === 'toDelete')
    if (!toUpload.length && !toDelete.length) return files
    setSyncing(true)

    let result = files

    for (const f of toUpload) {
      try {
        // Дедуп: файл с таким же содержимым (SHA-256) уже лежит в R2 —
        // переиспользуем его r2Url вместо повторной загрузки байт (та же
        // картинка/видео учителя часто ставится в несколько уроков подряд)
        const contentHash = await hashFile(f.localFile)
        const existing = await findFileByHash(contentHash)
        let r2Url
        if (existing) {
          r2Url = existing.r2Url
          pLog('syncToServer: dedup hit — reuse r2Url from file', existing.id, 'skip upload for', f.name)
        } else {
          r2Url = await uploadToR2(f.localFile)
          pLog('syncToServer: uploadToR2 OK, r2Url=', r2Url?.slice(0, 50), 'clientId=', f.id)
        }
        const inserted = await insertFile({ id: f.id, fileName: f.name, sizeBytes: f.size, contentType: f.type, r2Url, contentHash })
        pLog('syncToServer: insertFile result id=', inserted?.id ?? 'null', 'expected=', f.id, 'match=', inserted?.id === f.id)
        result = result.map(x => x.id === f.id ? { ...x, status: 'synced', r2Url, localFile: null } : x)
        setFiles(result)
        if (lessonId) lfDelete(IDB_KEY(lessonId, f.id)).catch(() => {})
      } catch (err) {
        pLog('syncToServer ERROR:', err.message)
        console.error('[lessonFiles] upload failed', f.name, err)
      }
    }

    for (const f of toDelete) {
      try {
        if (f.r2Url) {
          // Дедуп мог оставить на этот r2Url ещё чьи-то строки files (тот
          // же файл использован в другом уроке) — сам объект в R2 трогаем,
          // только если больше никто на него не ссылается; свою же строку
          // удаляем по id (не по r2Url — тот теперь может быть общим)
          const shared = await otherRowsShareR2Url(f.r2Url, f.id)
          if (!shared) await deleteFromR2(f.r2Url)
          await deleteFileRow(f.id)
        }
        result = result.filter(x => x.id !== f.id)
        setFiles(result)
      } catch (err) {
        console.error('[lessonFiles] delete failed', f.name, err)
      }
    }

    setSyncing(false)
    return result
  }

  const hasUnsynced = files.some(f => f.status === 'local' || f.status === 'toDelete')

  // Fetch from Supabase any file IDs not already known locally.
  // Call this when you have node file_ids but no local metadata (e.g. deployed version).
  const fetchMissingFiles = useCallback(async (fileIds) => {
    if (!fileIds?.length) return
    const missing = fileIds.filter(id => !filesRef.current.some(f => f.id === id))
    if (!missing.length) return
    try {
      const fetched = await getFilesByIds(missing)
      if (fetched.length) setFiles(prev => [...prev, ...fetched])
    } catch (e) {
      console.warn('[lessonFiles] fetchMissingFiles error', e)
    }
  }, []) // stable — reads files via ref, no deps

  return { files, syncing, hasUnsynced, pickFile, removeFile, syncToServer, fetchMissingFiles }
}
