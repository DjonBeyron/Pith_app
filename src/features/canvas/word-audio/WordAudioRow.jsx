// Строка слова в меню «Озвучка слов»: статус (✓ есть / — нет), само слово,
// в каких уроках встречается (вкладка «Все уроки»), кнопки: ▶ прослушать,
// 🔊 озвучить/перегенерировать, 📎 загрузить файл, ✕ удалить из базы.
// Ошибка последней операции — под словом, красным.
export default function WordAudioRow({
  item, row, lessons = null, error = null, generating = false, disabled = false,
  onPlay, onGenerate, onUpload, onDelete,
}) {
  const has = !!row
  return (
    <li className={`warRow${has ? ' warRowOk' : ' warRowMissing'}`}>
      <span className="warStatus" title={has ? `Озвучено (${row.source === 'upload' ? 'файл' : 'TTS'})` : 'Не озвучено'}>
        {generating ? '…' : has ? '✓' : '—'}
      </span>
      <span className="warBody">
        <span className="warText">{item.text}</span>
        {lessons && lessons.length > 0 && (
          <span className="warLessons" title={lessons.join(', ')}>{lessons.join(', ')}</span>
        )}
        {error && <span className="warError">{error}</span>}
      </span>
      <span className="warBtns">
        {has && <button className="warBtn" title="Прослушать" onClick={() => onPlay(row.url)}>▶</button>}
        <button className="warBtn" title={has ? 'Перегенерировать через ElevenLabs' : 'Озвучить через ElevenLabs'}
          disabled={disabled} onClick={() => onGenerate(item)}>🔊</button>
        <button className="warBtn" title="Загрузить свой файл" disabled={disabled}
          onClick={() => onUpload(item)}>📎</button>
        {has && (
          <button className="warBtn warBtnDel" title="Удалить из базы" disabled={disabled}
            onClick={() => onDelete(item.key)}>✕</button>
        )}
      </span>
    </li>
  )
}
