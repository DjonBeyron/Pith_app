import { useState, useEffect, useRef } from 'react'
import { lfSave, lfGet, lfDelete } from '../../shared/lib/localFileStore.js'
import { uploadToR2 } from '../../shared/lib/r2.js'
import { getDefaultTeacher } from '../../shared/api/appSettingsApi.js'
import { EMPTY_TEACHER, teacherModeOf } from '../../shared/lib/teacherResolve.js'

const LS_KEY  = id => `lesson_teacher_${id}`        // name + crop + server URL
const IDB_KEY = id => `lesson_teacher_logo_${id}`   // File blob (unsaved pick)

// Persists teacher name, logo file and crop across page reloads.
// Pattern matches useLessonFiles: metadata in localStorage, File blobs in IndexedDB.
// Локальный черновик побеждает сервер по умолчанию (защита от потери
// несохранённых правок при случайной перезагрузке), но если он расходится
// с тем, что реально на сервере — applyServerData() спрашивает, а не молчит
// (см. differs ниже); clearDraft() чистит его после успешного сохранения.
export function useTeacherSettings(lessonId) {
  const [teacherName,     setTeacherName]     = useState('')
  const [teacherLogoUrl,  setTeacherLogoUrl]  = useState(null)
  const [teacherLogoFile, setTeacherLogoFile] = useState(null) // File if not yet uploaded
  const [teacherLogoCrop, setTeacherLogoCrop] = useState({ x: 0, y: 0, scale: 1 })
  const [videoAutoSound,  setVideoAutoSound]  = useState(false)
  // 'global' — общий учитель из app_settings, 'custom' — свой для этого урока
  const [teacherMode,     setTeacherMode]     = useState('global')
  const [globalTeacher,   setGlobalTeacher]   = useState(EMPTY_TEACHER)

  // Общий учитель нужен и для превью в настройках, и для плеера из редактора
  useEffect(() => {
    let cancelled = false
    getDefaultTeacher().then(t => { if (!cancelled) setGlobalTeacher(t) })
    return () => { cancelled = true }
  }, [])

  const readyRef      = useRef(false) // true after local load finishes
  const hasLocalRef    = useRef(false) // set synchronously when localStorage has data
  // Сырое содержимое черновика на момент монтирования — используется для
  // сверки с сервером в applyServerData ниже. Реальный React state (teacherName
  // и т.п.) заполняется асинхронно (после lfGet), поэтому сравнивать нужно
  // именно с этим снимком, а не с state, который к моменту вызова
  // applyServerData ещё может быть пустым
  const localDraftRef = useRef(null)

  // ── Load on mount ────────────────────────────────────────────────
  useEffect(() => {
    readyRef.current = false
    hasLocalRef.current = false
    localDraftRef.current = null
    if (!lessonId) { readyRef.current = true; return }
    let cancelled = false

    const raw = localStorage.getItem(LS_KEY(lessonId))
    if (!raw) { readyRef.current = true; return }

    let saved
    try { saved = JSON.parse(raw) } catch { readyRef.current = true; return }

    // Mark synchronously so applyServerData() called from loadScript sees this first
    hasLocalRef.current = true
    localDraftRef.current = saved

    lfGet(IDB_KEY(lessonId)).then(blob => {
      if (cancelled) return
      setTeacherName(saved.teacherName ?? '')
      setTeacherLogoCrop(saved.teacherLogoCrop ?? { x: 0, y: 0, scale: 1 })
      setVideoAutoSound(saved.videoAutoSound ?? false)
      setTeacherMode(saved.teacherMode === 'custom' ? 'custom' : 'global')
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
        setTeacherMode(saved.teacherMode === 'custom' ? 'custom' : 'global')
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
        teacherMode,
        // blob URL dies on reload — only persist server URL
        teacherLogoUrl: teacherLogoFile ? null : teacherLogoUrl,
      }))
    }, 400)
    return () => clearTimeout(t)
  }, [lessonId, teacherName, teacherLogoCrop, teacherLogoUrl, teacherLogoFile, videoAutoSound, teacherMode])

  // ── API ──────────────────────────────────────────────────────────

  // Called from CanvasPage after loadScript.
  function applyServerData(script) {
    const serverName = script?.teacherName ?? ''
    const serverLogo = script?.teacherLogo ?? null
    const serverCrop = script?.teacherLogoCrop ?? { x: 0, y: 0, scale: 1 }
    const serverSound = script?.videoAutoSound ?? false
    // Старые уроки поля teacherMode не имеют — режим выводится из наличия
    // своего имени/лого, чтобы у них ничего не поменялось (см. teacherResolve)
    const serverMode = teacherModeOf(script)

    if (!hasLocalRef.current) {
      setTeacherName(serverName)
      setTeacherLogoUrl(serverLogo)
      setTeacherLogoCrop(serverCrop)
      setVideoAutoSound(serverSound)
      setTeacherMode(serverMode)
      return
    }

    // Черновик в этом браузере есть — но он мог остаться от прошлой правки
    // (черновик никогда не чистился сам собой) и теперь молча прятать
    // изменения, сделанные с другого устройства. Сверяем со СНИМКОМ
    // черновика на момент монтирования (localDraftRef), а не с state —
    // state может быть ещё не заполнен (см. localDraftRef выше)
    const draft = localDraftRef.current ?? {}
    const draftMode = draft.teacherMode === 'custom' ? 'custom' : 'global'
    const differs = serverName !== (draft.teacherName ?? '')
      || serverLogo !== (draft.teacherLogoUrl ?? null)
      || serverMode !== draftMode
    if (!differs) return

    const useServer = window.confirm(
      'Настройки учителя на сервере отличаются от черновика в этом браузере ' +
      '(похоже, их поменяли в другом месте). Загрузить версию с сервера?'
    )
    if (!useServer) return
    setTeacherName(serverName)
    setTeacherLogoUrl(serverLogo)
    setTeacherLogoCrop(serverCrop)
    setVideoAutoSound(serverSound)
    setTeacherMode(serverMode)
    hasLocalRef.current = false
    localDraftRef.current = null
    localStorage.removeItem(LS_KEY(lessonId))
    lfDelete(IDB_KEY(lessonId)).catch(() => {})
  }

  // Черновик сделал своё дело — сохранён на сервере. Чистим, иначе он
  // навсегда прячет серверные правки, сделанные позже откуда-то ещё
  // (тот же самый баг, что был у ноды урока и у списка уроков модуля)
  function clearDraft() {
    if (!lessonId) return
    hasLocalRef.current = false
    localDraftRef.current = null
    localStorage.removeItem(LS_KEY(lessonId))
    lfDelete(IDB_KEY(lessonId)).catch(() => {})
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
    // teacherMode пишем всегда: без него урок со «своим» пустым учителем
    // при следующей загрузке был бы принят за 'global' (см. teacherModeOf).
    // Имя/лого сохраняем и в режиме 'global' — чтобы возврат к «своему»
    // учителю не терял уже настроенное.
    return {
      teacherMode,
      teacherName:     teacherName     || undefined,
      teacherLogo:     logoUrl         || undefined,
      teacherLogoCrop: logoUrl         ? teacherLogoCrop : undefined,
      videoAutoSound:  videoAutoSound  || undefined,
    }
  }

  // Кто реально будет в шапке плеера при текущем режиме — для превью урока
  const effectiveTeacher = teacherMode === 'custom'
    ? { name: teacherName, logo: teacherLogoUrl, crop: teacherLogoCrop }
    : globalTeacher

  return {
    teacherName,     setTeacherName,
    teacherLogoUrl,
    teacherLogoCrop, setTeacherLogoCrop,
    videoAutoSound,  setVideoAutoSound,
    teacherMode,     setTeacherMode,
    globalTeacher,
    effectiveTeacher,
    hasUnsyncedLogo: !!teacherLogoFile,
    handleLogoPick,
    applyServerData,
    uploadLogoIfPending,
    prepareForSave,
    clearDraft,
  }
}
