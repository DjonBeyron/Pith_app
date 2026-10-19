import { useState, useEffect, useRef, useCallback } from 'react'
import { uploadToR2, deleteFromR2 } from '../../shared/lib/r2.js'
import { insertFile, deleteFileRow, otherRowsShareR2Url, findFileByHash, getFilesByIds } from '../../shared/lib/filesApi.js'
import { lfSave, lfGet, lfDelete } from '../../shared/lib/localFileStore.js'
import { hashFile } from '../../shared/lib/fileHash.js'
import { pLog } from '../../shared/lib/debug.js'
import { IDB_KEY, reconcileSyncedFiles, recoverStuckLocal } from './lessonFilesRecover.js'

const LS_KEY = id => `lesson_files_${id}`

// Manages lesson-level files: local (picked from disk) and synced (uploaded to server).
// Persists metadata to localStorage and File blobs to IndexedDB — survives page reload.
// Status lifecycle: 'local' → 'synced' (on sync upload) | 'toDelete' (on remove) → removed (on sync delete)
export function useLessonFiles(lessonId) {
  const [files, setFiles] = useState([])
  const [syncing, setSyncing] = useState(false)
  // Журнал загрузки (показывается в окне файлов, его можно скопировать): что и когда загружалось, чем кончилось
  const [uploadLog, setUploadLog] = useState([])
  const addLog = msg => setUploadLog(l => [...l.slice(-400), `${new Date().toTimeString().slice(0, 8)} ${msg}`])
  const readyRef = useRef(false)
  // filesRef keeps current files without being a useCallback dependency
  const filesRef = useRef(files)
  useEffect(() => { filesRef.current = files }, [files])

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

    // Кэш synced-записей мог отстать от сервера (файл удалили/переоформили в другом месте) — этот ключ никогда сам
    // не чистится, поэтому сверяем при каждом открытии урока (lessonFilesRecover.js)
    reconcileSyncedFiles(rest, setFiles)

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
  // keepUrls — адреса, на которые новый (импортированный) урок ссылается напрямую: такой файл не трогаем (иначе 404 в плеере)
  function removeFile(id, keepUrls) {
    const file = files.find(f => f.id === id)
    if (!file) return
    if (keepUrls?.has(file.r2Url)) return
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
    let working = files
    const st = f => (f.status === 'local' ? (f.localFile ? 'local+копия' : 'local БЕЗ копии') : f.status)
    const counts = {}
    for (const f of files) counts[st(f)] = (counts[st(f)] ?? 0) + 1
    const stuckAtStart = files.filter(f => f.status === 'local' && !f.localFile)
    if (!files.some(f => f.status === 'local' || f.status === 'toDelete')) return files
    setUploadLog([])
    addLog(`Урок ${String(lessonId).slice(0, 8)}: файлов ${files.length} (${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ')})`)

    // Файл «локальный», но копии в памяти нет — ищем копию в IndexedDB, затем на сервере (lessonFilesRecover.js)
    if (stuckAtStart.length) {
      working = await recoverStuckLocal({ files: working, stuck: stuckAtStart, lessonId, addLog })
      setFiles(working)
    }

    const toUpload = working.filter(f => f.status === 'local' && f.localFile)
    const toDelete = working.filter(f => f.status === 'toDelete')
    addLog(`К загрузке ${toUpload.length}, к удалению ${toDelete.length}`)
    if (!toUpload.length && !toDelete.length) return working
    setSyncing(true)

    let result = working

    let doneCount = 0
    for (const f of toUpload) {
      for (let attempt = 1; attempt <= 2; attempt++) { // одна повторная попытка: на пакете из десятков файлов сеть/квота иногда подводят
      try {
        // Дедуп: файл с таким же содержимым (SHA-256) уже лежит в R2 —
        // переиспользуем его r2Url вместо повторной загрузки байт (та же
        // картинка/видео учителя часто ставится в несколько уроков подряд)
        addLog(`[${doneCount + 1}/${toUpload.length}] ${f.name} (${Math.round(f.size / 1024)} КБ), попытка ${attempt}`)
        const contentHash = await hashFile(f.localFile)
        const existing = await findFileByHash(contentHash)
        let r2Url
        if (existing) {
          r2Url = existing.r2Url
          pLog('syncToServer: dedup hit — reuse r2Url from file', existing.id, 'skip upload for', f.name)
          addLog('  такой файл уже есть на сервере, повторная загрузка не нужна')
        } else {
          r2Url = await uploadToR2(f.localFile)
          pLog('syncToServer: uploadToR2 OK, r2Url=', r2Url?.slice(0, 50), 'clientId=', f.id)
          addLog('  загружено в хранилище')
        }
        const inserted = await insertFile({ id: f.id, fileName: f.name, sizeBytes: f.size, contentType: f.type, r2Url, contentHash })
        pLog('syncToServer: insertFile result id=', inserted?.id ?? 'null', 'expected=', f.id, 'match=', inserted?.id === f.id)
        addLog(`  запись в базу: ${inserted?.id === f.id ? 'OK' : `⚠ id не совпал (ждали ${String(f.id).slice(0, 8)}, вернулся ${String(inserted?.id ?? 'null').slice(0, 8)})`}`)
        doneCount++
        result = result.map(x => x.id === f.id ? { ...x, status: 'synced', r2Url, localFile: null } : x)
        setFiles(result)
        if (lessonId) lfDelete(IDB_KEY(lessonId, f.id)).catch(() => {})
        break
      } catch (err) {
        pLog('syncToServer ERROR:', err.message)
        console.error('[lessonFiles] upload failed', f.name, 'попытка', attempt, err)
        addLog(`  ✗ ОШИБКА (попытка ${attempt}): ${err?.message ?? err}`)
        if (attempt < 2) await new Promise(r => setTimeout(r, 800))
      }
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

    addLog(`Готово: загружено ${doneCount} из ${toUpload.length}${doneCount < toUpload.length ? ` — не загрузилось ${toUpload.length - doneCount}, см. ошибки выше` : ''}`)
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

  return { files, syncing, uploadLog, hasUnsynced, pickFile, removeFile, syncToServer, fetchMissingFiles }
}
