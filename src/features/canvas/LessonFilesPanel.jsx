import { useState } from 'react'
import { formatBytes } from '../../shared/lib/filesApi.js'
import LessonSettingsTab from './LessonSettingsTab.jsx'

const TYPE_LABEL = { audio: 'Голос', photo: 'Фото', video: 'Видео', circle: 'Видеосообщение', text: 'Текст' }

function getNodeUsage(fileId, nodes) {
  return (nodes ?? []).filter(n => n.typeData?.[n.type]?.file_id === fileId)
}

export default function LessonFilesPanel({
  files, nodes, syncing, hasUnsyncedLogo, onRemove, onClose, problems = [], uploadLog = [], onResetFile,
  teacherName, onNameChange, teacherLogoUrl, onLogoPick,
  chatTitle, onChatTitleChange, lessonTitle,
  teacherLogoCrop, onCropChange,
  teacherMode, onTeacherModeChange, globalTeacher,
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
          {uploadLog.length > 0 && (
            <div className="lessonFilesLog">
              <div className="lessonFilesLogHead">
                <b>Журнал загрузки</b>
                <button onClick={() => { try { navigator.clipboard.writeText(uploadLog.join('\n')) } catch { /* буфер недоступен */ } }}>Копировать</button>
              </div>
              <textarea readOnly rows={Math.min(10, uploadLog.length + 1)} value={uploadLog.join('\n')} onFocus={e => e.target.select()} />
            </div>
          )}
          {problems.length > 0 && (
            <div className="lessonFilesProblems">
              <b>Нужно внимание: файл есть в ноде, но пользователь его не получит ({problems.length})</b>
              {problems.map(p => (
                <div key={p.nodeId} className="lessonFilesProblemRow">
                  <span>#{p.seq} {TYPE_LABEL[p.type] ?? p.type}: {p.reason}</span>
                  <button onClick={() => onResetFile?.(p.nodeId)} title="Убрать пустую ссылку на файл: ноду можно будет озвучить заново (⚡ Генерация)">Сбросить файл</button>
                </div>
              ))}
            </div>
          )}
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
          teacherMode={teacherMode}
          onTeacherModeChange={onTeacherModeChange}
          globalTeacher={globalTeacher}
          videoAutoSound={videoAutoSound}
          onVideoAutoSoundChange={onVideoAutoSoundChange}
          chatTitle={chatTitle}
          onChatTitleChange={onChatTitleChange}
          lessonTitle={lessonTitle}
        />
      )}
    </div>
  )
}
