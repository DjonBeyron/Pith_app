import { useState } from 'react'
import { formatBytes } from '../../shared/lib/filesApi.js'
import LessonSettingsTab from './LessonSettingsTab.jsx'

const TYPE_LABEL = { audio: 'Голос', photo: 'Фото', video: 'Видео', circle: 'Видеосообщение', text: 'Текст' }

function getNodeUsage(fileId, nodes) {
  return (nodes ?? []).filter(n => n.typeData?.[n.type]?.file_id === fileId)
}

export default function LessonFilesPanel({
  files, nodes, syncing, hasUnsyncedLogo, onRemove, onClose,
  teacherName, onNameChange, teacherLogoUrl, onLogoPick,
  teacherLogoCrop, onCropChange,
  videoAutoSound, onVideoAutoSoundChange,
}) {
  const [tab, setTab] = useState('files')
  const pendingCount = files.filter(f => f.status === 'local' || f.status === 'toDelete').length
    + (hasUnsyncedLogo ? 1 : 0)

  return (
    <div className="lessonFilesPanel">
      <div className="lessonFilesPanelHead">
        <div className="lessonFilesTabs">
          <button
            className={`lessonFilesTab${tab === 'files' ? ' lessonFilesTabActive' : ''}`}
            onClick={() => setTab('files')}
          >Файлы</button>
          <button
            className={`lessonFilesTab${tab === 'settings' ? ' lessonFilesTabActive' : ''}`}
            onClick={() => setTab('settings')}
          >Настройки</button>
        </div>

        {/* Отдельной кнопки «Синхронизировать» больше нет — загрузка в R2
            теперь встроена в «Сохранить» (CanvasPage.handleSave), чтобы
            нельзя было случайно сохранить урок со старым/пустым r2Url файла.
            syncing/pendingCount ниже — просто индикатор состояния */}
        {tab === 'files' && pendingCount > 0 && (
          <span className="lessonFilesPending">
            {syncing ? 'Загружаю файлы…' : `Несохранённых файлов: ${pendingCount}`}
          </span>
        )}

        <button className="lessonFilesPanelClose" onClick={onClose}>×</button>
      </div>

      {tab === 'files' ? (
        <div className="lessonFilesList">
          {files.length === 0 && (
            <p className="lessonFilesEmpty">Нет файлов — выберите файл в ноде</p>
          )}
          {files.map(f => {
            const isDelete = f.status === 'toDelete'
            const dotClass = isDelete ? 'lessonFilesDotDelete'
              : f.status === 'synced' ? 'lessonFilesDotSynced' : 'lessonFilesDotLocal'
            const statusLabel = isDelete ? 'удалить' : f.status === 'synced' ? 'сервер' : 'локально'
            const statusClass = isDelete ? 'lessonFilesStatusDelete'
              : f.status === 'synced' ? 'lessonFilesStatusSynced' : 'lessonFilesStatusLocal'
            const usage = getNodeUsage(f.id, nodes)
            const usageText = usage.length
              ? usage.map(n => `#${n.seq} ${TYPE_LABEL[n.type] ?? n.type}`).join(', ')
              : '—'
            return (
              <div key={f.id} className={`lessonFilesRow${isDelete ? ' lessonFilesRowDelete' : ''}`}>
                <span className={`lessonFilesDot ${dotClass}`} />
                <span className="lessonFilesName" title={f.name}>{f.name}</span>
                <span className="lessonFilesNodeTag" title={usageText}>{usageText}</span>
                <span className="lessonFilesSize">{formatBytes(f.size)}</span>
                <span className={`lessonFilesStatus ${statusClass}`}>{statusLabel}</span>
                <button
                  className="lessonFilesDelBtn"
                  onClick={() => onRemove(f.id)}
                  title={isDelete ? 'Отменить удаление' : 'Удалить'}
                >
                  {isDelete ? '↺' : '×'}
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <LessonSettingsTab
          teacherName={teacherName}
          onNameChange={onNameChange}
          teacherLogoUrl={teacherLogoUrl}
          onLogoPick={onLogoPick}
          teacherLogoCrop={teacherLogoCrop}
          onCropChange={onCropChange}
          videoAutoSound={videoAutoSound}
          onVideoAutoSoundChange={onVideoAutoSoundChange}
        />
      )}
    </div>
  )
}
