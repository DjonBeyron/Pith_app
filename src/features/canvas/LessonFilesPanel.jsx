import { formatBytes } from '../../shared/lib/filesApi.js'

export default function LessonFilesPanel({ files, syncing, onSync, onRemove, onClose }) {
  const unsyncedCount = files.filter(f => f.status === 'local').length

  return (
    <div className="lessonFilesPanel">
      <div className="lessonFilesPanelHead">
        <span className="lessonFilesPanelTitle">Файлы урока</span>
        <button
          className="lessonFilesSyncBtn"
          onClick={onSync}
          disabled={syncing || unsyncedCount === 0}
        >
          {syncing ? 'Загружаю…' : `Синхронизировать${unsyncedCount ? ` (${unsyncedCount})` : ''}`}
        </button>
        <button className="lessonFilesPanelClose" onClick={onClose}>×</button>
      </div>

      <div className="lessonFilesList">
        {files.length === 0 && (
          <p className="lessonFilesEmpty">Нет файлов — выберите файл в ноде</p>
        )}
        {files.map(f => (
          <div key={f.id} className="lessonFilesRow">
            <span className={`lessonFilesDot ${f.status === 'synced' ? 'lessonFilesDotSynced' : 'lessonFilesDotLocal'}`} />
            <span className="lessonFilesName" title={f.name}>{f.name}</span>
            <span className="lessonFilesSize">{formatBytes(f.size)}</span>
            <span className={`lessonFilesStatus ${f.status === 'synced' ? 'lessonFilesStatusSynced' : 'lessonFilesStatusLocal'}`}>
              {f.status === 'synced' ? 'сервер' : 'локально'}
            </span>
            <button className="lessonFilesDelBtn" onClick={() => onRemove(f.id)}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}
