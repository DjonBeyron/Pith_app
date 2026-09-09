import { MapPin, Download, Trash2, Circle, Square } from 'lucide-react'

// Кнопки сбора улик: отметить элемент комментарием, записать сессию (rrweb),
// сохранить отчёт. Вынесены из DebugToolbar.jsx отдельным файлом — тот
// перерастал ориентир в 250 строк, а здесь своя ответственность: только сбор,
// без управления временем.
//
// Фрагмент, а не свой ряд: живут в том же ряду тулбара, что и кнопки времени.
export default function CaptureRow({
  commentMode, comments, recording,
  onToggleCommentMode, onClearComments, onToggleRecording, onSave,
}) {
  return (
    <>
      <span className="dbgToolbarDivider" />

      <button
        className={commentMode ? 'dbgToolbarMarkBtn dbgToolbarActive' : 'dbgToolbarMarkBtn'}
        onClick={onToggleCommentMode}
        title={commentMode ? 'Кликни на проблемный элемент' : 'Отметить элемент комментарием'}
      >
        <MapPin size={15} />
        {comments.length > 0 && <span className="dbgToolbarBadge">{comments.length}</span>}
      </button>
      {comments.length > 0 && (
        <button onClick={onClearComments} title="Очистить комментарии"><Trash2 size={14} /></button>
      )}
      <button
        className={recording ? 'dbgToolbarRecBtn dbgToolbarRecActive' : 'dbgToolbarRecBtn'}
        onClick={onToggleRecording}
        title={recording ? 'Остановить запись и сохранить в _debug/' : 'Записать сессию (rrweb) — потом её можно проиграть с перемоткой'}
      >
        {recording ? <Square size={13} /> : <Circle size={13} />}
      </button>
      <button className="dbgToolbarGenerate" onClick={onSave} title="Сохранить дебаг-отчёт в _debug/">
        <Download size={15} />
      </button>
    </>
  )
}
