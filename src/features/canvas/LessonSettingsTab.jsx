import { useRef } from 'react'
import AvatarCrop from './AvatarCrop.jsx'

export default function LessonSettingsTab({
  teacherName, onNameChange,
  teacherLogoUrl, onLogoPick,
  teacherLogoCrop, onCropChange,
}) {
  const fileInputRef = useRef(null)

  function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    onLogoPick(file, URL.createObjectURL(file))
    e.target.value = ''
  }

  return (
    <div className="lessonSettings">
      <div className="lessonSettingsRow">
        <span className="lessonSettingsLabel">Имя учителя</span>
        <input
          className="lessonSettingsInput"
          value={teacherName}
          onChange={e => onNameChange(e.target.value)}
          placeholder="Например: Анна"
        />
      </div>

      {teacherLogoUrl ? (
        <div className="lessonSettingsLogoSection">
          <div className="lessonSettingsLogoHeader">
            <span className="lessonSettingsLabel">Фото учителя</span>
            <button className="lessonSettingsLogoChangeBtn" onClick={() => fileInputRef.current?.click()}>
              изменить фото
            </button>
          </div>
          <AvatarCrop src={teacherLogoUrl} crop={teacherLogoCrop} onCropChange={onCropChange} />
        </div>
      ) : (
        <div className="lessonSettingsRow">
          <span className="lessonSettingsLabel">Фото учителя</span>
          <div className="lessonSettingsLogo" onClick={() => fileInputRef.current?.click()}>
            <span className="lessonSettingsLogoPlaceholder">{teacherName?.[0]?.toUpperCase() || 'У'}</span>
            <span className="lessonSettingsLogoHint">добавить</span>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleLogoChange}
      />

      <p className="lessonSettingsSaveNote">Фото загружается на сервер при нажатии «Сохранить»</p>
    </div>
  )
}
