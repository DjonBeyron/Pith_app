import { useRef } from 'react'
import AvatarCrop from '../../shared/ui/AvatarCrop.jsx'

export default function LessonSettingsTab({
  teacherName, onNameChange,
  teacherLogoUrl, onLogoPick,
  teacherLogoCrop, onCropChange,
  teacherMode, onTeacherModeChange,
  globalTeacher,
  videoAutoSound, onVideoAutoSoundChange,
}) {
  const fileInputRef = useRef(null)
  const isCustom = teacherMode === 'custom'

  function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    onLogoPick(file, URL.createObjectURL(file))
    e.target.value = ''
  }

  return (
    <div className="lessonSettings">
      <div className="lessonSettingsModes">
        <button
          className={`lessonSettingsMode${!isCustom ? ' lessonSettingsModeActive' : ''}`}
          onClick={() => onTeacherModeChange('global')}
        >Общий учитель</button>
        <button
          className={`lessonSettingsMode${isCustom ? ' lessonSettingsModeActive' : ''}`}
          onClick={() => onTeacherModeChange('custom')}
        >Свой учитель</button>
      </div>

      {!isCustom ? (
        <div className="lessonSettingsGlobal">
          <div className="lessonSettingsGlobalAvatar">
            {globalTeacher?.logo
              ? <img src={globalTeacher.logo} alt="" />
              : (globalTeacher?.name?.[0]?.toUpperCase() || 'У')}
          </div>
          <div className="lessonSettingsGlobalInfo">
            <span className="lessonSettingsGlobalName">{globalTeacher?.name || 'Учитель'}</span>
            <span className="lessonSettingsHint">
              Общий для всех уроков. Меняется в админке → вкладка «Учитель».
            </span>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}

      <div className="lessonSettingsRow">
        <span className="lessonSettingsLabel">Видео со звуком</span>
        <label className="lessonSettingsToggle">
          <input
            type="checkbox"
            checked={!!videoAutoSound}
            onChange={e => onVideoAutoSoundChange(e.target.checked)}
          />
          <span className="lessonSettingsToggleTrack" />
        </label>
      </div>
      <p className="lessonSettingsSaveNote lessonSettingsHint">
        Включено — видео автоматически воспроизводится со звуком один раз, затем без звука в цикле. Следующая нода появляется после первого просмотра.
      </p>
    </div>
  )
}
