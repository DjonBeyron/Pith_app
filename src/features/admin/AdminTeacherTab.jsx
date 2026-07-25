import { useState, useEffect, useRef } from 'react'
import AvatarCrop from '../../shared/ui/AvatarCrop.jsx'
import { getDefaultTeacher, saveDefaultTeacher } from '../../shared/api/appSettingsApi.js'
import { uploadToR2 } from '../../shared/lib/r2.js'

const DEFAULT_CROP = { x: 0, y: 0, scale: 1 }

// Админ-вкладка «Учитель»: общий учитель для всех уроков (app_settings →
// teacher_default). Урок может переопределить его своим — переключатель
// режима лежит в настройках урока (LessonSettingsTab).
export default function AdminTeacherTab() {
  const [name,    setName]    = useState('')
  const [logoUrl, setLogoUrl] = useState(null)  // серверный URL или blob-превью
  const [file,    setFile]    = useState(null)  // выбранный файл, ещё не в R2
  const [crop,    setCrop]    = useState(DEFAULT_CROP)
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState(false)
  const [status,  setStatus]  = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    getDefaultTeacher().then(t => {
      if (cancelled) return
      setName(t.name ?? '')
      setLogoUrl(t.logo ?? null)
      setCrop(t.crop ?? DEFAULT_CROP)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  function handleLogoChange(e) {
    const picked = e.target.files?.[0]
    if (!picked) return
    setFile(picked)
    setLogoUrl(URL.createObjectURL(picked))
    setStatus('')
    e.target.value = ''
  }

  function handleRemoveLogo() {
    setFile(null)
    setLogoUrl(null)
    setCrop(DEFAULT_CROP)
    setStatus('')
  }

  async function handleSave() {
    setBusy(true)
    setStatus('Сохраняю…')
    try {
      let url = logoUrl
      if (file) {
        setStatus('Загружаю фото…')
        url = await uploadToR2(file)
        setFile(null)
        setLogoUrl(url)
      }
      await saveDefaultTeacher({ name, logo: url, crop: url ? crop : null })
      setStatus('Сохранено — теперь так во всех уроках без своего учителя')
    } catch (e) {
      setStatus('Ошибка: ' + (e?.message ?? 'не удалось сохранить'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="atTeacher"><p className="atTeacherHint">Загрузка…</p></div>

  return (
    <div className="atTeacher">
      <p className="atTeacherHint">
        Этот учитель показывается в шапке чата во всех уроках. Отдельному уроку можно
        задать своего — в редакторе урока: ⚙ → «Настройки» → «Свой учитель».
      </p>

      <label className="atTeacherField">
        <span className="atTeacherLabel">Имя учителя</span>
        <input
          className="atTeacherInput"
          value={name}
          onChange={e => { setName(e.target.value); setStatus('') }}
          placeholder="Например: Анна"
        />
      </label>

      <div className="atTeacherField">
        <div className="atTeacherLogoHead">
          <span className="atTeacherLabel">Фото учителя</span>
          {logoUrl && (
            <span className="atTeacherLogoActions">
              <button className="atTeacherLinkBtn" onClick={() => fileInputRef.current?.click()}>изменить</button>
              <button className="atTeacherLinkBtn" onClick={handleRemoveLogo}>убрать</button>
            </span>
          )}
        </div>
        {logoUrl ? (
          <AvatarCrop src={logoUrl} crop={crop} onCropChange={setCrop} />
        ) : (
          <div className="atTeacherLogoEmpty" onClick={() => fileInputRef.current?.click()}>
            <span className="atTeacherLogoInitial">{name?.[0]?.toUpperCase() || 'У'}</span>
            <span>добавить фото</span>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleLogoChange}
      />

      <div className="atTeacherFooter">
        <button className="amCreateBtn" onClick={handleSave} disabled={busy}>
          {busy ? 'Сохраняю…' : 'Сохранить учителя'}
        </button>
        {status && <span className="atTeacherStatus">{status}</span>}
      </div>
    </div>
  )
}
