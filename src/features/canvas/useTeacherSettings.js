import { useState, useEffect, useRef } from 'react'
import { lfSave, lfGet, lfDelete } from '../../shared/lib/localFileStore.js'
import { uploadToR2 } from '../../shared/lib/r2.js'

const LS_KEY  = id => `lesson_teacher_${id}`        // name + crop + server URL
const IDB_KEY = id => `lesson_teacher_logo_${id}`   // File blob (unsaved pick)

// Persists teacher name, logo file and crop across page reloads.
// Pattern matches useLessonFiles: metadata in localStorage, File blobs in IndexedDB.
// Local data always wins over server data — applyServerData() is skipped when local exists.
export function useTeacherSettings(lessonId) {
  const [teacherName,     setTeacherName]     = useState('')
  const [teacherLogoUrl,  setTeacherLogoUrl]  = useState(null)
  const [teacherLogoFile, setTeacherLogoFile] = useState(null) // File if not yet uploaded
  const [teacherLogoCrop, setTeacherLogoCrop] = useState({ x: 0, y: 0, scale: 1 })
  const [videoAutoSound,  setVideoAutoSound]  = useState(false)

  const readyRef    = useRef(false) // true after local load finishes
  const hasLocalRef = useRef(false) // set synchronously when localStorage has data

  // ── Load on mount ────────────────────────────────────────────────
  useEffect(() => {
    readyRef.current = false
    hasLocalRef.current = false
    if (!lessonId) { readyRef.current = true; return }
    let cancelled = false

    const raw = localStorage.getItem(LS_KEY(lessonId))
    if (!raw) { readyRef.current = true; return }

    let saved
    try { saved = JSON.parse(raw) } catch { readyRef.current = true; return }

    // Mark synchronously so applyServerData() called from loadScript sees this first
    hasLocalRef.current = true

    lfGet(IDB_KEY(lessonId)).then(blob => {
      if (cancelled) return
      setTeacherName(saved.teacherName ?? '')
      setTeacherLogoCrop(saved.teacherLogoCrop ?? { x: 0, y: 0, scale: 1 })
      setVideoAutoSound(saved.videoAutoSound ?? false)
      if (blob) {
        // Unsaved local file — recreate blob URL
        setTeacherLogoFile(blob)
        setTeacherLogoUrl(URL.createObjectURL(blob))
      } else if (saved.teacherLogoUrl) {
        // Server URL previously saved after successful upload
        setTeacherLogoUrl(saved.teacherLogoUrl)
      }
      readyRef.current = true
    }).catch(() => {
      if (!cancelled) {
        setTeacherName(saved.teacherName ?? '')
        if (saved.teacherLogoUrl) setTeacherLogoUrl(saved.teacherLogoUrl)
        readyRef.current = true
      }
    })

    return () => { cancelled = true }
  }, [lessonId])

  // ── Autosave to localStorage (debounced, only after load) ────────
  useEffect(() => {
    if (!readyRef.current || !lessonId) return
    const t = setTimeout(() => {
      localStorage.setItem(LS_KEY(lessonId), JSON.stringify({
        teacherName,
        teacherLogoCrop,
        videoAutoSound,
        // blob URL dies on reload — only persist server URL
        teacherLogoUrl: teacherLogoFile ? null : teacherLogoUrl,
      }))
    }, 400)
    return () => clearTimeout(t)
  }, [lessonId, teacherName, teacherLogoCrop, teacherLogoUrl, teacherLogoFile, videoAutoSound])

  // ── API ──────────────────────────────────────────────────────────

  // Called from CanvasPage after loadScript. Ignored if local data exists.
  function applyServerData(script) {
    if (hasLocalRef.current) return
    setTeacherName(script?.teacherName ?? '')
    setTeacherLogoUrl(script?.teacherLogo ?? null)
    setTeacherLogoCrop(script?.teacherLogoCrop ?? { x: 0, y: 0, scale: 1 })
    setVideoAutoSound(script?.videoAutoSound ?? false)
  }

  // User picked a new logo file
  function handleLogoPick(file, blobUrl) {
    setTeacherLogoFile(file)
    setTeacherLogoUrl(blobUrl)
    if (lessonId) lfSave(IDB_KEY(lessonId), file).catch(console.error)
  }

  // Uploads logo if there's a pending File — used by both sync and save flows
  async function uploadLogoIfPending() {
    if (!teacherLogoFile) return
    const logoUrl = await uploadToR2(teacherLogoFile)
    setTeacherLogoUrl(logoUrl)
    setTeacherLogoFile(null)
    if (lessonId) lfDelete(IDB_KEY(lessonId)).catch(() => {})
  }

  // Called from CanvasPage.handleSave — uploads if pending, returns script fields
  async function prepareForSave() {
    let logoUrl = teacherLogoFile ? null : teacherLogoUrl
    if (teacherLogoFile) {
      logoUrl = await uploadToR2(teacherLogoFile)
      setTeacherLogoUrl(logoUrl)
      setTeacherLogoFile(null)
      if (lessonId) lfDelete(IDB_KEY(lessonId)).catch(() => {})
    }
    return {
      teacherName:     teacherName     || undefined,
      teacherLogo:     logoUrl         || undefined,
      teacherLogoCrop: logoUrl         ? teacherLogoCrop : undefined,
      videoAutoSound:  videoAutoSound  || undefined,
    }
  }

  return {
    teacherName,     setTeacherName,
    teacherLogoUrl,
    teacherLogoCrop, setTeacherLogoCrop,
    videoAutoSound,  setVideoAutoSound,
    hasUnsyncedLogo: !!teacherLogoFile,
    handleLogoPick,
    applyServerData,
    uploadLogoIfPending,
    prepareForSave,
  }
}
